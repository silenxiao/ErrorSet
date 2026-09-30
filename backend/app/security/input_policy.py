import re
from dataclasses import dataclass


@dataclass(frozen=True)
class InputInspection:
    suspicious: bool
    matched_patterns: tuple[str, ...]


_PATTERNS = {
    "ignore_previous": re.compile(
        r"忽略.{0,30}(之前|上面|以前).{0,30}(指令|规则|提示)",
        re.IGNORECASE,
    ),
    "system_prompt": re.compile(
        r"(输出|显示|告诉我|泄露|打印).{0,30}"
        r"(system\s*prompt|系统提示词|系统指令)",
        re.IGNORECASE,
    ),
    "developer_prompt": re.compile(
        r"(developer\s*prompt|开发者指令|开发者提示词)",
        re.IGNORECASE,
    ),
    "role_override": re.compile(
        r"(你现在是|你不再是|改变你的身份|修改你的角色)",
        re.IGNORECASE,
    ),
    "instruction_override": re.compile(
        r"(新的系统指令|新的开发者指令|修改之前规则)",
        re.IGNORECASE,
    ),
}


def inspect_input(text: str) -> InputInspection:

    matched = tuple(
        name
        for name, pattern in _PATTERNS.items()
        if pattern.search(text or "")
    )

    return InputInspection(
        suspicious=bool(matched),
        matched_patterns=matched,
    )


def sanitize_user_text(text: str) -> str:
    # 仅做基础规范化，不删除“攻击关键词”。
    return text.strip()