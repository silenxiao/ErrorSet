from app.schemas.common import CamelModel


class ProviderSettingOut(CamelModel):
    """GET /api/v1/settings/provider。api_key 不回传，只告知是否已保存。"""

    provider: str
    base_url: str
    model: str
    has_api_key: bool


class ProviderSettingUpdate(CamelModel):
    """PUT /api/v1/settings/provider。api_key 留空表示保持不变。"""

    provider: str
    base_url: str = ""
    model: str = ""
    api_key: str = ""
