"""预处理（§5.2）：EXIF 方向校正 + 最长边限制，输出到 working/ 目录。"""

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class PreprocessResult:
    path: str
    width: int
    height: int


def processed_path_for(original_path: str, data_dir: str) -> Path:
    stem = Path(original_path).stem
    return Path(data_dir) / "working" / f"{stem}_processed.jpg"


def preprocess_image(original_path: str, data_dir: str) -> PreprocessResult:
    """EXIF 转正并缩放到最长边 ≤ max_image_side_px，返回处理后图片路径与尺寸。

    bbox 的 0～1000 归一化坐标统一相对这张处理后的图片。
    """
    settings = get_settings()
    out_path = processed_path_for(original_path, data_dir)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(original_path) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode != "RGB":
            im = im.convert("RGB")
        max_side = max(im.size)
        if max_side > settings.max_image_side_px:
            scale = settings.max_image_side_px / max_side
            im = im.resize(
                (round(im.width * scale), round(im.height * scale)),
                Image.LANCZOS,
            )
        im.save(out_path, format="JPEG", quality=92)
        width, height = im.size

    logger.info("预处理完成: %s (%sx%s)", out_path, width, height)
    return PreprocessResult(path=str(out_path), width=width, height=height)
