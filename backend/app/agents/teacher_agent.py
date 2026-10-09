import json
import logging

from pydantic import ValidationError
from app.core.config import get_settings

from app.prompts.teacher.system import TEACHER_SYSTEM_PROMPT
from app.prompts.teacher.task import TEACHER_TASK_PROMPT
from app.schemas.teacher import TeacherAnswer, TeacherQuestion
from app.security.input_policy import (
    inspect_input,
    sanitize_user_text,
)

logger = logging.getLogger(__name__)


class TeacherAgentError(Exception):
    """TeacherAgent 统一异常。"""


class TeacherAgent:
    """把一道题交给 Vision 模型，返回结构化的 TeacherAnswer。

    学生可见内容全部视为不可信数据：先经 input_policy 清洗与检测，
    再以 task_prompt + <user_data> 形式下发，输出按 pydantic 校验。
    """

    def __init__(self, provider):
        self.provider = provider

    async def answer(
        self,
        question: TeacherQuestion,
    ) -> TeacherAnswer:

        question = question.model_copy(
            update={
                "text": sanitize_user_text(question.text),
                "user_context": (
                    sanitize_user_text(question.user_context)
                    if question.user_context
                    else None
                ),
            }
        )

        inspection = inspect_input(question.text)

        if inspection.suspicious:
            logger.info(
                "teacher input matched patterns=%s",
                inspection.matched_patterns,
            )

        request = self._build_request(question)

        original_task = request.task_prompt
        for attempt in range(get_settings().json_max_retries + 1):
            response = await self.provider.analyze(request)
            try:
                return self._parse_response(response.text)
            except TeacherAgentError as exc:
                if attempt >= get_settings().json_max_retries:
                    raise
                request.task_prompt = original_task + f"\n上次输出未通过校验：{exc}。请重新解题并输出符合结构的完整 JSON。"
        raise TeacherAgentError("分析重试耗尽")

    @staticmethod
    def _build_request(
        question: TeacherQuestion,
    ):
        from app.providers.base import VisionRequest

        if not question.image_path:
            # Provider 接口目前是视觉专用的：必须给一张图（无插图题目由
            # 服务层提供占位白图），避免 openai 系 provider 读图时崩溃。
            raise TeacherAgentError("缺少题目图片，无法调用视觉模型")

        user_data = {
            "grade": question.grade,
            "subject": question.subject,
            "question_text": question.text,
            "user_context": question.user_context,
        }

        return VisionRequest(
            image_path=question.image_path,
            system_prompt=TEACHER_SYSTEM_PROMPT,
            task_prompt=TEACHER_TASK_PROMPT,
            user_content=user_data,
            temperature=0,
        )

    @staticmethod
    def _parse_response(text: str) -> TeacherAnswer:

        cleaned = text.strip()

        if cleaned.startswith("```"):
            cleaned = cleaned.removeprefix("```json")
            cleaned = cleaned.removeprefix("```")
            cleaned = cleaned.removesuffix("```")
            cleaned = cleaned.strip()

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise TeacherAgentError(
                "Teacher model returned invalid JSON"
            ) from exc

        try:
            return TeacherAnswer.model_validate(data)
        except ValidationError as exc:
            fields = ", ".join(
                str(error["loc"][0]) if error["loc"] and error["loc"][0] in TeacherAnswer.model_fields else "额外或无效字段"
                for error in exc.errors(include_input=False)
            )[:300]
            raise TeacherAgentError(
                f"分析字段校验失败：{fields}；科目须为指定值，答案和分析须非空，知识点数组、范围标记与置信度须完整"
            ) from exc
