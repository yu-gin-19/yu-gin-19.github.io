"""
OGP画像 一括生成／再生成スクリプト（共通版）

articles/au-switch/generate_ogp.py, articles/card-review/generate_ogp.py,
articles/rakuten-link-guide/generate_ogp.py のロジック（斜め方向ピンク→ブラック
グラデーション、ダイヤ格子の装飾線、右側キャラクター、左側サイト名ラベル＋
カテゴリバッジ＋見出し2行、右下「個人運営・非公式」注記バッジ）を共通化し、
記事ごとの設定（CONFIGS）から複数のOGP画像をまとめて再生成する。

- 出力サイズ：1200×630px 固定
- ブランド表記は「楽天社員の損しない選び方」に統一
- 「個人運営・非公式」表示は維持
- フォントは Windows / macOS / Linux の日本語フォント候補を順に探索し、
  見つからない場合は例外を送出して停止する（豆腐文字を出力しない）

使い方:
    python scripts/generate-ogp-batch.py            # CONFIGS 全件を再生成
    python scripts/generate-ogp-batch.py --only securities-spu spu-4x
    python scripts/generate-ogp-batch.py --grid     # 生成後、一覧グリッド画像も出力
"""

import argparse
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHAR_PATH = os.path.join(REPO_ROOT, "sns", "images", "character.png")
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
GRID_OUT_PATH = os.path.join(SCRIPTS_DIR, "ogp_grid_preview.png")

BRAND_LABEL = "楽天社員の損しない選び方"
NOTE_TEXT = "個人運営・非公式"

COLOR_PINK = (255, 0, 140)
COLOR_BLACK = (28, 28, 28)
COLOR_WHITE = (255, 255, 255)
COLOR_WHITE_SUB = (255, 221, 221)
COLOR_ACCENT = (245, 197, 24)

MARGIN = 60
# 右側キャラクターと重ならないよう、本文テキストの最大幅を制限する
MAX_TEXT_WIDTH = 620

