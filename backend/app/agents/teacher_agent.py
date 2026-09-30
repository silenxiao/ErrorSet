import json
import logging

from pydantic import ValidationError

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

        response = await self.provider.analyze(request)

        return self._parse_response(response.text)

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
            raise TeacherAgentError(
                "Teacher model returned invalid TeacherAnswer"
            ) from exc
