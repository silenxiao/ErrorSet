# 重绘小程序 tabBar 图标：线性简约风格（2px 线条），与三端设计令牌一致。
# 未选中 #86909C，选中 #165DFF；81x81 输出，4x 超采样抗锯齿。
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "miniprogram", "assets", "icons")
INACTIVE = (134, 144, 156, 255)   # #86909C
ACTIVE = (22, 93, 255, 255)       # #165DFF
S = 4                              # 超采样倍数
SIZE = 81


def canvas():
    img = Image.new("RGBA", (SIZE * S, SIZE * S), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img), SIZE * S


def save(img, name):
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    img.save(os.path.join(OUT, name), "PNG")
    print("wrote", name)


def upload_icon(color):
    """试卷 tab：托盘 + 上箭头（Feather upload 简化直线版）"""
    img, d, W = canvas()
    w = 6 * S  # ≈ 2px @24 栅格
    u = W / 24.0
    # 托盘：U 形三段折线（左竖-底-右竖）
    d.line([(21 * u, 15 * u), (21 * u, 20 * u), (3 * u, 20 * u), (3 * u, 15 * u)],
           fill=color, width=w, joint="curve")
    # 箭头：斜线 + 竖线
    d.line([(16.6 * u, 8.4 * u), (12 * u, 3.6 * u), (7.4 * u, 8.4 * u)],
           fill=color, width=w, joint="curve")
    d.line([(12 * u, 4 * u), (12 * u, 15 * u)], fill=color, width=w)
    save(img, "exam.png" if color == INACTIVE else "exam-active.png")


def bank_icon(color):
    """错题库 tab：打开的书（中缝 + 左右页轮廓，简化直线版）"""
    img, d, W = canvas()
    w = 6 * S
    u = W / 24.0
    # 中缝
    d.line([(12 * u, 5 * u), (12 * u, 19.5 * u)], fill=color, width=w)
    # 左页：中缝顶部 → 左上 → 左下 → 回到中缝底部
    d.line([(12 * u, 5.5 * u), (4 * u, 4 * u), (4 * u, 17.5 * u), (12 * u, 19.5 * u)],
           fill=color, width=w, joint="curve")
    # 右页（镜像）
    d.line([(12 * u, 5.5 * u), (20 * u, 4 * u), (20 * u, 17.5 * u), (12 * u, 19.5 * u)],
           fill=color, width=w, joint="curve")
    save(img, "bank.png" if color == INACTIVE else "bank-active.png")


def mine_icon(color):
    """我的 tab：用户（圆头 + 肩线，Feather user）"""
    img, d, W = canvas()
    w = 6 * S
    u = W / 24.0
    # 头：circle cx=12 cy=8 r=3.6
    r = 3.6 * u
    cx, cy = 12 * u, 7.6 * u
    d.ellipse([(cx - r, cy - r), (cx + r, cy + r)], outline=color, width=w)
    # 肩：M20 21a8 8 0 0 0-16 0（上弧）
    d.arc([(4.5 * u, 12.5 * u), (19.5 * u, 27.5 * u)], 180, 360, fill=color, width=w)
    save(img, "mine.png" if color == INACTIVE else "mine-active.png")


if __name__ == "__main__":
    for fn in (upload_icon, bank_icon, mine_icon):
        fn(INACTIVE)
        fn(ACTIVE)
