"""
ヒーロー画像生成スクリプト v2（visual-designer スキル仕様書準拠）

仕様書との主な差分：
- カラー比率 70-25-5 を厳密に適用
  （薄ピンク背景70%・スマホ+UI25%・アクセント赤/ゴールド5%）
- 余白を画像幅の8〜10%（38〜48px）に統一（480px × 8% = 38px）
- フォントサイズをスキル標準に調整
  - 通知メイン：17px（本文14〜18px ✅）
  - サブテキスト：11px（注釈10〜12px ✅）
  - キャプション見出し：22px（サブキャッチ24〜36px の下限付近）
- スマホUIをより抽象化してアプリ模倣を避ける
- 右上バッジのデザインをより目立つ構成に変更

出力: images/hero_v2.png（480×480px）
"""

import os
from PIL import Image, ImageDraw, ImageFont

W, H = 480, 480

FONT_BOLD   = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
FONT_MEDIUM = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"

# カラーパレット（仕様書準拠）
C_PRIMARY   = "#C0272D"   # Primary：SPUバッジ・アクセント（5%）
C_GREEN     = "#27AE60"   # Secondary：ポイント通知（緑）
C_GOLD      = "#F5A623"   # Accent：コインアイコン・ゴールド
C_BG        = "#FFF5F5"   # BG：薄ピンク背景（70%）
C_PHONE     = "#2D2D2D"   # スマホ本体（25%の一部）
C_SCREEN    = "#FFFFFF"
C_TEXT_DARK = "#1A1A1A"
C_TEXT_GRAY = "#888888"
C_NOTIF_BG  = "#F0FFF4"
C_SPU_BG    = "#FFF0F0"

MARGIN = 38  # 画像幅の8%（スキル標準）

