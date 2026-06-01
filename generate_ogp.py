"""
OGP画像生成スクリプト（A案：お得感訴求）

出力: images/ogp.png（1200×630px）
"""

import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630

FONT_BOLD   = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
FONT_MEDIUM = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"

C_BG_TOP    = "#C0272D"
C_BG_BTM    = "#8B1A1A"
C_WHITE     = "#FFFFFF"
C_GOLD      = "#F5C518"
C_WHITE_SUB = "#FFDDDD"

OUT_DIR  = os.path.join(os.path.dirname(__file__), "images")
OUT_PATH = os.path.join(OUT_DIR, "ogp.png")


def vertical_gradient(img, top_color, bottom_color):
    draw = ImageDraw.Draw(img)
    tr, tg, tb = int(top_color[1:3], 16), int(top_color[3:5], 16), int(top_color[5:7], 16)
    br, bg, bb = int(bottom_color[1:3], 16), int(bottom_color[3:5], 16), int(bottom_color[5:7], 16)
    for y in range(H):
        r = int(tr + (br - tr) * y / H)
        g = int(tg + (bg - tg) * y / H)
        b = int(tb + (bb - tb) * y / H)
        draw.line([(0, y), (W, y)], fill=(r, g, b))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    img = Image.new("RGB", (W, H))
    vertical_gradient(img, C_BG_TOP, C_BG_BTM)
    draw = ImageDraw.Draw(img)

    # 装飾：左右の縦ライン（白半透明）
    for x in [60, W - 60]:
        draw.line([(x, 40), (x, H - 40)], fill=(255, 255, 255, 60), width=1)

    # 上部ラベル：「楽天の中の人のポイ活メディア」
    f_label = ImageFont.truetype(FONT_MEDIUM, 32)
    draw.text((W // 2, 72), "🏮 楽天の中の人のポイ活メディア",
              font=f_label, fill=C_WHITE_SUB, anchor="mm")

    # 区切り線
    draw.line([(100, 108), (W - 100, 108)], fill=(255, 255, 255, 80), width=1)

    # メインコピー上段
    f_sub = ImageFont.truetype(FONT_MEDIUM, 44)
    draw.text((W // 2, 200), "社員紹介リンクから申し込むと",
              font=f_sub, fill=C_WHITE, anchor="mm")

    # 大きい数字「14,000」（ゴールド）
    f_big = ImageFont.truetype(FONT_BOLD, 160)
    draw.text((W // 2, 370), "14,000",
              font=f_big, fill=C_GOLD, anchor="mm")

    # 単位
    f_unit = ImageFont.truetype(FONT_BOLD, 52)
    draw.text((W // 2, 480), "ポイントもらえます",
              font=f_unit, fill=C_WHITE, anchor="mm")

    # サブコピー
    f_catch = ImageFont.truetype(FONT_MEDIUM, 34)
    draw.text((W // 2, 548), "楽天カード持ちなら、損してるかも。",
              font=f_catch, fill=C_WHITE_SUB, anchor="mm")

    # 右下：「個人運営・非公式」ラベル
    f_note = ImageFont.truetype(FONT_MEDIUM, 24)
    note_text = "個人運営・非公式"
    bbox = draw.textbbox((0, 0), note_text, font=f_note)
    nw = bbox[2] - bbox[0] + 24
    nh = bbox[3] - bbox[1] + 12
    nx0 = W - nw - 24
    ny0 = H - nh - 24
    draw.rounded_rectangle([nx0, ny0, nx0 + nw, ny0 + nh],
                            radius=6, fill=(0, 0, 0, 100), outline=C_GOLD, width=1)
    draw.text((nx0 + nw // 2, ny0 + nh // 2), note_text,
              font=f_note, fill=C_GOLD, anchor="mm")

    img.save(OUT_PATH, quality=95)
    print(f"保存完了: {OUT_PATH}")


if __name__ == "__main__":
    main()
