"""Crop（§18）：按当前 bbox（0～1000）裁剪题目局部图，带 padding。"""

import uuid
from pathlib import Path

from PIL import Image

from app.core.logging import get_logger

logger = get_logger(__name__)


def crop_question(
    image_path: str,
    bbox: list[int],
    crops_dir: str,
    padding_ratio: float = 0.03,
) -> str:
    """把归一化 bbox 转成像素坐标，加 padding 后裁剪，返回裁剪图路径。"""
    x1, y1, x2, y2 = bbox
    if x1 >= x2 or y1 >= y2:
        raise ValueError(f"bbox 无效，无法裁剪: {bbox}")

    with Image.open(image_path) as im:
        width, height = im.size
        pad_x = (x2 - x1) / 1000 * width * padding_ratio
        pad_y = (y2 - y1) / 1000 * height * padding_ratio
        px1 = max(0, int(x1 / 1000 * width - pad_x))
        py1 = max(0, int(y1 / 1000 * height - pad_y))
        px2 = min(width, int(x2 / 1000 * width + pad_x))
        py2 = min(height, int(y2 / 1000 * height + pad_y))

        crop = im.convert("RGB").crop((px1, py1, px2, py2))
        out_path = Path(crops_dir) / f"{uuid.uuid4().hex}.png"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        crop.save(out_path, format="PNG")

    logger.info("裁剪题目图: %s bbox=%s -> %s", image_path, bbox, out_path)
    return str(out_path)