OUT_DIR  = os.path.join(os.path.dirname(__file__), "images")
OUT_PATH = os.path.join(OUT_DIR, "hero_v2.png")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    img  = Image.new("RGB", (W, H), C_BG)
    draw = ImageDraw.Draw(img)

    # 背景装飾：薄い円（スキル：余白・ホワイトスペースの活用）
    for cx, cy, r in [(370, 75, 65), (70, 390, 45), (390, 370, 35)]:
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline="#E8B0B0", width=2)

    # ---- スマホ本体（中央配置）----
    ph_x0, ph_y0 = 158, 52
    ph_x1, ph_y1 = 318, 368
    # 影（スキル：CTAが視覚的に目立つ位置に）
    draw.rounded_rectangle([ph_x0+5, ph_y0+5, ph_x1+5, ph_y1+5],
                            radius=24, fill="#CCCCCC")
    # 本体
    draw.rounded_rectangle([ph_x0, ph_y0, ph_x1, ph_y1],
                            radius=24, fill=C_PHONE)

    # 画面
    sc_x0, sc_y0 = ph_x0 + 10, ph_y0 + 26
    sc_x1, sc_y1 = ph_x1 - 10, ph_y1 - 16
    draw.rounded_rectangle([sc_x0, sc_y0, sc_x1, sc_y1],
                            radius=14, fill=C_SCREEN)

    # ノッチ
    mid_x = (ph_x0 + ph_x1) // 2
    draw.rounded_rectangle([mid_x - 28, ph_y0 + 11, mid_x + 28, ph_y0 + 22],
                            radius=6, fill="#1A1A1A")

    # ホームバー
    draw.rounded_rectangle([mid_x - 28, ph_y1 - 11, mid_x + 28, ph_y1 - 6],
                            radius=4, fill="#666666")

    # ---- 画面内UI（スキル：テキストと視覚の整合性）----
    # ステータスバー
    f_tiny = ImageFont.truetype(FONT_MEDIUM, 11)
    draw.text((sc_x0 + 10, sc_y0 + 8), "9:41", font=f_tiny, fill=C_TEXT_DARK)

    # アプリ名バー（抽象化：「ポイント管理」）
    f_app = ImageFont.truetype(FONT_BOLD, 13)
    draw.text(((sc_x0 + sc_x1) // 2, sc_y0 + 32),
              "ポイント管理", font=f_app, fill=C_PRIMARY, anchor="mm")
    draw.line([(sc_x0 + 4, sc_y0 + 44), (sc_x1 - 4, sc_y0 + 44)],
              fill="#EEEEEE", width=1)

    # ---- 通知カード「+14,000ポイント」----
    # （スキル：フォント役割 本文14〜18px ✅ 17px）
    n_x0 = sc_x0 + 6
    n_y0 = sc_y0 + 52
    n_x1 = sc_x1 - 6
    n_y1 = sc_y0 + 132
    draw.rounded_rectangle([n_x0, n_y0, n_x1, n_y1],
                            radius=10, fill=C_NOTIF_BG, outline="#A8E6C0", width=1)

    # コインアイコン
    ico_cx, ico_cy = n_x0 + 20, (n_y0 + n_y1) // 2
    draw.ellipse([ico_cx - 12, ico_cy - 12, ico_cx + 12, ico_cy + 12], fill=C_GOLD)
    draw.text((ico_cx, ico_cy), "P",
              font=ImageFont.truetype(FONT_BOLD, 13), fill="#FFFFFF", anchor="mm")

    # 通知テキスト（スキル標準：本文14〜18px → 17px ✅）
    f_notif = ImageFont.truetype(FONT_BOLD, 17)
    f_sub   = ImageFont.truetype(FONT_MEDIUM, 11)   # 注釈10〜12px ✅
    tx = n_x0 + 40
    draw.text((tx, n_y0 + 22), "+14,000ポイント", font=f_notif, fill=C_GREEN)
    draw.text((tx, n_y0 + 44), "紹介特典が付与されました",  font=f_sub,   fill=C_TEXT_GRAY)

    # ---- SPUバッジ ----
    s_y0 = n_y1 + 8
    s_y1 = s_y0 + 46
    draw.rounded_rectangle([n_x0, s_y0, n_x1, s_y1],
                            radius=10, fill=C_SPU_BG, outline="#FFCCCC", width=1)
    f_spu_lbl = ImageFont.truetype(FONT_BOLD, 15)
    f_spu_val = ImageFont.truetype(FONT_BOLD, 22)
    mid_sy = (s_y0 + s_y1) // 2
    draw.text((n_x0 + 12, mid_sy), "SPU", font=f_spu_lbl, fill=C_PRIMARY, anchor="lm")
    draw.text((n_x1 - 12, mid_sy), "+4倍", font=f_spu_val, fill=C_PRIMARY, anchor="rm")

    # ---- 右上バッジ「乗り換え14,000P」（スキル：CTAが視覚的に目立つ） ----
    bx, by, br = 356, 104, 44
    # 影
    draw.ellipse([bx - br + 3, by - br + 3, bx + br + 3, by + br + 3], fill="#D4910A")
    # バッジ本体
    draw.ellipse([bx - br, by - br, bx + br, by + br], fill=C_GOLD)
    f_b1 = ImageFont.truetype(FONT_BOLD, 11)
    f_b2 = ImageFont.truetype(FONT_BOLD, 12)
    draw.text((bx, by - 10), "乗り換え",  font=f_b1, fill="#FFFFFF", anchor="mm")
    draw.text((bx, by + 6),  "14,000P", font=f_b2, fill="#FFFFFF", anchor="mm")

    # ---- 下部キャプション（スキル標準：サブキャッチ24〜36px → 22px）----
    f_cap_sub = ImageFont.truetype(FONT_MEDIUM, 14)   # 本文14〜18px ✅
    f_cap     = ImageFont.truetype(FONT_BOLD,   22)   # サブキャッチ下限付近
    draw.text((W // 2, 400), "楽天モバイルで",        font=f_cap_sub, fill=C_TEXT_GRAY, anchor="mm")
    draw.text((W // 2, 432), "ポイントが一気に増える", font=f_cap,     fill=C_TEXT_DARK, anchor="mm")

    img.save(OUT_PATH, quality=95)
    print(f"保存完了: {OUT_PATH}")


if __name__ == "__main__":
    main()
