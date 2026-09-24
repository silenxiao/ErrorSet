from app.providers.openai import OpenAIProvider


class ZhipuProvider(OpenAIProvider):
    """智谱 GLM，走 open.bigmodel.cn 的 OpenAI 兼容接口（§21/§22）。

    GLM-5.3-Flash 为原生多模态模型，图片以 data URL 形式放入 image_url，
    与 OpenAIProvider 的 payload 结构一致。
    """

    name = "zhipu"
    endpoint = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    PRICING: dict[str, tuple[float, float]] = {}
