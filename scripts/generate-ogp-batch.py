"""
OGP画像 一括生成／再生成スクリプト（共通版・ChatGPT提供の文字なし背景＋3D素材版）

背景2点（scripts/ogp_assets/backgrounds/）と記事別3D素材25点
（scripts/ogp_assets/objects/）はChatGPT側で作成済みのものをそのまま使用する。
このスクリプトが担当するのは、ネイティブ解像度での文字配置・3D素材の
contain合成・1200×630pxへの最終リサイズのみで、背景や3D素材、アイコンを
Pillowで新たに描き直すことはしない。

記事ごとの文言・テンプレート種別・出力先・3D素材ファイル名は CONFIGS の
1箇所にすべて集約し、描画関数側にページ固有の文言やファイル名を
直書きしない。

- 出力サイズ：1200×630px 固定
- E案：黒〜チャコール背景＋巨大数字（本体=白／単位=マゼンタ）
- A案：濃紺背景＋大見出し＋右側3D素材1点
- ブランド表記は「楽天社員の損しない選び方」に統一
- 「個人運営・非公式」表示は全25枚に維持
- フォントは Windows / macOS / Linux の日本語フォント候補を順に探索し、
  見つからない場合は例外を送出して停止する（豆腐文字を出力しない）
- 素材が25件揃っていない・RGBAでない・出力先が重複している場合は、
  生成前に例外で停止する

使い方:
    python scripts/generate-ogp-batch.py            # CONFIGS 全件を再生成
    python scripts/generate-ogp-batch.py --only top-page fit-check articles-index
    python scripts/generate-ogp-batch.py --grid     # 生成後、一覧グリッド画像も出力（Git管理対象外）
"""

import argparse
import os

from PIL import Image, ImageDraw, ImageFont

FINAL_W, FINAL_H = 1200, 630

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(SCRIPTS_DIR, "ogp_assets")
BG_DIR = os.path.join(ASSETS_DIR, "backgrounds")
OBJ_DIR = os.path.join(ASSETS_DIR, "objects")
GRID_OUT_PATH = os.path.join(SCRIPTS_DIR, "ogp_grid_preview.png")

BG_E_PATH = os.path.join(BG_DIR, "e-black-magenta-empty.png")
BG_A_PATH = os.path.join(BG_DIR, "a-navy-empty.png")

BRAND_LABEL = "楽天社員の損しない選び方"
BRAND_HIGHLIGHT = "損しない"
NOTE_TEXT = "個人運営・非公式"

COLOR_WHITE = (255, 255, 255)
COLOR_MAGENTA = (255, 20, 145)
COLOR_YELLOW = (255, 205, 40)
COLOR_MINT = (110, 231, 183)
COLOR_NAVY_TEXT = (18, 24, 58)
COLOR_NOTE = (210, 214, 226)
COLOR_NOTE_STROKE = (10, 10, 14)

COLOR_ROLES = {"white": COLOR_WHITE, "magenta": COLOR_MAGENTA, "yellow": COLOR_YELLOW}

# 3D素材のデフォルト配置領域（背景ネイティブ座標／containで縦横比維持）
ASSET_BOX_E = (900, 45, 1700, 885)   # E案背景 1730x909
ASSET_BOX_A = (1120, 45, 1700, 885)  # A案背景 1731x909

# 見出し系テキストの最大幅（ネイティブ座標）。右端が素材領域の左端から
# 常に50px以上離れるように、素材領域の左端より手前で頭打ちにする。
E_TEXT_MAX_WIDTH = 790     # 右端キャップ = 56+790=846 ＜ 900-50
A_TEXT_MAX_WIDTH = 1000    # 右端キャップ = 66+1000=1066 ＜ 1120-50

# --- フォント候補（優先順） -------------------------------------------------
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


FONT_BOLD, FONT_MEDIUM = resolve_fonts()


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
    """segments = [(text, color_role), ...] を1本のフォントサイズで幅に収める。"""
    joined = "".join(s for s, _ in segments)
    return fit_font(draw, joined, max_width, start_size, min_size)


