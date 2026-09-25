"""Global Vision Prompt（PROJECT_SPEC.md §31）。"""

PROMPT_VERSION = "global-v4"

_GLOBAL_SCHEMA_EXAMPLE = """\
输出 JSON 顶层必须是对象，包含 questions 数组，字段名必须完全一致。
questions 数组中的每个元素就是一道完整的题，不允许嵌套：

{
  "questions": [
    {
      "question_no": "3",
      "text": "大题题干、共享材料与所有小题的完整内容（保留 3(1)、3(2) 等小题编号）",
      "subject": "数学",
      "bbox": [x1, y1, x2, y2],
      "illustrations": [{"bbox": [x1, y1, x2, y2], "type": "geometry"}],
      "confidence": 0.95
    }
  ]
}
"""

GLOBAL_PROMPT = f"""\
仔细识别这张试卷/作业照片中的所有题目。

必须识别整张图片中的每一道独立小题，
包括大题下面的所有小题。

要求：

1. text 是题目的完整干净原文。
2. 不包含学生手写答案。
3. 不包含老师红笔批改。
4. 选择题必须保留全部选项。
5. 数学公式使用 LaTeX。
6. bbox 使用 [x1,y1,x2,y2]。
7. 坐标范围为 0-1000。
8. bbox 必须覆盖完整题目。
9. illustrations 记录题目中的插图、图形、表格等。
10. 没有插图时返回空数组。
11. 大题必须与其所有小题合并为一道题输出：
    text 完整包含大题题干、共享材料和全部小题（保留小题编号如 3(1)），
    question_no 使用大题编号，bbox 覆盖整道大题。
12. 不要把大题拆分成多道题，不要输出 sub_questions 字段。
13. subject 是这道题所属科目的判断结果，
    只能是：数学、语文、英语、物理、化学、生物、历史、地理、政治 之一。
14. 只输出 JSON。
15. 不要输出任何其他文字。

{_GLOBAL_SCHEMA_EXAMPLE}
"""

# 上传时声明"不包含插图"时追加，跳过插图识别（§31 变体）
NO_ILLUSTRATION_SUFFIX = """
注意：这份试卷没有插图。所有题目的 illustrations 一律返回空数组，
不要花精力识别图形区域。
"""

# 用户在"重新识别"时填写的补充要求，拼在通用规则之后（Global/Local 两段共用）
USER_EXTRA_PROMPT_TEMPLATE = """

用户补充要求（优先于上面与之冲突的通用规则，但不得改变 JSON 输出格式与字段名）：
{extra_prompt}
"""
