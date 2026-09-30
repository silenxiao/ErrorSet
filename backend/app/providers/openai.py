import time

from app.core.exceptions import ProviderError
from app.providers.base import VisionProvider, VisionRequest, VisionResponse
from app.providers.base import serialize_user_content


class OpenAIProvider(VisionProvider):
    """OpenAI Chat Completions + 图片输入。"""

    name = "openai"
    endpoint = "https://api.openai.com/v1/chat/completions"

    def __init__(self, model: str, api_key: str):
        self.model = model
        self.api_key = api_key

    async def analyze(self, request: VisionRequest) -> VisionResponse:
        if request.task_prompt or request.user_content is not None:

            user_text = request.task_prompt

            if request.user_content is not None:
                user_text += "\n\n"
                user_text += serialize_user_content(
                    request.user_content
                )

        else:

            # Legacy recognition path
            user_text = request.prompt

        payload = {
            "model": self.model,
            "temperature": request.temperature,
            "messages": [
                {
                    "role": "system",
                    "content": request.system_prompt,
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": user_text,
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": self._image_url(request)
                            },
                        },
                    ],
                },
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