def draw_segments(draw, x, y, segments, f):
    for text, role in segments:
        color = COLOR_ROLES[role]
        draw.text((x, y), text, font=f, fill=color)
        x += text_w(draw, text, f)
    return x


# --- 記事ごとの設定 ----------------------------------------------------------
# out: 出力先（REPO_ROOT からの相対パス。既存の公開パスを維持しリンク切れを防ぐ）
# template: "E"（巨大数字） or "A"（大見出し＋アイコン素材）
# asset: scripts/ogp_assets/objects/ 内のファイル名
# 必要な場合のみ asset_box（ネイティブ座標のx0,y0,x1,y1）または
# asset_offset（dx,dy）でページ別に微調整する（描画関数側のkey分岐は作らない）
CONFIGS = [
    # ------------------------------------------------------------------ E案（10件）
    {
        "key": "top-page",
        "out": "images/ogp.png",
        "template": "E",
        "line1": "社員紹介リンク経由で",
        "line2": "他社から乗り換えなら",
        "number": "14,000",
        "unit": "pt",
        "note": "新規契約でも11,000pt",
        "asset": "top-page-points-phone-bars-rgba.png",
    },
    {
        "key": "campaign-guide",
        "out": "articles/campaign-guide/ogp.png",
        "template": "E",
        "line1": "社員紹介キャンペーンなら",
        "line2": "他社から乗り換えで",
        "number": "14,000",
        "unit": "pt",
        "note": "新規契約でも11,000pt",
        "asset": "campaign-guide-gift-points-rgba.png",
    },
    {
        "key": "card-mobile-spu",
        "out": "articles/card-mobile-spu/ogp.png",
        "template": "E",
        "line1": "楽天カード＋楽天モバイルで",
        "line2": "SPUをまとめてアップ",
        "number": "合計7",
        "unit": "倍",
        "note": "5と0のつく日は合計8倍",
        "asset": "card-mobile-spu-card-phone-growth-rgba.png",
    },
    {
        "key": "familymart-spu",
        "out": "articles/familymart-spu/ogp.png",
        "template": "E",
        "line1": "ファミリーマート利用で",
        "line2": "楽天市場のSPUに追加",
        "number": "+0.5",
        "unit": "倍",
        "note": "月3,000円以上＋利用登録が条件",
        "asset": "familymart-spu-store-bag-points-rgba.png",
    },
    {
        "key": "securities-spu",
        "out": "articles/securities-spu/ogp.png",
        "template": "E",
        "line1": "楽天証券SPUの条件",
        "line2": "NISAでも対象",
        "number": "最大+1",
        "unit": "倍",
        "note": "投資信託＋米国株式",
        "asset": "securities-spu-investment-chart-rgba.png",
    },
    {
        "key": "spu-4x",
        "out": "articles/spu-4x/ogp.png",
        "template": "E",
        "line1": "対象プラン契約＋エントリーで",
        "line2": "楽天モバイルのSPU",
        "number": "+4",
        "unit": "倍",
        "note": "楽天市場のポイントが上乗せ",
        "asset": "spu-4x-growth-four-bars-rgba.png",
    },
    {
        "key": "spu-checklist",
        "out": "articles/spu-checklist/ogp.png",
        "template": "E",
        "line1": "楽天SPU最大化の",
        "line2": "完全チェックリスト",
        "number": "月9,433",
        "unit": "pt",
        "note": "社員が毎月実践する項目を公開",
        "asset": "spu-checklist-checklist-points-rgba.png",
    },
    {
        "key": "marathon-strategy",
        "out": "articles/marathon-strategy/ogp.png",
        "template": "E",
        "line1": "楽天お買い物マラソンを",
        "line2": "買い回りで攻略",
        "number": "1,600",
        "unit": "pt",
        "note": "社員が実践した3つのコツ",
        "asset": "marathon-strategy-cart-bags-points-rgba.png",
    },
    {
        "key": "monthly-report-2026-05",
        "out": "articles/monthly-report-2026-05/ogp.png",
        "template": "E",
        "line1": "2026年5月の",
        "line2": "楽天ポイント実績",
        "number": "2,199",
        "unit": "pt",
        "note": "獲得内訳をすべて公開",
        "asset": "monthly-report-report-chart-points-rgba.png",
    },
    {
        "key": "au-switch",
        "out": "articles/au-switch/OGP_au-switch.png",
        "template": "E",
        "line1": "auから楽天モバイルへ",
        "line2": "乗り換えて5年",
        "number": "26",
        "unit": "万円以上",
        "note": "5年間の節約額を公開",
        "asset": "au-switch-two-phones-savings-rgba.png",
    },
    # ------------------------------------------------------------------ A案（13件）
    {
        "key": "articles-index",
        "out": "images/ogp_articles.png",
        "template": "A",
        "mid": "楽天モバイルのことなら",
        "main": [("社員が全部書きました", "white")],
        "band": "料金・電波・乗り換えを網羅",
        "asset": "articles-index-documents-rgba.png",
    },
    {
        "key": "ahamo-vs-rakuten",
        "out": "articles/ahamo-vs-rakuten/ogp.png",
        "template": "A",
        "mid": "楽天モバイルとahamo",
        "main": [("あなたに合うのは", "white"), ("？", "magenta")],
        "band": "元担当者が違いを比較",
        "asset": "ahamo-vs-rakuten-compare-phones-rgba.png",
    },
    {
        "key": "cancel-guide",
        "out": "articles/cancel-guide/ogp.png",
        "template": "A",
        "mid": "解約する前に",
        "main": [("確認したいこと", "white")],
        "band": "損しない手順を解説",
        "asset": "cancel-guide-exit-phone-warning-rgba.png",
    },
    {
        "key": "coverage-area",
        "out": "articles/coverage-area/ogp.png",
        "template": "A",
        "mid": "楽天モバイルが",
        "main": [("つながらない", "white"), ("？", "magenta")],
        "band": "エリア確認と対処法",
        "asset": "coverage-area-map-signal-phone-rgba.png",
    },
    {
        "key": "demerits",
        "out": "articles/demerits/ogp.png",
        "template": "A",
        "mid": "契約前に知りたい",
        "main": [("4つ", "yellow"), ("の弱点", "white")],
        "band": "元担当者が正直に解説",
        "asset": "demerits-warning-broken-signal-rgba.png",
    },
    {
        "key": "rakuten-card",
        "out": "articles/rakuten-card/ogp.png",
        "template": "A",
        "mid": "楽天カードは",
        "main": [("作るべき", "white"), ("？", "magenta")],
        "band": "メリットと注意点を解説",
        "asset": "rakuten-card-credit-card-question-rgba.png",
    },
    {
        "key": "regret-reasons",
        "out": "articles/regret-reasons/ogp.png",
        "template": "A",
        "mid": "楽天モバイルで",
        "main": [("後悔した", "white"), ("5つ", "yellow"), ("の理由", "white")],
        "band": "失敗しない対策も解説",
        "asset": "regret-reasons-question-phone-signal-rgba.png",
    },
    {
        "key": "supersale-ai-concierge-2026",
        "out": "articles/supersale-ai-concierge-2026/ogp.png",
        "template": "A",
        "mid": "楽天スーパーSALEを",
        "main": [("AI", "magenta"), ("でもっとお得に", "white")],
        "band": "買い物相談を自動化",
        "asset": "supersale-ai-concierge-ai-shopping-rgba.png",
    },
    {
        "key": "card-review",
        "out": "articles/card-review/OGP_card-review.png",
        "template": "A",
        "mid": "楽天カード審査に",
        "main": [("落ちた理由は", "white"), ("？", "magenta")],
        "band": "再申請前の対策を解説",
        "asset": "card-review-card-shield-check-rgba.png",
    },
    {
        "key": "rakuten-link-guide",
        "out": "articles/rakuten-link-guide/OGP_rakuten-link-guide.png",
        "template": "A",
        "mid": "Rakuten Linkの",
        "main": [("音質は大丈夫", "white"), ("？", "magenta")],
        "band": "5年利用した元担当者が解説",
        "asset": "rakuten-link-guide-phone-call-waves-rgba.png",
    },
    {
        "key": "fit-check",
        "out": "articles/fit-check/OGP_fit-check.png",
        "template": "A",
        "mid": "楽天モバイルは",
        "main": [("あなたに向いてる", "white"), ("？", "magenta")],
        "band": "元担当者の1分診断",
        "asset": "fit-check-phone-check-warning-rgba.png",
    },
    {
        "key": "how-to-switch",
        "out": "articles/how-to-switch/ogp.png",
        "template": "A",
        "mid": "楽天モバイルへの",
        "main": [("乗り換えは簡単", "white")],
        "band": "4ステップで完了",
        "asset": "how-to-switch-two-phones-arrow-sim-rgba.png",
    },
    {
        "key": "switch-data-transfer",
        "out": "articles/switch-data-transfer/ogp.png",
        "template": "A",
        "mid": "楽天モバイルに乗り換えると",
        "main": [("何が変わる", "white"), ("？", "magenta")],
        "band": "電話番号・LINE・写真を解説",
        "asset": "switch-data-transfer.png",
    },
    {
        "key": "esim-vs-sim-card",
        "out": "articles/esim-vs-sim-card/ogp.png",
        "template": "A",
        "mid": "楽天モバイルは",
        "main": [("eSIMとSIMカード", "white"), ("どっち？", "magenta")],
        "band": "3問でわかる失敗しない選び方",
        "asset": "esim-vs-sim-card-sim-esim-phone-rgba.png",
    },
    {
        "key": "savings-calc",
        "out": "articles/savings-calc/OGP_savings-calc.png",
        "template": "A",
        "mid": "楽天モバイルで",
        "main": [("いくら節約できる", "white"), ("？", "magenta")],
        "band": "30秒料金シミュレーション",
        "asset": "savings-calc-calculator-phone-coins-rgba.png",
    },
]


