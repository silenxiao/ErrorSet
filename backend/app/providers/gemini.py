import base64
import mimetypes
import time
from pathlib import Path

from app.core.exceptions import ProviderError
from app.providers.base import VisionProvider, VisionRequest, VisionResponse, serialize_user_content


class GeminiProvider(VisionProvider):
    """Gemini generateContent REST 接口。"""

    name = "gemini"
    ENDPOINT_TPL = (
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    )

    def __init__(self, model: str, api_key: str):
        self.model = model
        self.api_key = api_key

    async def analyze(self, request: VisionRequest) -> VisionResponse:
        mime = mimetypes.guess_type(request.image_path)[0] or "image/jpeg"
        b64 = base64.b64encode(Path(request.image_path).read_bytes()).decode()
        # 与 OpenAIProvider 同构：task_prompt + user_content 为新协议，
        # 缺省时回落到传统整段 prompt（Global/Local 识别路径）
        if request.task_prompt or request.user_content is not None:
            user_text = request.task_prompt
            if request.user_content is not None:
                user_text += "\n\n" + serialize_user_content(request.user_content)
        else:
            user_text = request.prompt
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": user_text},
                        {"inline_data": {"mime_type": mime, "data": b64}},
                    ]
                }
            ],
            "generationConfig": {"temperature": request.temperature},
        }
        if request.system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": request.system_prompt}]}
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
