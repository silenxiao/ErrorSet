import time

from app.core.exceptions import ProviderError
from app.providers.base import VisionProvider, VisionRequest, VisionResponse


class OpenAIProvider(VisionProvider):
    """OpenAI Chat Completions + 图片输入。"""

    name = "openai"
    endpoint = "https://api.openai.com/v1/chat/completions"
    # USD / 1K tokens：(input, output)。未知模型不计成本。
    PRICING: dict[str, tuple[float, float]] = {}

    def __init__(self, model: str, api_key: str):
        self.model = model
        self.api_key = api_key

    async def analyze(self, request: VisionRequest) -> VisionResponse:
        payload = {
            "model": self.model,
            "temperature": request.temperature,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": request.prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": self._image_url(request)},
                        },
                    ],
                }
            ],
        }
        started = time.monotonic()
        text, usage = await self._stream_with_retries(
            self.endpoint, payload, {"Authorization": f"Bearer {self.api_key}"}
        )
        latency_ms = int((time.monotonic() - started) * 1000)
        if not text:
            raise ProviderError("响应为空")
        return VisionResponse(
            text=text,
            provider=self.name,
            model=self.model,
            latency_ms=latency_ms,
            raw={"usage": usage} if usage else None,
        )

    def _image_url(self, request: VisionRequest) -> str:
        from app.providers.base import image_data_url

        return image_data_url(request.image_path)

    def estimate_cost(self, input_tokens: int | None, output_tokens: int | None) -> float:
        rates = self.PRICING.get(self.model)
        if not rates or input_tokens is None or output_tokens is None:
            return 0.0
        return input_tokens / 1000 * rates[0] + output_tokens / 1000 * rates[1]