# --- 検証（生成前に必ず実行） -------------------------------------------------

def validate_configs():
    errors = []

    if len(CONFIGS) != 25:
        errors.append(f"CONFIGSが25件ではありません（{len(CONFIGS)}件）")

    outs = [c["out"] for c in CONFIGS]
    dup_outs = {o for o in outs if outs.count(o) > 1}
    if dup_outs:
        errors.append(f"出力先が重複しています: {sorted(dup_outs)}")

    for path, label in [(BG_E_PATH, "E案背景"), (BG_A_PATH, "A案背景")]:
        if not os.path.isfile(path):
            errors.append(f"{label}が見つかりません: {path}")

    for cfg in CONFIGS:
        asset_path = os.path.join(OBJ_DIR, cfg["asset"])
        if not os.path.isfile(asset_path):
            errors.append(f"[{cfg['key']}] 3D素材が見つかりません: {asset_path}")
            continue
        with Image.open(asset_path) as im:
            if im.mode != "RGBA":
                errors.append(f"[{cfg['key']}] 3D素材がRGBAではありません: {cfg['asset']} (mode={im.mode})")

    if errors:
        raise SystemExit("[エラー] 生成を中止します:\n" + "\n".join(f"  - {e}" for e in errors))


# --- 共通パーツ --------------------------------------------------------------

