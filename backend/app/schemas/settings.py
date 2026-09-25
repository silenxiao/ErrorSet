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


class ModelProfileOut(CamelModel):
    """模型列表项。api_key 不回传，只告知是否已保存。"""

    id: int
    name: str
    provider: str
    base_url: str
    model: str
    has_api_key: bool
    enabled: bool


class ModelProfileCreate(CamelModel):
    """POST /api/v1/settings/models。"""

    name: str = ""
    provider: str
    base_url: str = ""
    model: str = ""
    api_key: str = ""
    enabled: bool = False


class ModelProfileUpdate(CamelModel):
    """PUT /api/v1/settings/models/{id}。api_key 留空表示保持不变。"""

    name: str = ""
    provider: str
    base_url: str = ""
    model: str = ""
    api_key: str = ""
