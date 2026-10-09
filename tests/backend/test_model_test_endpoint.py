"""模型连通性测试的回归测试。

背景：两端客户端（小程序 / mobile）新增了「测试」按钮，直接消费
test_model_profile 的返回结构 {ok, latencyMs?, error?}。

同时修掉一个缺陷：Provider 层异常（如缺 API Key 的 ProviderAuthError）
继承自 AppError 而非 ValidationError/ValueError，原先会穿透本函数导致
接口 500，而不是返回「不可用 + 原因」。
"""

import asyncio

import pytest

from app.database.models import ModelProfile
from app.services import settings_service


def _profile(**kwargs) -> ModelProfile:
    base = {"provider": "deepseek", "model": "deepseek-chat", "api_key": "k", "base_url": ""}
    base.update(kwargs)
    return ModelProfile(**base)


def test_unknown_provider_returns_unavailable() -> None:
    """服务商名非法：返回 ok=False + error，不抛异常。"""
    res = asyncio.run(settings_service.test_model_profile(_profile(provider="nope")))
    assert res["ok"] is False
    assert res["error"]


def test_missing_api_key_returns_unavailable_not_raise() -> None:
    """缺 API Key 抛的是 ProviderAuthError（非 ValidationError），必须被接住。

    这是接口 500 的回归点：一旦有人把 except 收窄回 ValueError，本测试会失败。
    """
    res = asyncio.run(settings_service.test_model_profile(_profile(api_key="")))
    assert res["ok"] is False
    assert res["error"], "缺 Key 时应给出可读原因"


def test_blank_provider_returns_unavailable() -> None:
    """服务商留空：走 ValidationError 分支，同样返回结果而非抛出。"""
    res = asyncio.run(settings_service.test_model_profile(_profile(provider="   ")))
    assert res["ok"] is False
    assert res["error"]


def test_success_path_reports_latency(monkeypatch: pytest.MonkeyPatch) -> None:
    """成功路径必须回传 latencyMs——客户端用它展示「延迟多少 ms」。"""

    class FakeResp:
        latency_ms = 321
        text = '{"expression":"7 + 5 = ?","answer":12}'

    class FakeProvider:
        async def analyze(self, request):  # noqa: ANN001, ANN201
            return FakeResp()

    monkeypatch.setattr(
        settings_service, "_build_provider", lambda *a, **k: FakeProvider()
    )
    res = asyncio.run(settings_service.test_model_profile(_profile()))
    assert res == {"ok": True, "latencyMs": 321}


def test_analyze_failure_reports_error_with_latency(monkeypatch: pytest.MonkeyPatch) -> None:
    """调用阶段失败：返回 ok=False + error，并附带已耗时 latencyMs。"""

    class BoomProvider:
        async def analyze(self, request):  # noqa: ANN001, ANN201
            raise RuntimeError("endpoint unreachable")

    monkeypatch.setattr(
        settings_service, "_build_provider", lambda *a, **k: BoomProvider()
    )
    res = asyncio.run(settings_service.test_model_profile(_profile()))
    assert res["ok"] is False
    assert res["error"] == "endpoint unreachable"
    assert isinstance(res["latencyMs"], int)
