from app.providers.openai import OpenAIProvider


class AMDProvider(OpenAIProvider):
    """AMD 开发者平台（Radeon AI），OpenAI 兼容接口。

    DeepSeek-V4.1-Flash 等多模态模型，图片以 data URL 放入 image_url，
    payload 结构与 OpenAIProvider 一致。
    """

    name = "amd"
    endpoint = "https://developer.amd.com.cn/radeon/api/v1/chat/completions"
    PRICING: dict[str, tuple[float, float]] = {}
