from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """DB snake_case -> 前端 camelCase（§34）。"""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True
    )


class Message(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    detail: str