def composite_asset(img, asset_path, box):
    with Image.open(asset_path) as src:
        asset = src.convert("RGBA")
    bx0, by0, bx1, by1 = box
    bw, bh = bx1 - bx0, by1 - by0
    scale = min(bw / asset.width, bh / asset.height)
    nw, nh = max(1, int(asset.width * scale)), max(1, int(asset.height * scale))
    resized = asset.resize((nw, nh), Image.LANCZOS)
    px = bx0 + (bw - nw) // 2
    py = by0 + (bh - nh) // 2
    img.paste(resized, (px, py), resized)


def resolve_asset_box(cfg, default_box):
    if "asset_box" in cfg:
        return cfg["asset_box"]
    box = default_box
    if "asset_offset" in cfg:
        dx, dy = cfg["asset_offset"]
        box = (box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy)
    return box


def draw_note(draw, xy, align_right=False):
    f_note = font(24)
    if align_right:
        w = text_w(draw, NOTE_TEXT, f_note)
        x = xy[0] - w
    else:
        x = xy[0]
    draw.text((x, xy[1]), NOTE_TEXT, font=f_note, fill=COLOR_NOTE,
              stroke_width=3, stroke_fill=COLOR_NOTE_STROKE)


# --- テンプレート本体 ---------------------------------------------------------

