"""Global Vision 调用与 JSON 解析（§7/§30/§32）。"""

import json
import re
from collections.abc import Callable

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.exceptions import ProviderError
from app.prompts.global_question import (
    GLOBAL_PROMPT,
    NO_ILLUSTRATION_SUFFIX,
    USER_EXTRA_PROMPT_TEMPLATE,
)
from app.providers.base import VisionProvider, VisionRequest, VisionResponse

logger = get_logger(__name__)


def parse_json_text(raw_text: str) -> dict:
    """剥掉 markdown 围栏与前后杂质，解析出 JSON 对象。"""
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("输出中未找到 JSON 对象")
    parsed = json.loads(text[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("JSON 顶层不是对象")
    return parsed


async def recognize_global(
    provider: VisionProvider,
    image_path: str,
    on_call: Callable[[VisionResponse], None] | None = None,
    include_illustrations: bool = True,
    extra_prompt: str | None = None,
) -> dict:
    """调用 Global Vision，JSON 解析失败按 §32 重试，耗尽抛 ProviderError。

    on_call 在每次 API 调用成功返回后被调用，用于记录 RecognitionTask。
    include_illustrations=False 时提示模型跳过插图识别。
    extra_prompt 为用户补充的识别要求，拼在通用提示词之后。
    """
    settings = get_settings()
    prompt = GLOBAL_PROMPT
    if not include_illustrations:
        prompt += NO_ILLUSTRATION_SUFFIX
    if extra_prompt:
        prompt += USER_EXTRA_PROMPT_TEMPLATE.format(extra_prompt=extra_prompt.strip())
    last_error: Exception | None = None

    for attempt in range(settings.json_max_retries + 1):
        response = await provider.analyze(
            VisionRequest(image_path=image_path, prompt=prompt)
        )
        if on_call:
            on_call(response)
        try:
            return parse_json_text(response.text)
        except (ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            logger.warning(
                "Global JSON 解析失败（第 %s/%s 次）: %s",
                attempt + 1,
                settings.json_max_retries + 1,
                exc,
            )

    raise ProviderError(f"Global JSON 解析失败: {last_error}")
