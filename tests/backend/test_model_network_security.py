"""模型出站限制：DNS 校验必须约束真实连接，且保留原始 TLS/Host。"""
import socket

import anyio
import httpcore
import httpx
import pytest

from app.core.exceptions import ProviderError, ValidationError
from app.core.network_security import PublicHTTPTransport, PublicNetworkBackend, validate_model_base_url
from app.providers import base
from app.providers.factory import ProviderFactory
from app.providers.openai import OpenAIProvider


@pytest.mark.parametrize("url", [
    "http://example.com", "https://example.com:8443", "https://u:p@example.com",
    "https://example.com/#fragment", "https://example.com/?query=1",
    "https://localhost", "https://host.internal", "https://host.local",
    "https://127.0.0.1", "https://10.0.0.1", "https://169.254.169.254",
    "https://100.64.0.1", "https://0.0.0.0", "https://224.0.0.1",
    "https://[::1]", "https://[fc00::1]", "https://[fec0::1]",
    "https://[::ffff:127.0.0.1]", "https://[64:ff9b::7f00:1]",
    "https://example.com\\@127.0.0.1", "https://exa\nmple.com",
])
def test_invalid_model_urls(url):
    with pytest.raises(ValidationError):
        validate_model_base_url(url)


@pytest.mark.parametrize("url", ["https://example.com/v1", "https://8.8.8.8", "https://[2606:4700:4700::1111]"])
def test_public_urls(url):
    validate_model_base_url(url)


def dns_records(*addresses):
    return [(socket.AF_INET6 if ":" in ip else socket.AF_INET, socket.SOCK_STREAM,
             socket.IPPROTO_TCP, "", (ip, 443)) for ip in addresses]


class RecordingBackend(httpcore.AsyncMockBackend):
    def __init__(self, response=b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}"):
        super().__init__([response])
        self.hosts = []
        self.sni = []
        self.writes = []

    async def connect_tcp(self, host, port, **kwargs):
        self.hosts.append(host)
        stream = await super().connect_tcp(host, port, **kwargs)
        original_tls = stream.start_tls
        original_write = stream.write

        async def start_tls(ssl_context, server_hostname=None, timeout=None):
            self.sni.append(server_hostname)
            assert ssl_context.check_hostname
            return await original_tls(ssl_context, server_hostname, timeout)

        async def write(buffer, timeout=None):
            self.writes.append(buffer)
            return await original_write(buffer, timeout)

        stream.start_tls = start_tls
        stream.write = write
        return stream


@pytest.mark.asyncio
@pytest.mark.parametrize("addresses", [("127.0.0.1",), ("169.254.169.254",), ("8.8.8.8", "10.0.0.1"), ("::1",)])
async def test_dns_private_and_mixed_answers_never_connect(monkeypatch, addresses):
    async def resolve(*args, **kwargs):
        return dns_records(*addresses)

    monkeypatch.setattr(anyio, "getaddrinfo", resolve)
    backend = RecordingBackend()
    with pytest.raises(ValidationError):
        await PublicNetworkBackend(backend).connect_tcp("example.com", 443, timeout=1)
    assert not backend.hosts


@pytest.mark.asyncio
async def test_transport_pins_ip_and_preserves_host_tls_and_origin_pools(monkeypatch):
    resolutions = []

    async def resolve(host, *args, **kwargs):
        resolutions.append(host)
        return dns_records("8.8.8.8")

    monkeypatch.setattr(anyio, "getaddrinfo", resolve)
    backend = RecordingBackend()
    transport = PublicHTTPTransport()
    transport._pool = httpcore.AsyncConnectionPool(network_backend=PublicNetworkBackend(backend))
    async with httpx.AsyncClient(transport=transport, trust_env=False) as client:
        for host in ("first.example.com", "second.example.com"):
            result = await client.post(f"https://{host}/v1", json={})
            assert result.json() == {}
    assert backend.hosts == ["8.8.8.8", "8.8.8.8"]
    assert backend.sni == ["first.example.com", "second.example.com"]
    assert resolutions == backend.sni
    assert b"Host: first.example.com" in b"".join(backend.writes)
    assert b"Host: second.example.com" in b"".join(backend.writes)


