from app.providers.openai import OpenAIProvider


class QwenProvider(OpenAIProvider):
    """Qwen-VL，走 DashScope 的 OpenAI 兼容接口。"""

    name = "qwen"
    endpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
