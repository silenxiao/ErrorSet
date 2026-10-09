"""Validator（§16）：JSON/题目/BBox/LaTeX 校验，并把层级 JSON 展平。"""

import re
import math
from dataclasses import dataclass, field

from app.core.exceptions import ValidationError


@dataclass
class NormalizedQuestion:
    question_no: str
    text: str
    bbox: list[int]
    ai_bbox: list[int]
    confidence: float | None
    illustrations: list[dict] = field(default_factory=list)
    parent_no: str | None = None
    subject: str = ""
    bbox_valid: bool = True
    issues: list[str] = field(default_factory=list)
    # 扁平列表中的父节点位置，不依赖可能重复的展示题号。
    parent_index: int | None = None


def to_int_bbox(raw: object) -> list[int] | None:
    """转换为合法的 [x1, y1, x2, y2]（0～1000 整数），不合法返回 None。"""
    if not isinstance(raw, (list, tuple)) or len(raw) != 4:
        return None
    try:
        x1, y1, x2, y2 = (round(float(v)) for v in raw)
    except (TypeError, ValueError, OverflowError):
        return None
    x1, y1 = max(0, min(1000, x1)), max(0, min(1000, y1))
    x2, y2 = max(0, min(1000, x2)), max(0, min(1000, y2))
    if x1 >= x2 or y1 >= y2:
        return None
    return [x1, y1, x2, y2]


def latex_paired(text: str) -> bool:
    """`$`/`$$` 是否成对（§16.4）：先剥掉 $$，剩余 $ 数量必须为偶数。"""
    return text.replace("$$", "").count("$") % 2 == 0


def bbox_area(bbox: list[int]) -> int:
    return max(0, bbox[2] - bbox[0]) * max(0, bbox[3] - bbox[1])


def bbox_iou(a: list[int], b: list[int]) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    if inter == 0:
        return 0.0
    union = bbox_area(a) + bbox_area(b) - inter
    return inter / union if union > 0 else 0.0


def normalize_global(raw: dict | list) -> list[NormalizedQuestion]:
    """校验 Global 输出并把大题/小题层级展平为列表（§8.1）。

    宽容处理：顶层为纯数组时自动包一层；question_no 兼容 "number" 字段名。
    """
    if isinstance(raw, list):
        raw = {"questions": raw}
    questions = raw.get("questions")
    if not isinstance(questions, list) or not questions:
        raise ValidationError("Global 输出缺少 questions 数组")

    result: list[NormalizedQuestion] = []
    seen: set[str] = set()

    def walk(node: object, parent_no: str | None, parent_index: int | None) -> None:
        if not isinstance(node, dict):
            raise ValidationError("questions 元素必须是题目对象")
        question_no = str(
            node.get("question_no") or node.get("number") or ""
        ).strip()
        text = node.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValidationError("题目 text 必须是非空字符串")
        raw_bbox = node.get("bbox")
        bbox = to_int_bbox(raw_bbox)

        issues: list[str] = []
        if not question_no:
            issues.append("missing_question_no")
        if bbox is None:
            issues.append("invalid_bbox")
            bbox = [0, 0, 0, 0]
        if not latex_paired(text):
            issues.append("latex_unpaired")
        if question_no and question_no in seen:
            issues.append("duplicate_question_no")
        seen.add(question_no)

        raw_illus = node.get("illustrations")
        if raw_illus is not None and not isinstance(raw_illus, list):
            raise ValidationError("illustrations 必须是数组")
        illustrations = []
        for illustration in raw_illus or []:
            if not isinstance(illustration, dict) or to_int_bbox(illustration.get("bbox")) is None:
                raise ValidationError("插图必须是包含有效 bbox 的对象")
            illustrations.append({**illustration, "bbox": to_int_bbox(illustration["bbox"])})

        subject = str(node.get("subject") or "").strip()
        if subject and subject not in {"语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "政治"}:
            raise ValidationError("题目 subject 不在支持的科目中")

        current_index = len(result)
        result.append(
            NormalizedQuestion(
                question_no=question_no,
                text=text,
                bbox=bbox,
                ai_bbox=list(bbox),
                confidence=_to_confidence(node.get("confidence")),
                illustrations=illustrations,
                parent_no=parent_no,
                parent_index=parent_index,
                subject=subject,
                bbox_valid="invalid_bbox" not in issues,
                issues=issues,
            )
        )
        children = node.get("sub_questions") or []
        if not isinstance(children, list):
            raise ValidationError("sub_questions 必须是数组")
        for sub in children:
            walk(sub, question_no or parent_no, current_index)

    for item in questions:
        walk(item, None, None)
    if not result:
        raise ValidationError("未识别到有效题目")
    return result


def _to_confidence(value: object) -> float | None:
    if isinstance(value, (int, float)):
        if isinstance(value, bool) or not 0 <= value <= 1 or not math.isfinite(value):
            raise ValidationError("confidence 必须是 0 到 1 的有限数字")
        return float(value)
    if value is not None:
        raise ValidationError("confidence 必须是数字或 null")
    return None


def normalize_code_fence_noise(text: str) -> str:
    """保留给测试使用：去除常见前导说明文字。"""
    return re.sub(r"^[^{\[]*", "", text)