# --- フォント候補（優先順） -------------------------------------------------
# (bold候補, medium/regular候補) のタプルを OS ごとに列挙し、
# 実在する最初の組み合わせを採用する。
FONT_CANDIDATES = [
    # macOS
    (
        "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
        "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
    ),
    # Windows（游ゴシック）
    (
        r"C:\Windows\Fonts\YuGothB.ttc",
        r"C:\Windows\Fonts\YuGothM.ttc",
    ),
    # Windows（メイリオ、太字が無いため regular を bold 代わりに使用）
    (
        r"C:\Windows\Fonts\meiryob.ttc",
        r"C:\Windows\Fonts\meiryo.ttc",
    ),
    # Linux（Noto Sans CJK JP）
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


# --- 記事ごとの設定 ----------------------------------------------------------
# out: 出力先（REPO_ROOT からの相対パス）
# badge: カテゴリバッジ文言
# line1 / line2: 見出し（2行、line2 は空文字可）
# sub: サブコピー（無い場合は None）
CONFIGS = [
    {
        "key": "ahamo-vs-rakuten",
        "out": "articles/ahamo-vs-rakuten/ogp.png",
        "badge": "比較記事",
        "line1": "楽天モバイルとahamoを比較",
        "line2": "社員が正直に選ぶならどっち？",
        "sub": None,
    },
    {
        "key": "cancel-guide",
        "out": "articles/cancel-guide/ogp.png",
        "badge": "解約・手続きガイド",
        "line1": "解約前に確認すべきこと｜",
        "line2": "社員が正直に話す損しない辞め方",
        "sub": None,
    },
    {
        "key": "card-mobile-spu",
        "out": "articles/card-mobile-spu/ogp.png",
        "badge": "SPU解説",
        "line1": "楽天カード＋楽天モバイルで",
        "line2": "合計7倍",
        "sub": None,
    },
    {
        "key": "coverage-area",
        "out": "articles/coverage-area/ogp.png",
        "badge": "エリア解説",
        "line1": "楽天モバイルが繋がらない？",
        "line2": "エリア確認と対処法を元担当者が解説",
        "sub": None,
    },
    {
        "key": "demerits",
        "out": "articles/demerits/ogp.png",
        "badge": "デメリット解説",
        "line1": "楽天モバイルの弱点4つを",
        "line2": "社員が正直に解説します",
        "sub": None,
    },
    {
        "key": "familymart-spu",
        "out": "articles/familymart-spu/ogp.png",
        "badge": "SPU解説",
        "line1": "ファミリーマートがSPUに追加",
        "line2": "+0.5倍の条件を解説",
        "sub": None,
    },
    {
        "key": "marathon-strategy",
        "out": "articles/marathon-strategy/ogp.png",
        "badge": "マラソン攻略",
        "line1": "楽天お買い物マラソンを攻略する",
        "line2": "3つのポイント",
        "sub": None,
    },
    {
        "key": "monthly-report-2026-05",
        "out": "articles/monthly-report-2026-05/ogp.png",
        "badge": "実績公開",
        "line1": "楽天ポイント実績公開",
        "line2": "",
        "sub": None,
    },
    {
        "key": "rakuten-card",
        "out": "articles/rakuten-card/ogp.png",
        "badge": "カード解説",
        "line1": "楽天カードは作るべき？",
        "line2": "社員が本音で答えます",
        "sub": None,
    },
    {
        "key": "regret-reasons",
        "out": "articles/regret-reasons/ogp.png",
        "badge": "後悔・対策",
        "line1": "楽天モバイルで後悔した",
        "line2": "5つの理由と対策",
        "sub": None,
    },
    {
        "key": "securities-spu",
        "out": "articles/securities-spu/ogp.png",
        "badge": "SPU解説",
        "line1": "NISAだけでは対象外",
        "line2": "投資信託SPU+0.5倍の4条件",
        "sub": None,
    },
    {
        "key": "spu-4x",
        "out": "articles/spu-4x/ogp.png",
        "badge": "SPU解説",
        "line1": "対象プラン契約＋エントリーで",
        "line2": "SPU+4倍",
        "sub": None,
    },
    {
        "key": "spu-checklist",
        "out": "articles/spu-checklist/ogp.png",
        "badge": "ポイント攻略",
        "line1": "楽天SPU最大化",
        "line2": "完全チェックリスト",
        "sub": None,
    },
    {
        "key": "supersale-ai-concierge-2026",
        "out": "articles/supersale-ai-concierge-2026/ogp.png",
        "badge": "AI活用",
        "line1": "楽天スーパーSALEに",
        "line2": "AIコンシェルジュが登場",
        "sub": None,
    },
    {
        "key": "ogp-articles-index",
        "out": "images/ogp_articles.png",
        "badge": "記事一覧",
        "line1": "楽天モバイルのことなら",
        "line2": "社員が全部書きました",
        "sub": None,
    },
    # 以下3件は articles/*/generate_ogp.py にソースが個別に存在するが、
    # 出力済みPNGが更新前（旧ブランド名）のまま残っていたため、
    # 主文言はそのままにブランド表記のみ揃えて再生成する。
    {
        "key": "au-switch",
        "out": "articles/au-switch/OGP_au-switch.png",
        "badge": "体験談・5年間の記録",
        "line1": "auから乗り換えて5年",
        "line2": "正直な後悔と得した金額",
        "sub": "5年累計26万円以上の節約を社員が公開",
    },
    {
        "key": "card-review",
        "out": "articles/card-review/OGP_card-review.png",
        "badge": "審査対策・再申請ガイド",
        "line1": "楽天カード審査に落ちた",
        "line2": "理由と再申請のコツ",
        "sub": "楽天社員が通過基準を解説",
    },
    {
        "key": "rakuten-link-guide",
        "out": "articles/rakuten-link-guide/OGP_rakuten-link-guide.png",
        "badge": "通話品質・音質を解説",
        "line1": "Rakuten Linkの音質は",
        "line2": "5年使った元担当者が正直に解説",
        "sub": "個人の体験・感想として正直に書きます",
    },
]


def diagonal_gradient(img):
    """左上=ピンク、右下=ブラックの斜めグラデーション。"""
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
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    step = 60
    for x in range(-H, W + H, step):
        odraw.line([(x, 0), (x + H, H)], fill=(255, 255, 255, 30), width=1)
        odraw.line([(x, H), (x + H, 0)], fill=(255, 255, 255, 30), width=1)
    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"), (0, 0))


def fit_font(draw, text, font_path, max_width, start_size, min_size=26):
    """text が max_width に収まるまでフォントサイズを縮小する（文字切れ・はみ出し防止）。"""
    size = start_size
    if not text:
        return ImageFont.truetype(font_path, start_size)
    while size > min_size:
        f = ImageFont.truetype(font_path, size)
        bbox = draw.textbbox((0, 0), text, font=f)
        if (bbox[2] - bbox[0]) <= max_width:
            return f
        size -= 2
    return ImageFont.truetype(font_path, min_size)


def load_character():
    try:
        char = Image.open(CHAR_PATH).convert("RGBA")
    except FileNotFoundError:
        return None
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
    return char.resize((char_w, char_h), Image.LANCZOS)


def render_one(cfg):
    img = Image.new("RGB", (W, H))
    diagonal_gradient(img)
    draw_diamond_grid(img)
    img = img.convert("RGB")
    draw = ImageDraw.Draw(img)

    margin = MARGIN

    # サイト名ラベル（提灯アイコン＋テキスト）
    f_label = ImageFont.truetype(FONT_MEDIUM, 26)
    icon_r = 11
    icon_cx = margin + icon_r
    icon_cy = 53
    draw.ellipse(
        [icon_cx - icon_r, icon_cy - icon_r, icon_cx + icon_r, icon_cy + icon_r],
        fill=(224, 48, 48),
    )
    draw.text(
        (margin + icon_r * 2 + 10, 40), BRAND_LABEL, font=f_label, fill=COLOR_WHITE_SUB
    )

    # カテゴリバッジ
    f_badge = ImageFont.truetype(FONT_MEDIUM, 24)
    badge_text = cfg["badge"]
    bbox = draw.textbbox((0, 0), badge_text, font=f_badge)
    bw = bbox[2] - bbox[0] + 32
    bh = bbox[3] - bbox[1] + 18
    badge_y = 100
    draw.rounded_rectangle(
        [margin, badge_y, margin + bw, badge_y + bh], radius=6, fill=COLOR_PINK
    )
    draw.text((margin + 16, badge_y + 9), badge_text, font=f_badge, fill=COLOR_WHITE)

    # 見出し（最大2行、文字切れ・はみ出し防止のため自動縮小）
    line1 = cfg["line1"]
    line2 = cfg.get("line2") or ""
    f_title1 = fit_font(draw, line1, FONT_BOLD, MAX_TEXT_WIDTH, start_size=54)
    f_title2 = fit_font(draw, line2, FONT_BOLD, MAX_TEXT_WIDTH, start_size=54) if line2 else None

    if line2:
        draw.text((margin, 210), line1, font=f_title1, fill=COLOR_WHITE)
        draw.text((margin, 280), line2, font=f_title2, fill=COLOR_WHITE)
    else:
        # 1行のみの場合は縦方向の中央付近に配置
        draw.text((margin, 245), line1, font=f_title1, fill=COLOR_WHITE)

    # サブコピー（任意）
    sub = cfg.get("sub")
    if sub:
        f_sub = fit_font(draw, sub, FONT_MEDIUM, MAX_TEXT_WIDTH, start_size=28)
        draw.text((margin, 360), sub, font=f_sub, fill=COLOR_WHITE_SUB)

    # キャラクター画像（右側）
    char = load_character()
    if char is not None:
        char_x = W - char.width + 40
        char_y = H - char.height - 10
        img.paste(char, (char_x, char_y), char)

    draw = ImageDraw.Draw(img)

    # 「個人運営・非公式」バッジ（右下）
    f_note = ImageFont.truetype(FONT_MEDIUM, 22)
    bbox = draw.textbbox((0, 0), NOTE_TEXT, font=f_note)
    nw = bbox[2] - bbox[0] + 22
    nh = bbox[3] - bbox[1] + 12
    nx0 = W - nw - 30
    ny0 = H - nh - 24
    draw.rounded_rectangle(
        [nx0, ny0, nx0 + nw, ny0 + nh],
        radius=6,
        fill=(139, 26, 26),
        outline=COLOR_ACCENT,
        width=1,
    )
    draw.text((nx0 + 11, ny0 + 6), NOTE_TEXT, font=f_note, fill=COLOR_ACCENT)

    return img


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", help="生成対象を key で絞り込む")
    parser.add_argument("--grid", action="store_true", help="生成後に一覧グリッド画像も出力する")
    args = parser.parse_args()

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
        ok = "OK" if size == (W, H) else "NG"
        print(f"[{ok}] {cfg['out']} ({size[0]}x{size[1]})")
        generated.append((cfg, out_path))

    if args.grid and generated:
        build_grid([p for _, p in generated])
        print(f"一覧グリッド画像を出力しました: {GRID_OUT_PATH}")

    print(f"完了: {len(generated)}件生成")


def build_grid(paths):
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
