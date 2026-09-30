"""Vision Provider 抽象（PROJECT_SPEC.md §21）。

业务逻辑只依赖 VisionProvider，不依赖任何厂商 SDK（原则 5）。
"""

import asyncio
import base64
import json
import mimetypes
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

import httpx

from app.core.config import get_settings
from app.core.exceptions import ProviderAuthError, ProviderError, ProviderTimeoutError
from app.core.logging import get_logger
from typing import Any

logger = get_logger(__name__)

# 进程级共享的 HTTP 客户端：所有 Provider 复用同一连接池，
# 避免每次调用（含每次重试）重新建连/TLS 握手。超时按请求单独传。
_shared_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None:
        _shared_client = httpx.AsyncClient()
    return _shared_client


async def close_http_client() -> None:
    """应用关闭时释放连接池；下次调用会按需重建。"""
    global _shared_client
    if _shared_client is not None:
        await _shared_client.aclose()
        _shared_client = None


@dataclass
class VisionRequest:
    image_path: str | None = None

    # Legacy: Global / Local Recognition 继续使用
    prompt: str = ""
    system_prompt: str = ""


    # TeacherAgent 新协议
    task_prompt: str = ""

    user_content: dict[str, Any] | str | None = None

    temperature: float = 0


@dataclass
class VisionResponse:
    text: str
    provider: str
    model: str
    latency_ms: int
    raw: dict | None = None


def image_data_url(image_path: str) -> str:
    mime = mimetypes.guess_type(image_path)[0] or "image/jpeg"
    data = Path(image_path).read_bytes()
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def usage_from_raw(provider: str, raw: dict | None) -> tuple[int | None, int | None]:
    """从 provider 原始响应提取 (input_tokens, output_tokens)。"""
    if not raw:
        return None, None
    if provider == "gemini":
        meta = raw.get("usageMetadata") or {}
        return meta.get("promptTokenCount"), meta.get("candidatesTokenCount")
    usage = raw.get("usage") or {}
    return usage.get("prompt_tokens"), usage.get("completion_tokens")

def serialize_user_content(
    content: dict[str, Any] | str | None,
) -> str:

    if content is None:
        return "<user_data />"

    if isinstance(content, str):
        payload = content
    else:
        payload = json.dumps(
            content,
            ensure_ascii=False,
            separators=(",", ":"),
        )

    return (
        "<user_data>\n"
        f"{payload}\n"
        "</user_data>"
    )

