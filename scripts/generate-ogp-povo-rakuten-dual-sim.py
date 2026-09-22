"""
OGP画像生成: articles/povo-rakuten-dual-sim/ogp.png 専用スクリプト

scripts/generate-ogp-batch.py はCONFIGSが常に25件であることを前提に検証しており、
記事ごとの3D素材（ChatGPT側で事前作成）がないと生成できない。この記事には専用の
3D素材がないため、既存のA案背景・フォント探索ロジックのみを再利用し、3D素材の
合成なしで1200x630pxのOGP画像を1枚だけ生成する
（scripts/generate-ogp-second-line.py と同じ方針）。

このOGPには料金・ポイント数字・最安値・「永久0円」「絶対つながる」等の未確認の
訴求を一切載せない。メインキャッチは「楽天×povo」、黄色帯のサブコピーで
「回線の使い分けと設定」を示す。

使い方:
    python scripts/generate-ogp-povo-rakuten-dual-sim.py
"""

import os

from PIL import Image, ImageDraw, ImageFont

FINAL_W, FINAL_H = 1200, 630

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPTS_DIR)
BG_A_PATH = os.path.join(SCRIPTS_DIR, "ogp_assets", "backgrounds", "a-navy-empty.png")
OUT_PATH = os.path.join(REPO_ROOT, "articles", "povo-rakuten-dual-sim", "ogp.png")

BRAND_LABEL = "楽天社員の損しない選び方"
BRAND_HIGHLIGHT = "損しない"
NOTE_TEXT = "個人運営・非公式"

COLOR_WHITE = (255, 255, 255)
COLOR_MAGENTA = (255, 20, 145)
COLOR_YELLOW = (255, 205, 40)
COLOR_NAVY_TEXT = (18, 24, 58)
COLOR_NOTE = (210, 214, 226)
COLOR_NOTE_STROKE = (10, 10, 14)

COLOR_ROLES = {"white": COLOR_WHITE, "magenta": COLOR_MAGENTA, "yellow": COLOR_YELLOW}

A_TEXT_MAX_WIDTH = 1000

FONT_CANDIDATES = [
    (r"C:\Windows\Fonts\YuGothB.ttc", r"C:\Windows\Fonts\YuGothM.ttc"),
    (r"C:\Windows\Fonts\meiryob.ttc", r"C:\Windows\Fonts\meiryo.ttc"),
    (
        "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
        "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
    ),
    (
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ),
    (
        "/usr/share/fonts/truetype/noto/NotoSansCJKjp-Bold.otf",
        "/usr/share/fonts/truetype/noto/NotoSansCJKjp-Regular.otf",
    ),
]


def resolve_fonts():
    for bold_path, medium_path in FONT_CANDIDATES:
        if os.path.isfile(bold_path) and os.path.isfile(medium_path):
            return bold_path, medium_path
    raise SystemExit(
        "[エラー] 日本語フォントが見つかりませんでした。豆腐文字を防ぐため生成を中止します。\n"
        "以下のいずれかのフォントを用意してください:\n"
        + "\n".join(f"  - {b} / {m}" for b, m in FONT_CANDIDATES)
    )


FONT_BOLD, _FONT_MEDIUM = resolve_fonts()


def font(size):
    return ImageFont.truetype(FONT_BOLD, size)


def text_w(draw, s, f):
    b = draw.textbbox((0, 0), s, font=f)
    return b[2] - b[0]


def fit_font(draw, text, max_width, start_size, min_size):
    size = start_size
    if not text:
        return font(start_size)
    while size > min_size:
        f = font(size)
        if text_w(draw, text, f) <= max_width:
            return f
        size -= 2
    return font(min_size)


def fit_font_segments(draw, segments, max_width, start_size, min_size):
    joined = "".join(s for s, _ in segments)
    return fit_font(draw, joined, max_width, start_size, min_size)


def draw_segments(draw, x, y, segments, f):
    for text, role in segments:
        color = COLOR_ROLES[role]
        draw.text((x, y), text, font=f, fill=color)
        x += text_w(draw, text, f)
    return x


def draw_note(draw, xy, align_right=False):
    f_note = font(24)
    if align_right:
        w = text_w(draw, NOTE_TEXT, f_note)
        x = xy[0] - w
    else:
        x = xy[0]
    draw.text((x, xy[1]), NOTE_TEXT, font=f_note, fill=COLOR_NOTE,
              stroke_width=3, stroke_fill=COLOR_NOTE_STROKE)


def render():
    if not os.path.isfile(BG_A_PATH):
        raise SystemExit(f"[エラー] A案背景が見つかりません: {BG_A_PATH}")

    img = Image.open(BG_A_PATH).convert("RGB")
    draw = ImageDraw.Draw(img)

    # 上部枠：「損しない」だけマゼンタ、他は白
    idx = BRAND_LABEL.index(BRAND_HIGHLIGHT)
    brand_segments = [
        (BRAND_LABEL[:idx], "white"),
        (BRAND_HIGHLIGHT, "magenta"),
        (BRAND_LABEL[idx + len(BRAND_HIGHLIGHT):], "white"),
    ]
    brand_size = 54
    while brand_size > 40 and text_w(draw, BRAND_LABEL, font(brand_size)) > (1016 - 71 - 60):
        brand_size -= 1
    f_brand = font(brand_size)
    total_w = text_w(draw, BRAND_LABEL, f_brand)
    ribbon_cy = (92 + 227) // 2
    bbox = draw.textbbox((0, 0), BRAND_LABEL, font=f_brand)
    x = 71 + ((1016 - 71) - total_w) // 2
    y = ribbon_cy - (bbox[3] - bbox[1]) // 2 - bbox[1]
    draw_segments(draw, x, y, brand_segments, f_brand)

    # 中見出し（記事カテゴリ）
    mid = "デュアルSIM運用ガイド"
    f_mid = fit_font(draw, mid, A_TEXT_MAX_WIDTH, 46, 24)
    draw.text((72, 300), mid, font=f_mid, fill=COLOR_WHITE)

    # 大見出し（料金・ポイント数字は使わず、組み合わせが伝わるコピーのみ）
    main = [("楽天モバイル", "white"), ("×povo", "magenta")]
    f_big = fit_font_segments(draw, main, A_TEXT_MAX_WIDTH, 72, 32)
    draw_segments(draw, 66, 430, main, f_big)

    # 黄色帯に濃紺文字（サブコピー）
    band = "回線の使い分けと設定"
    f_band = fit_font(draw, band, 900, 54, 28)
    bb = draw.textbbox((0, 0), band, font=f_band)
    band_cy = (679 + 811) // 2
    draw.text((110, band_cy - (bb[3] - bb[1]) // 2 - bb[1]), band, font=f_band, fill=COLOR_NAVY_TEXT)

    # 個人運営・非公式（黄色帯の下・左）
    draw = ImageDraw.Draw(img)
    draw_note(draw, (72, 838))

    return img.resize((FINAL_W, FINAL_H), Image.LANCZOS)


def main():
    img = render()
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    img.save(OUT_PATH, quality=95)
    size = img.size
    ok = "OK" if size == (FINAL_W, FINAL_H) else "NG"
    print(f"[{ok}] articles/povo-rakuten-dual-sim/ogp.png ({size[0]}x{size[1]})")


if __name__ == "__main__":
    main()
