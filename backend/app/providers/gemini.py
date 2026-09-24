import base64
import mimetypes
import time
from pathlib import Path

from app.core.exceptions import ProviderError
from app.providers.base import VisionProvider, VisionRequest, VisionResponse


class GeminiProvider(VisionProvider):
    """Gemini generateContent REST 接口。"""

    name = "gemini"
    ENDPOINT_TPL = (
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    )
    PRICING: dict[str, tuple[float, float]] = {}

    def __init__(self, model: str, api_key: str):
        self.model = model
        self.api_key = api_key

    async def analyze(self, request: VisionRequest) -> VisionResponse:
        mime = mimetypes.guess_type(request.image_path)[0] or "image/jpeg"
        b64 = base64.b64encode(Path(request.image_path).read_bytes()).decode()
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": request.prompt},
                        {"inline_data": {"mime_type": mime, "data": b64}},
                    ]
                }
            ],
            "generationConfig": {"temperature": request.temperature},
        }
        started = time.monotonic()
        data = await self._post_with_retries(
            self.ENDPOINT_TPL.format(model=self.model),
            payload,
            {"x-goog-api-key": self.api_key},
        )
        latency_ms = int((time.monotonic() - started) * 1000)
        try:
            parts = data["candidates"][0]["content"]["parts"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError(f"响应格式异常: {exc}") from exc
        text = "".join(part.get("text", "") for part in parts)
        return VisionResponse(
            text=text,
            provider=self.name,
            model=self.model,
            latency_ms=latency_ms,
            raw=data,
        )

    def estimate_cost(self, input_tokens: int | None, output_tokens: int | None) -> float:
        rates = self.PRICING.get(self.model)
        if not rates or input_tokens is None or output_tokens is None:
            return 0.0
        return input_tokens / 1000 * rates[0] + output_tokens / 1000 * rates[1]
