"""模型端点校验：URL 规则和实际 TCP 连接的公网地址限制。"""
import socket
import time
import ipaddress
from urllib.parse import urlsplit

import anyio
import httpcore
import httpx

from app.core.exceptions import ValidationError


def is_public_address(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return False
    if not address.is_global or address.is_multicast or address.is_reserved:
        return False
    if isinstance(address, ipaddress.IPv6Address):
        # 过渡/转换地址可能把公网 IPv6 请求转送到非公网 IPv4。
        if address.is_site_local or address.teredo or address.sixtofour:
            return False
        if address.ipv4_mapped and not is_public_address(str(address.ipv4_mapped)):
            return False
        if any(address in ipaddress.ip_network(prefix) for prefix in
               ("64:ff9b::/96", "64:ff9b:1::/48")):
            return False
    return True


def validate_model_base_url(value: str) -> None:
    if any(ord(char) <= 32 or ord(char) == 127 for char in value) or "\\" in value:
        raise ValidationError("模型地址格式无效")
    try:
        url = urlsplit(value.strip())
        hostname = url.hostname
        port = url.port
    except ValueError as exc:
        raise ValidationError("模型地址格式无效") from exc
    if (
        url.scheme != "https"
        or not hostname
        or url.username is not None
        or url.password is not None
        or url.fragment
        or url.query
        or port not in (None, 443)
    ):
        raise ValidationError("模型地址必须是无凭据、无片段的公网 HTTPS URL")
    hostname = hostname.rstrip(".").lower()
    if (
        hostname in ("localhost", "localhost.localdomain")
        or hostname.endswith((".localhost", ".local", ".internal"))
        or ("." not in hostname and ":" not in hostname)
    ):
        raise ValidationError("模型地址不能指向内网主机")
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        return
    if not is_public_address(str(ip)):
        raise ValidationError("模型地址不能指向非公网 IP")


class PublicNetworkBackend(httpcore.AsyncNetworkBackend):
    """每次建连解析 DNS，只向本次校验过的 IP 建连，TLS 仍校验原始域名。"""

    def __init__(self, backend=None):
        self._backend = backend or httpcore.AnyIOBackend()

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        authority = f"[{host}]" if ":" in host else host
        validate_model_base_url(f"https://{authority}:{port}")
        started = time.monotonic()
        try:
            with anyio.fail_after(timeout):
                records = await anyio.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        except TimeoutError as exc:
            raise httpcore.ConnectTimeout("模型地址解析超时") from exc
        except OSError as exc:
            raise httpcore.ConnectError("模型地址解析失败") from exc
        addresses = list(dict.fromkeys(record[4][0] for record in records))
        if not addresses or any(not is_public_address(address) for address in addresses):
            raise ValidationError("模型地址解析到非公网 IP，已拒绝连接")
        # 下层只收到数字 IP，不能再次解析域名；消除校验与连接之间的 DNS 重绑定。
        for index, address in enumerate(addresses):
            remaining = None if timeout is None else timeout - (time.monotonic() - started)
            if remaining is not None and remaining <= 0:
                raise httpcore.ConnectTimeout("模型连接超时")
            try:
                return await self._backend.connect_tcp(
                    address, port, timeout=remaining, local_address=local_address,
                    socket_options=socket_options,
                )
            except httpcore.ConnectError:
                if index == len(addresses) - 1:
                    raise

    async def connect_unix_socket(self, *args, **kwargs):
        raise ValidationError("模型请求不允许 Unix socket")

    async def sleep(self, seconds):
        await anyio.sleep(seconds)


class PublicHTTPTransport(httpx.AsyncHTTPTransport):
    """将受限网络后端接入 HTTPX，保留其流式响应、超时映射和 TLS 行为。

    _pool 是 HTTPX 0.28 传输适配层的集成点；依赖固定在该版本系列。
    连接池按原始域名分区，Host 和 TLS SNI 不会被固定连接 IP 改写。
    """

    def __init__(self):
        self._pool = httpcore.AsyncConnectionPool(
            network_backend=PublicNetworkBackend(), max_connections=100,
            max_keepalive_connections=20, keepalive_expiry=5,
        )

    async def handle_async_request(self, request):
        validate_model_base_url(str(request.url))
        return await super().handle_async_request(request)
