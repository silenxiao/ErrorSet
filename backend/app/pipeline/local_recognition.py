"""Local Vision 调用（§19）：单题局部图修正，输出 {question_no, text}。"""

import json
from collections.abc import Callable

from app.core.config import get_settings
from app.core.exceptions import ProviderError
from app.core.logging import get_logger
from app.pipeline.global_recognition import parse_json_text
from app.prompts.global_question import apply_user_extra_prompt
from app.prompts.local_question import LOCAL_PROMPT
from app.providers.base import VisionProvider, VisionRequest, VisionResponse

logger = get_logger(__name__)


async def recognize_local(
    provider: VisionProvider,
    image_path: str,
    on_call: Callable[[VisionResponse], None] | None = None,
    extra_prompt: str | None = None,
) -> dict:
    """调用 Local Vision，JSON 解析失败按 §32 重试，耗尽抛 ProviderError。

    返回形如 {"question_no": "3(1)", "text": "..."} 的字典；
    模型认为裁剪图不是完整题目时 text 为 None，由 Merger 决定丢弃。
    extra_prompt 为用户补充的识别要求，拼在通用提示词之后。
    """
    settings = get_settings()
    prompt = apply_user_extra_prompt(LOCAL_PROMPT, extra_prompt)
    last_error: Exception | None = None

    for attempt in range(settings.json_max_retries + 1):
        response = await provider.analyze(
            VisionRequest(image_path=image_path, prompt=prompt)
        )
        if on_call:
            on_call(response)
        try:
            parsed = parse_json_text(response.text)
            return {
                "question_no": parsed.get("question_no"),
                "text": parsed.get("text"),
            }
        except (ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            logger.warning(
                "Local JSON 解析失败（第 %s/%s 次）: %s",
                attempt + 1,
                settings.json_max_retries + 1,
                exc,
            )

    raise ProviderError(f"Local JSON 解析失败: {last_error}")
