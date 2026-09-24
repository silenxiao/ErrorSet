"""Suspicious 判定（§17）：按 §16.5 默认阈值找出需要二次识别的题目。"""

from dataclasses import dataclass, field

from app.core.config import Settings
from app.pipeline.validator import NormalizedQuestion, bbox_area, bbox_iou, latex_paired


@dataclass
class SuspiciousMark:
    question_no: str
    reasons: list[str] = field(default_factory=list)


def find_suspicious(
    questions: list[NormalizedQuestion], settings: Settings
) -> list[SuspiciousMark]:
    marks: dict[str, SuspiciousMark] = {}

    def add(no: str, reason: str) -> None:
        marks.setdefault(no, SuspiciousMark(question_no=no)).reasons.append(reason)

    for q in questions:
        if q.confidence is not None and q.confidence < settings.low_confidence:
            add(q.question_no, "low_confidence")
        if len(q.text.strip()) < settings.min_text_chars:
            add(q.question_no, "short_text")
        if "latex_unpaired" in q.issues or not latex_paired(q.text):
            add(q.question_no, "latex_abnormal")
        if not q.bbox_valid:
            add(q.question_no, "invalid_bbox")
            continue
        ratio = bbox_area(q.bbox) / (1000 * 1000)
        if ratio < settings.min_bbox_area_ratio:
            add(q.question_no, "bbox_too_small")
        elif ratio > settings.max_bbox_area_ratio:
            add(q.question_no, "bbox_too_large")

    # 异常重叠：非父子关系的题目对 IoU 超阈值时双方都标记
    for i, a in enumerate(questions):
        if not a.bbox_valid:
            continue
        for b in questions[i + 1 :]:
            if not b.bbox_valid:
                continue
            if a.parent_no == b.question_no or b.parent_no == a.question_no:
                continue
            if bbox_iou(a.bbox, b.bbox) > settings.bbox_iou_threshold:
                add(a.question_no, "bbox_overlap")
                add(b.question_no, "bbox_overlap")

    return list(marks.values())
