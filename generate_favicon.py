"""
ファビコン生成スクリプト（visual-designer スキル仕様書準拠）

仕様：
- 赤背景 + コイン（P）モチーフのオリジナルデザイン
- 楽天公式ロゴ・商標は不使用
- 出力：images/favicon.png（32×32px）、images/apple-touch-icon.png（180×180px）
"""

import os
from PIL import Image, ImageDraw, ImageFont

FONT_BOLD = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"

C_BG     = "#C0272D"   # 赤背景
C_GOLD   = "#F5C518"   # コイン色
C_WHITE  = "#FFFFFF"

OUT_DIR = os.path.join(os.path.dirname(__file__), "images")


def generate(size):
    img  = Image.new("RGB", (size, size), C_BG)
    draw = ImageDraw.Draw(img)

    # 背景を角丸風に見せるため四隅を背景色の丸で塗る（SVGの代替）
    # → PNGなので正方形のまま。ブラウザが角丸を当てる

    # コイン（金色の円）
    pad    = int(size * 0.12)
    coin_r = (size - pad * 2) // 2
    cx, cy = size // 2, size // 2
    # 影（少し下にずらした暗い円）
    shadow_offset = max(1, size // 32)
    draw.ellipse(
        [cx - coin_r + shadow_offset, cy - coin_r + shadow_offset,
         cx + coin_r + shadow_offset, cy + coin_r + shadow_offset],
        fill="#C8960A"
    )
    # コイン本体
    draw.ellipse(
        [cx - coin_r, cy - coin_r, cx + coin_r, cy + coin_r],
        fill=C_GOLD
    )

    # 「P」文字（ポイントを連想）
    font_size = max(8, int(size * 0.52))
    try:
        font = ImageFont.truetype(FONT_BOLD, font_size)
    except Exception:
        font = ImageFont.load_default()

    draw.text((cx, cy), "P", font=font, fill=C_WHITE, anchor="mm")

    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # 32×32px（ブラウザのファビコン）
    img32 = generate(32)
    path32 = os.path.join(OUT_DIR, "favicon.png")
    img32.save(path32)
    print(f"保存完了: {path32}")

    # 180×180px（Apple Touch Icon）
    img180 = generate(180)
    path180 = os.path.join(OUT_DIR, "apple-touch-icon.png")
    img180.save(path180)
    print(f"保存完了: {path180}")

    # ICOファイル（16×16・32×32を内包）
    img16  = generate(16)
    ico_path = os.path.join(OUT_DIR, "favicon.ico")
    img32.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32)])
    print(f"保存完了: {ico_path}")


if __name__ == "__main__":
    main()
