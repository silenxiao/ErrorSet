"""一次性冒烟脚本：用真实图片走 Global 识别全链路（不入库）。"""

import asyncio
import sys

sys.path.insert(0, ".")

from app.core.config import get_settings
from app.pipeline.global_recognition import parse_json_text, recognize_global
from app.pipeline.preprocess import preprocess_image
from app.pipeline.validator import normalize_global
from app.prompts.global_question import GLOBAL_PROMPT
from app.providers.base import VisionRequest
from app.providers.factory import ProviderFactory


async def main() -> None:
    settings = get_settings()
    image = sys.argv[1]
    processed = preprocess_image(image, settings.data_dir)
    print(f"预处理: {processed.path} ({processed.width}x{processed.height})")

    provider = ProviderFactory.create(settings.global_provider, settings.global_model)
    print(f"调用 {provider.name} / {settings.global_model} ...")

    response = await provider.analyze(
        VisionRequest(image_path=processed.path, prompt=GLOBAL_PROMPT)
    )
    print(f"延迟: {response.latency_ms}ms, 原始文本长度: {len(response.text)}")
    print("--- 原始返回 ---")
    print(response.text)
    print("--- 解析结果 ---")

    parsed = parse_json_text(response.text)
    questions = normalize_global(parsed)
    print(f"识别出 {len(questions)} 道题:")
    for q in questions:
        print(
            f"  [{q.question_no}] parent={q.parent_no} conf={q.confidence} "
            f"bbox={q.bbox} issues={q.issues}"
        )
        print(f"    {q.text[:60]}{'...' if len(q.text) > 60 else ''}")


asyncio.run(main())
