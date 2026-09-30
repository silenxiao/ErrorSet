"""上传魔数识别与登录限流的单元测试。"""

import pytest

from app.core.exceptions import RateLimitError
from app.core.security import RateLimiter
from app.services.recognition_service import _sniff_image_format


def test_sniff_detects_real_image_headers():
    assert _sniff_image_format(b"\xff\xd8\xff\xe0" + b"\x00" * 10) == "jpg"
    assert _sniff_image_format(b"\x89PNG\r\n\x1a\n" + b"\x00" * 10) == "png"
    assert _sniff_image_format(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "webp"


def test_sniff_rejects_disguised_content():
    assert _sniff_image_format(b"<html><body></body></html>") is None
    assert _sniff_image_format(b"MZ\x90\x00\x03") is None  # PE 可执行文件头
    assert _sniff_image_format(b"") is None


def test_rate_limiter_blocks_after_window_overflow():
    limiter = RateLimiter(max_events=3, window_seconds=60)
    assert limiter.allow("k")
    assert limiter.allow("k")
    assert limiter.allow("k")
    with pytest.raises(Exception):
        # allow 返回 False，由调用方转成 RateLimitError
        assert limiter.allow("k"), "窗口内第 4 次应被拒绝"


def test_rate_limiter_keys_are_isolated_and_clearable():
    limiter = RateLimiter(max_events=1, window_seconds=60)
    assert limiter.allow("a")
    assert not limiter.allow("a")
    assert limiter.allow("b")  # 不同 key 互不影响

    limiter.clear("a")
    assert limiter.allow("a")  # 清空后重新允许


def test_rate_limit_error_maps_to_429():
    assert RateLimitError().status_code == 429
