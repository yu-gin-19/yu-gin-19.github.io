"""
OGP画像生成スクリプト v2（visual-designer スキル仕様書準拠）

仕様書との主な差分：
- カラー比率 70-25-5 を厳密に適用（赤70%・白25%・ゴールド5%）
- 余白を画像幅の8〜10%（96〜120px）に統一
- フォントサイズをスキル標準に合わせて調整
  - メインキャッチ(14,000)：160px → スキル標準上限72pxを大きく超えるため
    OGPは「数字が主役」の特例として維持しつつ、他要素を標準に寄せる
  - サブコピー：44px（スキル標準24〜36px → 視認性確保のため44px）
  - 注釈：24px（スキル標準10〜12px → OGP縮小表示を考慮して24px）
- レイアウト余白：左右100px（画像幅の8.3%）

出力: images/ogp_v2.png（1200×630px）
"""

import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630

FONT_BOLD   = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
FONT_MEDIUM = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"

# カラーパレット（仕様書準拠）
C_PRIMARY    = "#C0272D"   # Primary：背景グラデーション上部
C_SECONDARY  = "#8B1A1A"   # Secondary：背景グラデーション下部
C_ACCENT     = "#F5C518"   # Accent：「14,000」数字（5%）
C_WHITE      = "#FFFFFF"   # テキスト（25%）
C_WHITE_SUB  = "#FFDDDD"   # サブテキスト（白の薄め版）

MARGIN = 100  # 画像幅の8.3%（スキル標準：8〜10%）

OUT_DIR  = os.path.join(os.path.dirname(__file__), "images")
OUT_PATH = os.path.join(OUT_DIR, "ogp_v2.png")


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
    vertical_gradient(img, C_PRIMARY, C_SECONDARY)
    draw = ImageDraw.Draw(img)

    # 装飾：縦ライン（白・細め）
    for x in [MARGIN - 20, W - MARGIN + 20]:
        draw.line([(x, 36), (x, H - 36)], fill="#FFFFFF", width=1)

    # 上部ラベル：サイト名（スキル標準：本文14〜18px → OGP縮小考慮で32px）
    f_label = ImageFont.truetype(FONT_MEDIUM, 32)
    label_text = "楽天の中の人のポイ活メディア"
    bbox = draw.textbbox((0, 0), label_text, font=f_label)
    text_w = bbox[2] - bbox[0]
    icon_r = 13
    icon_gap = 12
    total_w = icon_r * 2 + icon_gap + text_w
    start_x = (W - total_w) // 2
    icon_cx = start_x + icon_r
    icon_cy = 68
    # 提灯アイコン（赤丸＋白ハイライト＋白ひも）
    draw.ellipse([icon_cx - icon_r, icon_cy - icon_r,
                  icon_cx + icon_r, icon_cy + icon_r], fill="#E03030")
    draw.ellipse([icon_cx - 5, icon_cy - 9, icon_cx + 5, icon_cy - 3],
                 fill=(255, 255, 255, 120))
    draw.line([(icon_cx, icon_cy + icon_r), (icon_cx, icon_cy + icon_r + 6)],
              fill=C_WHITE_SUB, width=2)
    text_x = start_x + icon_r * 2 + icon_gap
    draw.text((text_x, icon_cy), label_text,
              font=f_label, fill=C_WHITE_SUB, anchor="lm")

    # 区切り線（内側余白：MARGIN）
    draw.line([(MARGIN, 104), (W - MARGIN, 104)], fill=(255, 255, 255, 60), width=1)

    # サブコピー（スキル標準：サブキャッチ24〜36px → 視認性のため44px）
    f_sub = ImageFont.truetype(FONT_MEDIUM, 44)
    draw.text((W // 2, 196), "社員紹介リンクから申し込むと",
              font=f_sub, fill=C_WHITE, anchor="mm")

    # メインコピー「14,000」（スキル特例：数字主役のため160px維持）
    f_big = ImageFont.truetype(FONT_BOLD, 160)
    draw.text((W // 2, 370), "14,000",
              font=f_big, fill=C_ACCENT, anchor="mm")

    # 単位（スキル標準：見出し48〜72px → 52px）
    f_unit = ImageFont.truetype(FONT_BOLD, 52)
    draw.text((W // 2, 476), "ポイントもらえます",
              font=f_unit, fill=C_WHITE, anchor="mm")

    # キャッチコピー（スキル標準：本文14〜18px → OGP縮小考慮で34px）
    f_catch = ImageFont.truetype(FONT_MEDIUM, 34)
    draw.text((W // 2, 544), "楽天カード持ちなら、損してるかも。",
              font=f_catch, fill=C_WHITE_SUB, anchor="mm")

    # 「個人運営・非公式」ラベル（スキル標準：注釈10〜12px → 縮小表示対策で24px）
    f_note = ImageFont.truetype(FONT_MEDIUM, 24)
    note_text = "個人運営・非公式"
    bbox = draw.textbbox((0, 0), note_text, font=f_note)
    nw = bbox[2] - bbox[0] + 24
    nh = bbox[3] - bbox[1] + 12
    nx0 = W - nw - MARGIN // 2
    ny0 = H - nh - MARGIN // 2
    draw.rounded_rectangle([nx0, ny0, nx0 + nw, ny0 + nh],
                            radius=6, fill=(139, 26, 26, 160), outline=C_ACCENT, width=1)
    draw.text((nx0 + nw // 2, ny0 + nh // 2), note_text,
              font=f_note, fill=C_ACCENT, anchor="mm")

    img.save(OUT_PATH, quality=95)
    print(f"保存完了: {OUT_PATH}")


if __name__ == "__main__":
    main()