class VisionProvider(ABC):
    name: str = "base"
    # USD / 1K tokens：(input, output)。未知模型不计成本；子类按需填定价表。
    PRICING: dict[str, tuple[float, float]] = {}

    @abstractmethod
    async def analyze(self, request: VisionRequest) -> VisionResponse:
        """调用 Vision API 并返回纯文本结果。"""

    def estimate_cost(self, input_tokens: int | None, output_tokens: int | None) -> float:
        """按内置定价表估算成本（USD / §24），未知模型返回 0。"""
        rates = self.PRICING.get(self.model)
        if not rates or input_tokens is None or output_tokens is None:
            return 0.0
        return input_tokens / 1000 * rates[0] + output_tokens / 1000 * rates[1]

    async def _post_with_retries(
        self, endpoint: str, payload: dict, headers: dict
    ) -> dict:
        """统一重试策略（§32）：429 指数退避、网络/5xx 有限重试、认证错误不重试。"""
        settings = get_settings()
        base_delay = settings.retry_base_delay_seconds
        max_retries = settings.network_max_retries
        client = get_http_client()

        for attempt in range(max_retries + 1):
            try:
                resp = await client.post(
                    endpoint,
                    json=payload,
                    headers=headers,
                    timeout=settings.provider_timeout_seconds,
                )
            except httpx.TimeoutException as exc:
                # 超时已耗尽整个超时预算，重试只会再等同样久，直接失败并明示原因
                raise ProviderTimeoutError(
                    f"模型调用超时（{settings.provider_timeout_seconds} 秒无响应）"
                ) from exc
            except httpx.TransportError as exc:
                # 仅网络层错误重试；LocalProtocolError（如空 key）不重试
                if attempt >= max_retries:
                    raise ProviderError(
                        f"网络错误: {type(exc).__name__}: {exc}"
                    ) from exc
                delay = base_delay * (2**attempt)
                logger.warning(
                    "网络错误，%.1fs 后重试: %s: %s",
                    delay,
                    type(exc).__name__,
                    exc,
                )
                await asyncio.sleep(delay)
                continue

            if resp.status_code in (401, 403):
                raise ProviderAuthError(f"认证失败({resp.status_code})")
            if resp.status_code == 429:
                if attempt >= max_retries:
                    raise ProviderError("429 限流，重试耗尽")
                delay = base_delay * (2**attempt)
                logger.warning("429 限流，%.1fs 后重试", delay)
                await asyncio.sleep(delay)
                continue
            if resp.status_code >= 500:
                if attempt >= max_retries:
                    raise ProviderError(f"服务端错误 {resp.status_code}")
                await asyncio.sleep(base_delay * (2**attempt))
                continue
            if resp.status_code >= 400:
                raise ProviderError(
                    f"API 返回 {resp.status_code}: {resp.text[:500]}"
                )
            return resp.json()

        raise ProviderError("重试耗尽")

    async def _stream_with_retries(
        self, endpoint: str, payload: dict, headers: dict
    ) -> tuple[str, dict | None]:
        """流式调用 OpenAI 兼容接口（SSE），重试策略与 _post_with_retries 一致。

        长生成场景下流式响应持续有字节流动，可避免网关空闲超时。
        返回 (完整文本, usage)。
        """
        settings = get_settings()
        base_delay = settings.retry_base_delay_seconds
        max_retries = settings.network_max_retries
        stream_payload = {
            **payload,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        client = get_http_client()

        for attempt in range(max_retries + 1):
            try:
                async with client.stream(
                    "POST",
                    endpoint,
                    json=stream_payload,
                    headers=headers,
                    timeout=settings.provider_timeout_seconds,
                ) as resp:
                    if resp.status_code in (401, 403):
                        raise ProviderAuthError(f"认证失败({resp.status_code})")
                    if resp.status_code == 429:
                        if attempt >= max_retries:
                            raise ProviderError("429 限流，重试耗尽")
                        await asyncio.sleep(base_delay * (2**attempt))
                        continue
                    if resp.status_code >= 500:
                        if attempt >= max_retries:
                            raise ProviderError(f"服务端错误 {resp.status_code}")
                        await asyncio.sleep(base_delay * (2**attempt))
                        continue
                    if resp.status_code >= 400:
                        body = (await resp.aread()).decode(errors="replace")
                        raise ProviderError(
                            f"API 返回 {resp.status_code}: {body[:500]}"
                        )

                    parts: list[str] = []
                    usage: dict | None = None
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        if chunk.get("error"):
                            raise ProviderError(
                                f"流式返回错误: {chunk['error']}"
                            )
                        if chunk.get("usage"):
                            usage = chunk["usage"]
                        for choice in chunk.get("choices") or []:
                            content = (choice.get("delta") or {}).get("content")
                            if content:
                                parts.append(content)
                    return "".join(parts), usage
            except httpx.TimeoutException as exc:
                # 超时已耗尽整个超时预算，重试只会再等同样久，直接失败并明示原因
                raise ProviderTimeoutError(
                    f"模型调用超时（{settings.provider_timeout_seconds} 秒无响应）"
                ) from exc
            except httpx.TransportError as exc:
                if attempt >= max_retries:
                    raise ProviderError(
                        f"网络错误: {type(exc).__name__}: {exc}"
                    ) from exc
                delay = base_delay * (2**attempt)
                logger.warning(
                    "网络错误，%.1fs 后重试: %s: %s",
                    delay,
                    type(exc).__name__,
                    exc,
                )
                await asyncio.sleep(delay)
                continue

        raise ProviderError("重试耗尽")