@pytest.mark.asyncio
async def test_dns_rebinding_on_next_connection_is_rejected(monkeypatch):
    answers = iter([dns_records("8.8.8.8"), dns_records("127.0.0.1")])

    async def resolve(*args, **kwargs):
        return next(answers)

    monkeypatch.setattr(anyio, "getaddrinfo", resolve)
    backend = RecordingBackend()
    guarded = PublicNetworkBackend(backend)
    stream = await guarded.connect_tcp("example.com", 443)
    await stream.aclose()
    with pytest.raises(ValidationError):
        await guarded.connect_tcp("example.com", 443)
    assert backend.hosts == ["8.8.8.8"]


@pytest.mark.asyncio
async def test_dns_errors_are_network_errors(monkeypatch):
    async def resolve(*args, **kwargs):
        raise socket.gaierror("no such host")

    monkeypatch.setattr(anyio, "getaddrinfo", resolve)
    with pytest.raises(httpcore.ConnectError, match="解析失败"):
        await PublicNetworkBackend().connect_tcp("example.com", 443)


@pytest.mark.asyncio
async def test_dns_timeout_stays_within_connect_budget(monkeypatch):
    async def resolve(*args, **kwargs):
        await anyio.sleep(1)
        return dns_records("8.8.8.8")

    monkeypatch.setattr(anyio, "getaddrinfo", resolve)
    backend = RecordingBackend()
    with pytest.raises(httpcore.ConnectTimeout):
        await PublicNetworkBackend(backend).connect_tcp("example.com", 443, timeout=0.01)
    assert not backend.hosts


@pytest.mark.asyncio
async def test_streaming_success_through_guarded_transport(monkeypatch):
    async def resolve(*args, **kwargs):
        return dns_records("8.8.8.8")

    monkeypatch.setattr(anyio, "getaddrinfo", resolve)
    body = b'data: {"choices":[{"delta":{"content":"OK"}}],"usage":{"total_tokens":3}}\n\ndata: [DONE]\n\n'
    response = b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body
    backend = RecordingBackend(response)
    transport = PublicHTTPTransport()
    transport._pool = httpcore.AsyncConnectionPool(network_backend=PublicNetworkBackend(backend))
    async with httpx.AsyncClient(transport=transport, trust_env=False) as client:
        monkeypatch.setattr(base, "get_http_client", lambda: client)
        result = await OpenAIProvider("test", "test")._stream_with_retries("https://example.com/v1", {}, {})
    assert result == ("OK", {"total_tokens": 3})
    assert backend.sni == ["example.com"]


@pytest.mark.asyncio
async def test_shared_client_disables_proxy_environment_and_redirects(monkeypatch):
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:8888")
    monkeypatch.setattr(base, "_shared_client", None)
    client = base.get_http_client()
    try:
        assert client.trust_env is False
        assert client.follow_redirects is False
    finally:
        await base.close_http_client()


@pytest.mark.asyncio
@pytest.mark.parametrize("streaming", [False, True])
async def test_redirect_is_rejected_without_following(monkeypatch, streaming):
    calls = []

    def respond(request):
        calls.append(request.url)
        return httpx.Response(302, headers={"Location": "http://127.0.0.1/private"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond), follow_redirects=False) as client:
        monkeypatch.setattr(base, "get_http_client", lambda: client)
        provider = OpenAIProvider("test", "test")
        call = provider._stream_with_retries if streaming else provider._post_with_retries
        with pytest.raises(ProviderError, match="重定向"):
            await call("https://example.com/v1", {}, {})
    assert len(calls) == 1


def test_stored_unsafe_url_revalidated_when_provider_is_built():
    with pytest.raises(ValidationError):
        ProviderFactory.create("custom", "test", api_key="test", base_url="https://127.0.0.1")


@pytest.mark.asyncio
async def test_unsafe_runtime_url_is_rejected_before_network():
    async with httpx.AsyncClient(transport=PublicHTTPTransport(), trust_env=False) as client:
        with pytest.raises(ValidationError):
            await client.post("http://127.0.0.1/private", json={})
