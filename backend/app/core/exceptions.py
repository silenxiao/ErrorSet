class AppError(Exception):
    """业务错误基类。"""

    status_code = 400
    detail = "应用错误"

    def __init__(self, detail: str | None = None):
        if detail:
            self.detail = detail
        super().__init__(self.detail)


class NotFoundError(AppError):
    status_code = 404
    detail = "资源不存在"


class InvalidStateError(AppError):
    status_code = 409
    detail = "当前状态不允许该操作"


class ValidationError(AppError):
    status_code = 422
    detail = "参数校验失败"


class UploadError(AppError):
    status_code = 400
    detail = "上传文件不符合要求"


class AuthError(AppError):
    """未登录 / token 无效 / 账号密码错误。"""

    status_code = 401
    detail = "未登录或登录已过期"


class ProviderError(AppError):
    """Vision API 调用失败。"""

    status_code = 502
    detail = "Vision API 调用失败"


class ProviderAuthError(ProviderError):
    """API Key / 认证错误，不重试（§32）。"""

    detail = "Vision API 认证失败"
