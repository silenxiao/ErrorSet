"""已校验归属的题目响应：给插图附加专用图片签名。"""
from app.core.media_access import signed_illustration_url
from app.schemas.question import IllustrationOut, QuestionOut


def illustration_out(row, viewer_id: int) -> IllustrationOut:
    out = IllustrationOut.model_validate(row)
    out.image_url = signed_illustration_url(out.id, viewer_id=viewer_id)
    return out


def question_out(row, viewer_id: int) -> QuestionOut:
    out = QuestionOut.model_validate(row)
    out.illustrations = [illustration_out(item, viewer_id) for item in row.illustrations]
    return out
