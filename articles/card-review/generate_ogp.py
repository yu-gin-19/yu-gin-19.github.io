"""
OGP画像生成スクリプト（card-review記事用）
既存記事（demerits / fit-check / savings-calc）のOGPパターンを踏襲：
- 背景：左ピンク→右ブラックの斜め方向グラデーション＋ダイヤ格子の装飾線
- 右側：キャラクター（sns/images/character.png）を配置
- 左側：サイト名ラベル・見出し2行・カテゴリバッジ
- 右下：「個人運営・非公式」の注記バッジ

出力: OGP_card-review.png（1200×630px）
"""

import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630

FONT_BOLD = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
FONT_MEDIUM = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"

COLOR_PINK = (255, 0, 140)     # var(--color-primary) 相当
COLOR_BLACK = (28, 28, 28)
COLOR_WHITE = (255, 255, 255)
COLOR_WHITE_SUB = (255, 221, 221)
COLOR_ACCENT = (245, 197, 24)

BASE_DIR = os.path.dirname(__file__)
CHAR_PATH = os.path.join(BASE_DIR, "..", "..", "sns", "images", "character.png")
OUT_PATH = os.path.join(BASE_DIR, "OGP_card-review.png")


def diagonal_gradient(img):
    """左上=ピンク、右下=ブラックの斜めグラデーション（既存OGPの再現）。"""
    draw = ImageDraw.Draw(img)
    for y in range(H):
        for_x_ratio_start = y / H
        # 行ごとに左右のグラデーションを計算（斜め表現のため列方向にも減衰させる）
        pass
    # 効率化のため、対角線距離に基づくグラデーションを計算
    import math
    max_dist = math.hypot(W, H)
    px = img.load()
    for y in range(H):
        for x in range(0, W, 2):
            dist = math.hypot(x, y) / max_dist
            r = int(COLOR_PINK[0] + (COLOR_BLACK[0] - COLOR_PINK[0]) * dist)
            g = int(COLOR_PINK[1] + (COLOR_BLACK[1] - COLOR_PINK[1]) * dist)
            b = int(COLOR_PINK[2] + (COLOR_BLACK[2] - COLOR_PINK[2]) * dist)
            px[x, y] = (r, g, b)
            if x + 1 < W:
                px[x + 1, y] = (r, g, b)


def draw_diamond_grid(img):
    draw = ImageDraw.Draw(img)
    step = 60
    line_color = (255, 255, 255, 40)
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    for x in range(-H, W + H, step):
        odraw.line([(x, 0), (x + H, H)], fill=(255, 255, 255, 30), width=1)
        odraw.line([(x, H), (x + H, 0)], fill=(255, 255, 255, 30), width=1)
    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"), (0, 0))


def main():
    img = Image.new("RGB", (W, H))
    diagonal_gradient(img)
    draw_diamond_grid(img)
    img = img.convert("RGB")
    draw = ImageDraw.Draw(img)

    margin = 60

    # サイト名ラベル（提灯アイコン＋テキスト）
    f_label = ImageFont.truetype(FONT_MEDIUM, 26)
    icon_r = 11
    icon_cx = margin + icon_r
    icon_cy = 53
    draw.ellipse([icon_cx - icon_r, icon_cy - icon_r, icon_cx + icon_r, icon_cy + icon_r], fill=(224, 48, 48))
    draw.text((margin + icon_r * 2 + 10, 40), "楽天社員の損しない選び方", font=f_label, fill=COLOR_WHITE_SUB)

    # カテゴリバッジ
    f_badge = ImageFont.truetype(FONT_MEDIUM, 24)
    badge_text = "審査対策・再申請ガイド"
    bbox = draw.textbbox((0, 0), badge_text, font=f_badge)
    bw = bbox[2] - bbox[0] + 32
    bh = bbox[3] - bbox[1] + 18
    badge_y = 100
    draw.rounded_rectangle([margin, badge_y, margin + bw, badge_y + bh], radius=6, fill=COLOR_PINK)
    draw.text((margin + 16, badge_y + 9), badge_text, font=f_badge, fill=COLOR_WHITE)

    # 見出し（2行）
    f_title = ImageFont.truetype(FONT_BOLD, 54)
    line1 = "楽天カード審査に落ちた"
    line2 = "理由と再申請のコツ"
    draw.text((margin, 210), line1, font=f_title, fill=COLOR_WHITE)
    draw.text((margin, 280), line2, font=f_title, fill=COLOR_WHITE)

    # サブコピー
    f_sub = ImageFont.truetype(FONT_MEDIUM, 28)
    draw.text((margin, 360), "楽天社員が通過基準を解説", font=f_sub, fill=COLOR_WHITE_SUB)

    # キャラクター画像を右側に配置（白背景をカラーキーで透過化）
    try:
        char = Image.open(CHAR_PATH).convert("RGBA")
        datas = char.getdata()
        new_data = []
        for r, g, b, a in datas:
            if r > 245 and g > 245 and b > 245:
                new_data.append((r, g, b, 0))
            else:
                new_data.append((r, g, b, a))
        char.putdata(new_data)

        char_h = 560
        char_w = int(char.width * (char_h / char.height))
        char = char.resize((char_w, char_h), Image.LANCZOS)
        char_x = W - char_w + 40
        char_y = H - char_h - 10
        img.paste(char, (char_x, char_y), char)
    except FileNotFoundError:
        pass

    draw = ImageDraw.Draw(img)

    # 個人運営・非公式バッジ（右下）
    f_note = ImageFont.truetype(FONT_MEDIUM, 22)
    note_text = "個人運営・非公式"
    bbox = draw.textbbox((0, 0), note_text, font=f_note)
    nw = bbox[2] - bbox[0] + 22
    nh = bbox[3] - bbox[1] + 12
    nx0 = W - nw - 30
    ny0 = H - nh - 24
    draw.rounded_rectangle([nx0, ny0, nx0 + nw, ny0 + nh], radius=6,
                            fill=(139, 26, 26), outline=COLOR_ACCENT, width=1)
    draw.text((nx0 + 11, ny0 + 6), note_text, font=f_note, fill=COLOR_ACCENT)

    img.save(OUT_PATH, quality=95)
    print(f"保存完了: {OUT_PATH}")


if __name__ == "__main__":
    main()
