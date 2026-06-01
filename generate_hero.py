"""
ヒーロー画像生成スクリプト
スマホに「+14,000pt」通知が表示されたフラットイラスト

出力: images/hero.png（480×480px）
"""

import os
from PIL import Image, ImageDraw, ImageFont

W, H = 480, 480

FONT_BOLD   = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
FONT_MEDIUM = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"

C_BG        = "#FFF5F5"   # 薄ピンク背景
C_PHONE     = "#2D2D2D"   # スマホ本体
C_SCREEN    = "#FFFFFF"   # 画面
C_ACCENT    = "#C0272D"   # アクセントレッド
C_GOLD      = "#F5A623"   # ゴールド
C_GREEN     = "#27AE60"   # 通知グリーン
C_TEXT_DARK = "#1A1A1A"
C_TEXT_GRAY = "#888888"
C_NOTIF_BG  = "#F0FFF4"   # 通知背景（薄緑）

OUT_DIR  = os.path.join(os.path.dirname(__file__), "images")
OUT_PATH = os.path.join(OUT_DIR, "hero.png")


def draw_rounded_rect(draw, xy, radius=12, fill=None, outline=None, width=2):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    img  = Image.new("RGB", (W, H), C_BG)
    draw = ImageDraw.Draw(img)

    # 背景の装飾：薄い円（ポイント感を演出）
    for cx, cy, r in [(380, 80, 70), (60, 380, 50), (400, 360, 40)]:
        draw.ellipse([cx - r, cy - r, cx + r, cy + r],
                     outline="#E8B0B0", width=2)

    # ---- スマホ本体 ----
    ph_x0, ph_y0 = 160, 60
    ph_x1, ph_y1 = 320, 380
    # 影
    draw_rounded_rect(draw, [ph_x0+6, ph_y0+6, ph_x1+6, ph_y1+6],
                      radius=24, fill="#CCCCCC")
    # 本体
    draw_rounded_rect(draw, [ph_x0, ph_y0, ph_x1, ph_y1],
                      radius=24, fill=C_PHONE)

    # 画面
    sc_x0, sc_y0 = ph_x0 + 10, ph_y0 + 28
    sc_x1, sc_y1 = ph_x1 - 10, ph_y1 - 18
    draw_rounded_rect(draw, [sc_x0, sc_y0, sc_x1, sc_y1],
                      radius=14, fill=C_SCREEN)

    # ノッチ（上部中央）
    draw.rounded_rectangle([ph_x0 + 55, ph_y0 + 12, ph_x1 - 55, ph_y0 + 24],
                            radius=6, fill="#1A1A1A")

    # ホームバー（下部）
    bar_cx = (ph_x0 + ph_x1) // 2
    draw.rounded_rectangle([bar_cx - 30, ph_y1 - 12, bar_cx + 30, ph_y1 - 6],
                            radius=4, fill="#666666")

    # ---- 画面内UI ----
    # ステータスバー
    f_tiny = ImageFont.truetype(FONT_MEDIUM, 11)
    draw.text((sc_x0 + 10, sc_y0 + 8), "9:41", font=f_tiny, fill=C_TEXT_DARK)
    draw.text((sc_x1 - 10, sc_y0 + 8), "●●●", font=f_tiny, fill=C_TEXT_DARK, anchor="ra")

    # アプリ名
    f_app = ImageFont.truetype(FONT_BOLD, 13)
    draw.text(((sc_x0 + sc_x1) // 2, sc_y0 + 36),
              "楽天ポイント", font=f_app, fill=C_ACCENT, anchor="mm")

    # 区切り線
    draw.line([(sc_x0 + 4, sc_y0 + 48), (sc_x1 - 4, sc_y0 + 48)],
              fill="#EEEEEE", width=1)

    # 通知カード（+14,000pt）
    notif_x0 = sc_x0 + 6
    notif_y0 = sc_y0 + 56
    notif_x1 = sc_x1 - 6
    notif_y1 = sc_y0 + 138
    draw_rounded_rect(draw, [notif_x0, notif_y0, notif_x1, notif_y1],
                      radius=10, fill=C_NOTIF_BG, outline="#A8E6C0", width=1)

    # 通知アイコン（コイン風の丸）
    ico_cx = notif_x0 + 20
    ico_cy = (notif_y0 + notif_y1) // 2
    draw.ellipse([ico_cx - 12, ico_cy - 12, ico_cx + 12, ico_cy + 12],
                 fill=C_GOLD)
    f_coin = ImageFont.truetype(FONT_BOLD, 13)
    draw.text((ico_cx, ico_cy), "P", font=f_coin, fill=C_WHITE, anchor="mm")

    # 通知テキスト
    f_notif_main = ImageFont.truetype(FONT_BOLD, 17)
    f_notif_sub  = ImageFont.truetype(FONT_MEDIUM, 11)
    tx = notif_x0 + 40
    draw.text((tx, notif_y0 + 22), "+14,000ポイント",
              font=f_notif_main, fill=C_GREEN)
    draw.text((tx, notif_y0 + 44), "社員紹介特典が付与されました",
              font=f_notif_sub, fill=C_TEXT_GRAY)

    # SPUバッジ
    spu_y0 = notif_y1 + 10
    spu_y1 = spu_y0 + 48
    draw_rounded_rect(draw, [notif_x0, spu_y0, notif_x1, spu_y1],
                      radius=10, fill="#FFF0F0", outline="#FFCCCC", width=1)
    f_spu = ImageFont.truetype(FONT_BOLD, 15)
    f_spu_val = ImageFont.truetype(FONT_BOLD, 22)
    draw.text((notif_x0 + 12, (spu_y0 + spu_y1) // 2),
              "SPU", font=f_spu, fill=C_ACCENT, anchor="lm")
    draw.text((notif_x1 - 12, (spu_y0 + spu_y1) // 2),
              "+4倍", font=f_spu_val, fill=C_ACCENT, anchor="rm")

    # ---- スマホ外のバッジ（右上） ----
    badge_cx, badge_cy = 355, 110
    badge_r = 42
    draw.ellipse([badge_cx - badge_r, badge_cy - badge_r,
                  badge_cx + badge_r, badge_cy + badge_r],
                 fill=C_GOLD)
    f_badge1 = ImageFont.truetype(FONT_BOLD, 13)
    f_badge2 = ImageFont.truetype(FONT_BOLD, 11)
    draw.text((badge_cx, badge_cy - 8), "最大",
              font=f_badge1, fill=C_WHITE, anchor="mm")
    draw.text((badge_cx, badge_cy + 8), "14,000P",
              font=f_badge2, fill=C_WHITE, anchor="mm")

    # ---- 下部キャプション ----
    f_cap = ImageFont.truetype(FONT_BOLD, 22)
    f_cap_sub = ImageFont.truetype(FONT_MEDIUM, 14)
    draw.text((W // 2, 415), "楽天モバイルで",
              font=f_cap_sub, fill=C_TEXT_GRAY, anchor="mm")
    draw.text((W // 2, 445), "ポイントが一気に増える",
              font=f_cap, fill=C_TEXT_DARK, anchor="mm")

    img.save(OUT_PATH, quality=95)
    print(f"保存完了: {OUT_PATH}")


C_WHITE = "#FFFFFF"

if __name__ == "__main__":
    main()
