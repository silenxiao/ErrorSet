"""Merger（§20）：Local 结果只修正内容，结构/题号/bbox 以 Global 为准。"""

from dataclasses import dataclass, field


@dataclass
class MergeOutcome:
    text: str
    used_local: bool
    warnings: list[str] = field(default_factory=list)


def merge(
    global_text: str,
    global_no: str,
    local: dict | None,
    local_error: str | None = None,
) -> MergeOutcome:
    """合并单题的 Local 修正结果。

    规则（§20 冲突规则）：
    - Local 失败或输出为空：保留 Global 结果
    - Local 题号与 Global 不一致：保留 Global 题号并记录警告
    - Local 认为不是完整题目（text 为空）：丢弃 Local 结果
    - bbox / 结构永远不动
    """
    if local_error or local is None:
        warning = f"local_failed: {local_error}" if local_error else "local_missing"
        return MergeOutcome(text=global_text, used_local=False, warnings=[warning])

    local_text = str(local.get("text") or "").strip()
    if not local_text:
        return MergeOutcome(
            text=global_text, used_local=False, warnings=["local_empty_discarded"]
        )

    warnings: list[str] = []
    local_no = local.get("question_no")
    if local_no is not None and str(local_no) != global_no:
        warnings.append(
            f"question_no_mismatch: global={global_no}, local={local_no}"
        )

    return MergeOutcome(text=local_text, used_local=True, warnings=warnings)