def render_e(cfg):
    img = Image.open(BG_E_PATH).convert("RGB")
    draw = ImageDraw.Draw(img)
    W, H = img.size

    # 上部リボン（背景に描画済みの帯の中に白文字でブランド名）
    f_brand = fit_font(draw, BRAND_LABEL, 800, 46, 30)
    bbox = draw.textbbox((0, 0), BRAND_LABEL, font=f_brand)
    ribbon_cy = (72 + 166) // 2
    draw.text((90, ribbon_cy - (bbox[3] - bbox[1]) // 2 - bbox[1]), BRAND_LABEL,
               font=f_brand, fill=COLOR_WHITE)

    # 見出し2行（1行目=白／2行目=マゼンタ）
    f_h1 = fit_font(draw, cfg["line1"], E_TEXT_MAX_WIDTH, 62, 34)
    draw.text((56, 205), cfg["line1"], font=f_h1, fill=COLOR_WHITE)
    f_h2 = fit_font(draw, cfg["line2"], E_TEXT_MAX_WIDTH, 62, 34)
    draw.text((56, 290), cfg["line2"], font=f_h2, fill=COLOR_MAGENTA)

    # 巨大数字（区切り線=536 の下）：本体=白、単位=マゼンタ（本体比55〜70%・ベースライン揃え）
    # 素材を優先して数字を縮小することはしない。素材側の領域はASSET_BOX_Eで別途確保する。
    f_num = fit_font(draw, cfg["number"], E_TEXT_MAX_WIDTH, 150, 90)
    draw.text((52, 575), cfg["number"], font=f_num, fill=COLOR_WHITE)
    num_w = text_w(draw, cfg["number"], f_num)
    f_unit = font(int(f_num.size * 0.62))
    draw.text((52 + num_w + 14, 575 + f_num.size - f_unit.size), cfg["unit"], font=f_unit, fill=COLOR_MAGENTA)

    # 下部囲み（黒背景＋ミント枠＋ミントのチェック＋白文字）
    old_box = (52, 800, 560, 878)
    box_scale = 1.3
    old_w, old_h = old_box[2] - old_box[0], old_box[3] - old_box[1]
    old_cy = (old_box[1] + old_box[3]) // 2
    new_w, new_h = old_w * box_scale, old_h * box_scale
    box = (52, int(old_cy - new_h / 2), int(52 + new_w), int(old_cy + new_h / 2))
    draw.rounded_rectangle(box, radius=18, fill=(15, 15, 18), outline=COLOR_MINT, width=4)
    cx, cy = box[0] + int(34 * box_scale), (box[1] + box[3]) // 2
    off = [(-14, 0), (-3, 13), (18, -16)]
    check_pts = [(cx + int(dx * box_scale), cy + int(dy * box_scale)) for dx, dy in off]
    draw.line(check_pts, fill=COLOR_MINT, width=int(6 * box_scale), joint="curve")
    text_x = box[0] + int(64 * box_scale)
    note_max_w = box[2] - text_x - 20
    f_note_box = fit_font(draw, cfg["note"], note_max_w, 41, 26)
    draw.text((text_x, cy - f_note_box.size // 2 - 2), cfg["note"], font=f_note_box, fill=COLOR_WHITE)

    # 3D素材（縦横比維持・contain合成）
    asset_path = os.path.join(OBJ_DIR, cfg["asset"])
    composite_asset(img, asset_path, resolve_asset_box(cfg, ASSET_BOX_E))

    # 個人運営・非公式（右下。素材と重なる可能性があるため暗い縁取りで可読性を確保）
    draw = ImageDraw.Draw(img)
    draw_note(draw, (W - 30, H - 48), align_right=True)

    return img.resize((FINAL_W, FINAL_H), Image.LANCZOS)


def render_a(cfg):
    img = Image.open(BG_A_PATH).convert("RGB")
    draw = ImageDraw.Draw(img)
    W, H = img.size

    # 上部枠（背景に描画済みの角丸枠の中）：「損しない」だけマゼンタ、他は白
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

    # 中見出し（区切り線=389 の上、白）
    f_mid = fit_font(draw, cfg["mid"], A_TEXT_MAX_WIDTH, 52, 30)
    draw.text((72, 300), cfg["mid"], font=f_mid, fill=COLOR_WHITE)

    # 大見出し（区切り線下〜黄色帯上、非常に大きい文字。セグメント単位で配色）
    f_big = fit_font_segments(draw, cfg["main"], A_TEXT_MAX_WIDTH, 148, 72)
    draw_segments(draw, 66, 450, cfg["main"], f_big)

    # 黄色帯（背景に描画済み）に濃紺文字
    f_band = fit_font(draw, cfg["band"], 900, 58, 30)
    bb = draw.textbbox((0, 0), cfg["band"], font=f_band)
    band_cy = (679 + 811) // 2
    draw.text((110, band_cy - (bb[3] - bb[1]) // 2 - bb[1]), cfg["band"], font=f_band, fill=COLOR_NAVY_TEXT)

    # 3D素材（縦横比維持・contain合成）
    asset_path = os.path.join(OBJ_DIR, cfg["asset"])
    composite_asset(img, asset_path, resolve_asset_box(cfg, ASSET_BOX_A))

    # 個人運営・非公式（黄色帯の下・左）
    draw = ImageDraw.Draw(img)
    draw_note(draw, (72, 838))

    return img.resize((FINAL_W, FINAL_H), Image.LANCZOS)


def render_one(cfg):
    if cfg["template"] == "E":
        return render_e(cfg)
    return render_a(cfg)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", help="生成対象を key で絞り込む")
    parser.add_argument("--grid", action="store_true", help="生成後に一覧グリッド画像も出力する（Git管理対象外）")
    args = parser.parse_args()

    validate_configs()

    targets = CONFIGS
    if args.only:
        keys = set(args.only)
        targets = [c for c in CONFIGS if c["key"] in keys]
        missing = keys - {c["key"] for c in targets}
        if missing:
            print(f"[警告] 未知のkeyを無視しました: {sorted(missing)}")

    generated = []
    for cfg in targets:
        img = render_one(cfg)
        out_path = os.path.join(REPO_ROOT, cfg["out"])
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        img.save(out_path, quality=95)
        size = img.size
        ok = "OK" if size == (FINAL_W, FINAL_H) else "NG"
        print(f"[{ok}] {cfg['out']} ({size[0]}x{size[1]})")
        generated.append((cfg, out_path))

    if args.grid and generated:
        build_grid([p for _, p in generated])
        print(f"一覧グリッド画像を出力しました: {GRID_OUT_PATH}")

    print(f"完了: {len(generated)}件生成")


def build_grid(paths):
    import math

    cols = 4
    rows = math.ceil(len(paths) / cols)
    thumb_w, thumb_h = 300, 158
    pad = 8
    grid = Image.new(
        "RGB",
        (cols * (thumb_w + pad) + pad, rows * (thumb_h + pad) + pad),
        (40, 40, 40),
    )
    for i, p in enumerate(paths):
        im = Image.open(p).convert("RGB").resize((thumb_w, thumb_h))
        x = pad + (i % cols) * (thumb_w + pad)
        y = pad + (i // cols) * (thumb_h + pad)
        grid.paste(im, (x, y))
    grid.save(GRID_OUT_PATH)


if __name__ == "__main__":
    main()
