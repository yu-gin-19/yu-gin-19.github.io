#!/usr/bin/env node
/**
 * validate-content.mjs
 *
 * 静的ブログ（yu-gin-19.github.io-main）の公開コンテンツを対象にした
 * 軽量な事実修正・SEOリライトの再発防止チェッカー。
 * Node.js 標準機能のみで動作し、外部npmパッケージには依存しない。
 *
 * 使い方:
 *   node scripts/validate-content.mjs
 *
 * 終了コード:
 *   0 = 問題（エラー扱いの項目）なし
 *   1 = 1件以上のエラー扱いの問題を検出
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// ------------------------------------------------------------------
// 走査対象・除外対象の設定
// ------------------------------------------------------------------

// 公開コンテンツに限定して走査するエントリ（リポジトリルートからの相対パス）
const SCAN_ENTRIES = ['index.html', 'articles', 'sns', 'components', 'sitemap.xml'];

// 読み込み対象の拡張子（HTML / Markdown / JavaScript / JSON / XML）
const TARGET_EXTENSIONS = new Set(['.html', '.md', '.js', '.json', '.xml']);

// 除外するディレクトリ名（画像・フォント等のバイナリは拡張子フィルタで自然に除外される）
const EXCLUDE_DIR_NAMES = new Set(['.git', 'node_modules']);

// このスクリプト自身・レポート類は明示的に除外
const EXCLUDE_FILE_ABS = new Set([path.resolve(__filename)]);

/**
 * SCAN_ENTRIES を起点に対象ファイル一覧を再帰的に収集する
 */
function collectFiles() {
  const results = [];

  function walk(absPath) {
    let stat;
    try {
      stat = fs.statSync(absPath);
    } catch {
      return; // 存在しないエントリはスキップ
    }

    if (stat.isDirectory()) {
      if (EXCLUDE_DIR_NAMES.has(path.basename(absPath))) return;
      for (const child of fs.readdirSync(absPath)) {
        walk(path.join(absPath, child));
      }
      return;
    }

    if (!stat.isFile()) return;

    const resolved = path.resolve(absPath);
    if (EXCLUDE_FILE_ABS.has(resolved)) return; // scripts/自身・レポート等

    const ext = path.extname(absPath).toLowerCase();
    if (!TARGET_EXTENSIONS.has(ext)) return; // バイナリ・画像・フォント等は自然に除外

    results.push(absPath);
  }

  for (const entry of SCAN_ENTRIES) {
    walk(path.join(REPO_ROOT, entry));
  }

  return results;
}

// ------------------------------------------------------------------
// 共通ユーティリティ
// ------------------------------------------------------------------

/** issues: { file, line, type, message, severity } */
const issues = [];

function toRel(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
}

function addIssue(file, line, type, message, severity = 'error') {
  issues.push({ file: toRel(file), line, type, message, severity });
}

/** テキスト中のオフセット(0-based index)から行番号(1-based)を求めるための索引を作る */
function buildLineOffsets(text) {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

function lineFromOffset(offsets, idx) {
  let lo = 0;
  let hi = offsets.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= idx) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans + 1;
}

/** 前後 ~100文字の文脈を取り出す（同一文/表見出し近接のおおまかな近似） */
function contextWindow(text, idx, matchLen, radius = 100) {
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + matchLen + radius);
  return text.slice(start, end);
}

/** text 内での phrase の全出現位置(0-based index)を配列で返す */
function findAllIndexes(text, phrase) {
  const indexes = [];
  let start = 0;
  while (true) {
    const idx = text.indexOf(phrase, start);
    if (idx === -1) break;
    indexes.push(idx);
    start = idx + phrase.length;
  }
  return indexes;
}

// ------------------------------------------------------------------
// 1. 禁止語句リスト（事実誤認・誤解を招く表現の再発防止）
// ------------------------------------------------------------------

const BANNED_PHRASES = [
  {
    text: '毎月エントリー',
    reason: 'SPU施策はエントリー要否がキャンペーンにより異なり、断定表現は実際の条件と齟齬を生むおそれがある',
  },
  {
    text: '持っているだけでSPU',
    reason: '実際はエントリーや条件達成が必要な場合があり、「持っているだけ」は誤解を招く表現',
  },
  {
    text: '月500ポイントの差',
    reason: '具体的な差額は利用額・条件により変動するため、断定的な数値表現は不正確',
  },
  {
    text: '6,000ポイントの差',
    reason: '年換算の断定数値も条件次第で変動するため、断定表現は不正確',
  },
  {
    text: '月400pt上限',
    reason: 'SPU上限ポイントの数値が実際の制度と異なる可能性がある',
  },
  {
    text: '上限月400pt',
    reason: 'SPU上限ポイントの数値が実際の制度と異なる可能性がある',
  },
  {
    text: 'market.rakuten.co.jp/point/spu/',
    reason: '古い・変更された可能性のあるURLパスを直接記載するとリンク切れの原因になる',
  },
  {
    text: 'brandavenue.rakuten.co.jp/guide/spu/',
    reason: '古い・変更された可能性のあるURLパスを直接記載するとリンク切れの原因になる',
  },
  {
    text: '月途中解約でも料金は満額',
    reason: '実際の日割り計算の扱いと異なる可能性がある事実誤認表現',
  },
  {
    text: '@rakuten.jp',
    reason: '実在性が確認できない/なりすましと誤解されうるメールドメインの記載',
  },
  {
    text: '楽天モバイルで購入したSIMロックあり',
    reason: '楽天モバイルはSIMロックなしで販売しているため事実と異なる',
  },
  {
    text: '自動的に楽天ポイントカードが提示',
    reason: '実際には都度の操作が必要な場合があり「自動的」は誤り',
  },
  {
    text: '翌月分への反映になる可能性',
    reason: 'ポイント反映タイミングに関する断定的表現が不正確なおそれがある',
  },
  {
    text: '年0.38%',
    reason: '金利等の数値は変動するため固定値の断定記載は誤情報のリスクがある',
  },
  {
    text: '900ポイント近く',
    reason: '根拠が不明瞭な概算数値の断定表現',
  },
  {
    text: 'Rakuten Mobile 社員',
    reason: '運営者の立場は「楽天社員」であり、なりすまし・誤解を招く表現',
  },
  {
    text: 'リンクを踏むだけで特典対象',
    reason: '実際には申込み等の追加条件が必要であり誤解を招く表現',
  },
  {
    text: '自動的に特典対象',
    reason: '条件を満たさず自動的に適用されるかのような誤解を招く表現',
  },
  {
    text: '21本',
    reason: '出典・根拠が確認できない具体的本数の断定表現',
  },
  {
    text: '自社回線で99%以上',
    reason: '自社回線のみでの人口カバー率が99%以上であるかのような事実誤認表現（実際はパートナー回線を含む場合がある）',
  },
  {
    text: '現在の最強プランしかない',
    reason: '実際には複数プランが存在する可能性があり、選択肢がないかのような誤解を招く断定表現',
  },
  {
    text: 'プランが1つしかない',
    reason: '実際には複数プランが存在する可能性があり、選択肢がないかのような誤解を招く断定表現',
  },
  {
    text: '積立設定で自動達成',
    reason: '積立設定のみで条件が自動的に達成されるかのような誤解を招く表現（実際には金額・継続等の追加条件がある場合がある）',
  },
  {
    text: '積立NISAを楽天証券でやるだけ',
    reason: '「やるだけ」で特典が得られるかのような誤解を招く表現（実際には条件達成が必要な場合がある）',
  },
  {
    text: '楽天銀行マネーブリッジ（+0.5倍）',
    reason: 'マネーブリッジのSPU倍率が実際の制度と異なる可能性がある断定数値表現',
  },
];

// 楽天モバイル特典分+4倍の正しい条件説明（複数ルールで共有する）
const RAKUTEN_MOBILE_BENEFIT_CORRECT_CONDITION =
  '楽天モバイル特典分+4倍には対象プラン利用とSPUへのエントリーが必要で、ポイント獲得には楽天市場での対象購入も必要';

// ある語句（anchor）の近接（前後n文字程度）に、もう一方の語句（nearby、複数可）が
// 存在する場合にのみ問題として扱う近接判定ルール群。
// nearby を省略した場合は anchor（単独のフレーズ）自体を検出対象とする。
const PROXIMITY_RULES = [
  {
    anchor: '0570・188',
    nearby: ['22円/30秒'],
    radius: 100,
    type: 'BANNED_PHRASE_PROXIMITY',
    reason:
      'ナビダイヤル番号と通話料の組み合わせが実際の料金体系と異なる可能性がある誤情報の組み合わせ',
  },
  {
    anchor: '99.9%',
    nearby: ['さらにパートナー回線'],
    radius: 150,
    type: 'COVERAGE_DOUBLE_COUNTING',
    reason:
      '人口カバー率99.9%とパートナー回線の併記により、カバー率の二重計上・誤認を招くおそれがある組み合わせ',
  },
  {
    anchor: '都市部・郊外',
    nearby: ['問題ないケースがほとんど'],
    radius: 150,
    type: 'OVERGENERALIZATION',
    reason: '地域差があるにもかかわらず「ほとんど問題ない」と過度に一般化する断定表現のおそれ',
  },
  {
    anchor: '楽天モバイルを契約するだけで',
    nearby: ['SPU+4倍'],
    radius: 150,
    type: 'MISLEADING_AUTOMATIC_BENEFIT',
    reason: `「契約するだけ」でSPU+4倍が自動的に得られるかのような誤解を招く表現（${RAKUTEN_MOBILE_BENEFIT_CORRECT_CONDITION}）`,
  },
  {
    anchor: '楽天モバイルに入るだけで',
    nearby: ['+4倍'],
    radius: 150,
    type: 'MISLEADING_AUTOMATIC_BENEFIT',
    reason: `「入るだけ」で+4倍が自動的に得られるかのような誤解を招く表現（${RAKUTEN_MOBILE_BENEFIT_CORRECT_CONDITION}）`,
  },
  {
    anchor: '楽天モバイルを使うだけで',
    nearby: ['+4倍'],
    radius: 150,
    type: 'MISLEADING_AUTOMATIC_BENEFIT',
    reason: `「使うだけ」で+4倍が自動的に得られるかのような誤解を招く表現（${RAKUTEN_MOBILE_BENEFIT_CORRECT_CONDITION}）`,
  },
  {
    anchor: '契約しているだけ',
    nearby: ['SPU', '+4倍'],
    radius: 150,
    type: 'MISLEADING_AUTOMATIC_BENEFIT',
    reason: `「契約しているだけ」でSPU/+4倍が自動的に得られるかのような誤解を招く表現（${RAKUTEN_MOBILE_BENEFIT_CORRECT_CONDITION}）`,
  },
  {
    anchor: '追加するだけ',
    nearby: ['SPU', '+6倍', '合計7倍'],
    radius: 150,
    type: 'MISLEADING_AUTOMATIC_BENEFIT',
    reason:
      '「追加するだけ」でSPU上乗せ（+6倍・合計7倍等）が自動的に得られるかのような誤解を招く表現（対象プランの利用やSPUへのエントリー、各サービスの利用条件達成が必要）',
  },
  {
    anchor: '契約で+4倍',
    nearby: ['自動'],
    radius: 100,
    type: 'MISLEADING_AUTOMATIC_BENEFIT',
    reason: `「契約で+4倍」を「自動」と結び付ける記述は、条件なしに自動加算されるかのような誤解を招く表現（${RAKUTEN_MOBILE_BENEFIT_CORRECT_CONDITION}）`,
  },
  {
    anchor: 'データタイプ',
    nearby: ['電話番号なし'],
    radius: 100,
    type: 'MISLEADING_DATA_PLAN_DESCRIPTION',
    reason:
      'データタイプ（データ専用回線）でも電話番号が付与される場合があり、一律「電話番号なし」とするのは事実と異なるおそれがある表現',
  },
  {
    anchor: 'iPhone以外',
    nearby: ['楽天リンク', 'Rakuten Link'],
    radius: 100,
    type: 'DEVICE_FEATURE_MISDESCRIPTION',
    reason:
      'Rakuten Link（楽天リンク）はiPhoneでも利用可能であり、「iPhone以外」に限定する記述は事実と異なるおそれがある表現',
  },
  {
    anchor: '日常使いは問題なし',
    radius: 100,
    type: 'OVERGENERALIZATION',
    reason:
      'エリアや利用環境による通信品質の差があるにもかかわらず「日常使いは問題なし」と断定する表現のおそれ',
  },
  {
    anchor: '圏外になるケースは限定的',
    radius: 100,
    type: 'OVERGENERALIZATION',
    reason: '圏外になり得る条件・頻度は利用者の環境により異なるため、限定的と断定する表現のおそれ',
  },
  {
    anchor: 'エリアへの不安はかなり解消',
    radius: 100,
    type: 'OVERGENERALIZATION',
    reason: 'エリアに対する不安の解消度合いは利用者の環境により異なるため、断定する表現のおそれ',
  },
  {
    anchor: '事前確認で解消',
    radius: 100,
    type: 'OVERGENERALIZATION',
    reason:
      '事前確認のみで不安・懸念が解消されるとは限らないにもかかわらず、断定する表現のおそれ',
  },
  {
    anchor: 'エリアが確認できたら、あとは申し込むだけ',
    radius: 100,
    type: 'OVERSIMPLIFIED_PROCESS_CLAIM',
    reason:
      'エリア確認以外にも検討すべき条件（料金プラン・端末対応等）があるにもかかわらず、手続きを過度に単純化する表現のおそれ',
  },
];

// anchor（肯定表現）が近接に必須の語句（requiredNearby）を伴わない場合に
// 問題として扱う逆方向の近接判定ルール群（＝requiredNearbyが見つからない場合にエラー）
const REQUIRED_CONTEXT_RULES = [
  {
    anchor: '契約すると+4倍',
    requiredNearby: ['エントリー'],
    radius: 150,
    type: 'MISLEADING_AUTOMATIC_BENEFIT',
    reason: `「契約すると+4倍」の近接に「エントリー」等の必要条件への言及がなく、自動的に付与されるかのような誤解を招くおそれ（${RAKUTEN_MOBILE_BENEFIT_CORRECT_CONDITION}）`,
  },
];

function checkBannedPhrases(file, text) {
  const offsets = buildLineOffsets(text);

  for (const { text: phrase, reason } of BANNED_PHRASES) {
    for (const idx of findAllIndexes(text, phrase)) {
      const line = lineFromOffset(offsets, idx);
      addIssue(
        file,
        line,
        'BANNED_PHRASE',
        `禁止語句「${phrase}」を検出（理由: ${reason}）`,
        'error'
      );
    }
  }
}

// 否定文（誤解を打ち消す正しい表現）を誤検知しないための手がかり。
// 単純に近接ウィンドウ全体のどこかに1つでも含まれていれば除外、という緩い判定はしない。
// 下記 isAnchorNegated() で、この語句が「anchorの直後〜nearbyの間」または
// 「anchorの前後ごく近く（tightRadius文字以内）」にある場合のみ、
// 検出した肯定表現そのものへの否定とみなす。
const NEGATION_CUES = [
  'ません',
  'ない',
  'わけではありません',
  'わけではない',
  'とは限らない',
  'ではありません',
  'ではない',
  '限りません',
  '断定できません',
  'とは言えません',
  '自動的にポイントが増えるわけ',
  '自動的に得られるわけ',
];

// anchor（肯定表現）の否定文脈を厳密に判定する範囲の半径（前後何文字まで見るか）
const NEGATION_TIGHT_RADIUS = 40;

/**
 * text 内、[rangeStart, rangeEnd) の範囲で phrase の出現を探し、
 * refStart（通常はanchorの開始位置）に最も近いものを1件返す。
 */
function findClosestInRange(text, phrase, rangeStart, rangeEnd, refStart) {
  let best = null;
  let bestDist = Infinity;
  let searchFrom = rangeStart;
  while (true) {
    const idx = text.indexOf(phrase, searchFrom);
    if (idx === -1 || idx >= rangeEnd) break;
    const dist = Math.abs(idx - refStart);
    if (dist < bestDist) {
      bestDist = dist;
      best = { start: idx, end: idx + phrase.length };
    }
    searchFrom = idx + 1;
  }
  return best;
}

/**
 * anchor（肯定表現）が実際に否定文脈で打ち消されているかを判定する。
 * - anchorの直後〜nearbyの間（順序が逆でもmin/maxで吸収）に否定語があるか
 * - anchorの前後ごく近く（NEGATION_TIGHT_RADIUS文字以内）に否定語があるか
 * のいずれかに該当する場合のみ true（否定されている＝エラーにしない）とする。
 * nearby省略時（単独フレーズ判定）は nStart/nEnd に anchor自身の範囲を渡す。
 */
function isAnchorNegated(text, aStart, aEnd, nStart, nEnd) {
  const betweenStart = Math.min(aStart, nStart);
  const betweenEnd = Math.max(aEnd, nEnd);
  const betweenText = text.slice(betweenStart, betweenEnd);
  if (NEGATION_CUES.some((cue) => betweenText.includes(cue))) return true;

  const tightStart = Math.max(0, aStart - NEGATION_TIGHT_RADIUS);
  const tightEnd = Math.min(text.length, aEnd + NEGATION_TIGHT_RADIUS);
  const tightText = text.slice(tightStart, tightEnd);
  if (NEGATION_CUES.some((cue) => tightText.includes(cue))) return true;

  return false;
}

function checkProximityRules(file, text) {
  const offsets = buildLineOffsets(text);

  for (const rule of PROXIMITY_RULES) {
    const radius = rule.radius ?? 100;
    const nearbyList = rule.nearby && rule.nearby.length ? rule.nearby : null;

    for (const aIdx of findAllIndexes(text, rule.anchor)) {
      const aStart = aIdx;
      const aEnd = aIdx + rule.anchor.length;

      let nStart = aStart;
      let nEnd = aEnd;
      let hitPhrase = null;

      if (nearbyList) {
        const rangeStart = Math.max(0, aStart - radius);
        const rangeEnd = Math.min(text.length, aEnd + radius);
        let found = null;
        for (const n of nearbyList) {
          const occ = findClosestInRange(text, n, rangeStart, rangeEnd, aStart);
          if (occ) {
            const dist = Math.abs(occ.start - aStart);
            if (!found || dist < found.dist) {
              found = { occ, phrase: n, dist };
            }
          }
        }
        if (!found) continue; // 近接に該当する結果表現が見つからない場合は対象外
        nStart = found.occ.start;
        nEnd = found.occ.end;
        hitPhrase = found.phrase;
      }

      if (isAnchorNegated(text, aStart, aEnd, nStart, nEnd)) continue; // 肯定表現自体への否定文脈として扱い、エラーにしない

      const line = lineFromOffset(offsets, aStart);
      const message = hitPhrase
        ? `「${rule.anchor}」の近接（前後${radius}文字程度）に「${hitPhrase}」を検出（理由: ${rule.reason}）`
        : `「${rule.anchor}」を検出（理由: ${rule.reason}）`;
      addIssue(file, line, rule.type || 'BANNED_PHRASE_PROXIMITY', message, 'error');
    }
  }
}

function checkRequiredContextRules(file, text) {
  const offsets = buildLineOffsets(text);

  for (const rule of REQUIRED_CONTEXT_RULES) {
    const radius = rule.radius ?? 150;
    for (const aIdx of findAllIndexes(text, rule.anchor)) {
      const aStart = aIdx;
      const aEnd = aIdx + rule.anchor.length;
      const rangeStart = Math.max(0, aStart - radius);
      const rangeEnd = Math.min(text.length, aEnd + radius);
      const windowText = text.slice(rangeStart, rangeEnd);

      const hasRequired = rule.requiredNearby.some((r) => windowText.includes(r));
      if (hasRequired) continue; // 必要条件への言及があるため対象外

      const line = lineFromOffset(offsets, aStart);
      addIssue(
        file,
        line,
        rule.type || 'MISSING_REQUIRED_CONTEXT',
        `「${rule.anchor}」の近接（前後${radius}文字程度）に「${rule.requiredNearby.join('/')}」が見つからない（理由: ${rule.reason}）`,
        'error'
      );
    }
  }
}

// 同一ファイル内に矛盾する数値表現が同時に残っていないかの近接判定
const CONTRADICTION_COOCCURRENCE_RULES = [
  {
    a: '年約6万円',
    b: '44,664円',
    reason:
      '年間節約額の表記が「年約6万円」（概算）と「44,664円」（詳細内訳の数値）で不一致・矛盾しているおそれがある',
  },
];

function checkContradictionCoOccurrence(file, text) {
  const offsets = buildLineOffsets(text);

  for (const rule of CONTRADICTION_COOCCURRENCE_RULES) {
    if (text.includes(rule.a) && text.includes(rule.b)) {
      const idx = text.indexOf(rule.a);
      const line = lineFromOffset(offsets, idx);
      addIssue(
        file,
        line,
        'CONTRADICTORY_FIGURES_SAME_FILE',
        `「${rule.a}」と「${rule.b}」が同一ファイル内に同時に存在（理由: ${rule.reason}）`,
        'error'
      );
    }
  }
}

// FamilyMart関連記事（articles/familymart-spu配下）にのみ適用する残存チェック
const FAMILYMART_PATH_PREFIX = 'articles/familymart-spu';
const FAMILYMART_RESTRICTED_PHRASES = ['SPU+6倍の場合', 'SPU+6.5倍'];

function checkFamilyMartRestrictedPhrases(file, text) {
  const rel = toRel(file);
  if (!rel.startsWith(FAMILYMART_PATH_PREFIX)) return;

  const offsets = buildLineOffsets(text);
  for (const phrase of FAMILYMART_RESTRICTED_PHRASES) {
    for (const idx of findAllIndexes(text, phrase)) {
      const line = lineFromOffset(offsets, idx);
      addIssue(
        file,
        line,
        'FAMILYMART_STALE_SPU_RATE',
        `FamilyMart関連ファイルに古いSPU倍率表記「${phrase}」が残存（理由: 現行の訴求内容と齟齬が生じるおそれ）`,
        'error'
      );
    }
  }
}

// ------------------------------------------------------------------
// 2. 料金表記の監査（禁止ではなくレポート／家族割文脈がない場合はエラー）
// ------------------------------------------------------------------

const PRICE_AUDIT_TARGETS = ['3,168円', '2,068円', '968円'];
const FAMILY_DISCOUNT_MARKERS = ['最強家族割', '家族割適用時'];

/**
 * テキスト中の <table ...>...</table> ブロックを非貪欲マッチで抽出する。
 * 価格が表内のセル（<td>）にあり、家族割の文言が表見出し（<caption>/<thead>/<th>）
 * にある場合でも、HTMLタグを挟んで前後100文字の外に出てしまい誤検知するのを防ぐため、
 * 表全体のテキストをまとめて家族割文脈の判定対象にする。
 */
function extractTableBlocks(text) {
  const blocks = [];
  const re = /<table\b[^>]*>[\s\S]*?<\/table>/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    blocks.push({ start: m.index, end: m.index + m[0].length, content: m[0] });
  }
  return blocks;
}

function findEnclosingTable(tableBlocks, idx) {
  for (const b of tableBlocks) {
    if (idx >= b.start && idx < b.end) return b;
  }
  return null;
}

function checkPriceAudit(file, text) {
  const offsets = buildLineOffsets(text);
  const tableBlocks = extractTableBlocks(text);

  for (const price of PRICE_AUDIT_TARGETS) {
    for (const idx of findAllIndexes(text, price)) {
      const line = lineFromOffset(offsets, idx);
      const table = findEnclosingTable(tableBlocks, idx);

      let hasFamilyContext;
      let scopeDesc;
      if (table) {
        // 表内の価格: caption/thead/th を含む表全体のテキストで家族割文脈を確認する
        hasFamilyContext = FAMILY_DISCOUNT_MARKERS.some((m) => table.content.includes(m));
        scopeDesc = 'テーブル全体（caption/thead/th含む）';
      } else {
        // 表外の価格: 近接ブロック判定の近似として従来の前後100文字ルールを使う
        const window = contextWindow(text, idx, price.length, 100);
        hasFamilyContext = FAMILY_DISCOUNT_MARKERS.some((m) => window.includes(m));
        scopeDesc = '前後100文字程度';
      }

      // 監査レポート（常に一覧化）
      addIssue(
        file,
        line,
        'PRICE_AUDIT',
        `料金表記「${price}」を検出（判定範囲: ${scopeDesc} / 家族割文脈: ${hasFamilyContext ? 'あり' : 'なし'}）`,
        'info'
      );

      // 家族割文脈がない場合はエラー扱い
      if (!hasFamilyContext) {
        addIssue(
          file,
          line,
          'PRICE_AUDIT_MISSING_CONTEXT',
          `料金表記「${price}」の${scopeDesc}に「最強家族割」「家族割適用時」のいずれも見つからない`,
          'error'
        );
      }
    }
  }
}

// ------------------------------------------------------------------
// 3. HTML構造チェック（JSON-LD / id重複 / 目次アンカー / aria参照 / 内部リンク / スクリプト構文）
// ------------------------------------------------------------------

// <script ...>...</script> ブロックを抽出（属性・内容・開始/終了インデックスを保持）
function extractScriptBlocks(text) {
  const blocks = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const attrs = m[1] || '';
    const content = m[2] || '';
    const typeMatch = attrs.match(/type\s*=\s*["']([^"']*)["']/i);
    const type = typeMatch ? typeMatch[1].trim().toLowerCase() : '';
    const hasSrc = /\bsrc\s*=/.test(attrs);
    blocks.push({
      fullMatch: m[0],
      attrs,
      content,
      type,
      hasSrc,
      start: m.index,
      contentStart: m.index + m[0].indexOf(content, attrs.length + '<script'.length + 1),
      end: m.index + m[0].length,
    });
  }
  return blocks;
}

// id/href/aria抽出時の誤検知を避けるため、<script>...</script>ブロックの中身を
// 改行数を保ったまま空白に置換したテキストを作る（行番号がずれないようにするため）
function maskScriptBlocks(text, blocks) {
  // 後ろのブロックから順に置換することで、前方のオフセットがずれないようにする
  let masked = text;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    // <script ...> と </script> の間（contentStart 〜 contentStart+content.length）のみ空白化
    const before = masked.slice(0, b.contentStart);
    const blanked = b.content.replace(/[^\n]/g, ' ');
    const after = masked.slice(b.contentStart + b.content.length);
    masked = before + blanked + after;
  }
  return masked;
}

function checkJsonLd(file, text, blocks) {
  const offsets = buildLineOffsets(text);
  for (const b of blocks) {
    if (b.type !== 'application/ld+json') continue;
    const trimmed = b.content.trim();
    if (!trimmed) continue;
    try {
      JSON.parse(trimmed);
    } catch (err) {
      const line = lineFromOffset(offsets, b.contentStart);
      addIssue(
        file,
        line,
        'JSON_LD_PARSE_ERROR',
        `JSON-LDの解析に失敗: ${err.message}`,
        'error'
      );
    }
  }
}

function checkInlineScriptSyntax(file, text, blocks) {
  const offsets = buildLineOffsets(text);
  for (const b of blocks) {
    if (b.type === 'application/ld+json') continue;
    // module は new Function では構文チェックできないためスキップ（現状該当なし）
    if (b.type === 'module') continue;
    // type指定があり JS 系でない場合（テンプレート等）はスキップ
    if (b.type && !['text/javascript', 'application/javascript', ''].includes(b.type)) continue;
    // src指定のみで中身が空の外部スクリプトはスキップ
    if (b.hasSrc && !b.content.trim()) continue;
    if (!b.content.trim()) continue;

    try {
      // eslint-disable-next-line no-new-func
      new Function(b.content);
    } catch (err) {
      const line = lineFromOffset(offsets, b.contentStart);
      addIssue(
        file,
        line,
        'INLINE_SCRIPT_SYNTAX_ERROR',
        `インラインスクリプトの構文エラー: ${err.message}`,
        'error'
      );
    }
  }
}

function checkIdDuplicates(file, maskedText) {
  const offsets = buildLineOffsets(maskedText);
  const seen = new Map(); // id -> first line
  const re = /\bid\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(maskedText)) !== null) {
    const id = m[1];
    const line = lineFromOffset(offsets, m.index);
    if (seen.has(id)) {
      addIssue(
        file,
        line,
        'DUPLICATE_ID',
        `id="${id}" が重複（初出: ${seen.get(id)}行目）`,
        'error'
      );
    } else {
      seen.set(id, line);
    }
  }
  return new Set(seen.keys());
}

function checkTocAnchors(file, maskedText, idSet) {
  const offsets = buildLineOffsets(maskedText);
  const re = /\bhref\s*=\s*["']#([^"'#]+)["']/g;
  let m;
  while ((m = re.exec(maskedText)) !== null) {
    const targetId = m[1];
    if (!targetId) continue; // href="#" は対象外
    const line = lineFromOffset(offsets, m.index);
    if (!idSet.has(targetId)) {
      addIssue(
        file,
        line,
        'BROKEN_ANCHOR',
        `href="#${targetId}" の参照先 id="${targetId}" が同一ファイル内に見つからない`,
        'error'
      );
    }
  }
}

function checkAriaReferences(file, maskedText, idSet) {
  const offsets = buildLineOffsets(maskedText);
  const re = /\b(aria-controls|aria-labelledby)\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(maskedText)) !== null) {
    const attr = m[1];
    const ids = m[2].split(/\s+/).filter(Boolean);
    const line = lineFromOffset(offsets, m.index);
    for (const id of ids) {
      if (!idSet.has(id)) {
        addIssue(
          file,
          line,
          'BROKEN_ARIA_REFERENCE',
          `${attr}="${id}" の参照先 id="${id}" が同一ファイル内に見つからない`,
          'error'
        );
      }
    }
  }
}

function isSkippableHref(href) {
  if (!href) return true;
  if (href.startsWith('#')) return true; // 同一ページ内アンカーは別チェックで検証済み
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('/')) {
    // scheme付き（http:, https:, mailto:, tel:, javascript: 等）は外部/非ファイル系として除外
    if (!/^https?:\/\//i.test(href)) return true;
    return true; // http(s)含め外部リンクは今回の内部リンク切れチェック対象外
  }
  if (href.startsWith('//')) return true; // protocol-relative = 外部扱い
  return false;
}

function resolveInternalTarget(href, fileDir) {
  const clean = href.split('#')[0].split('?')[0];
  let basePath;
  let rel;
  if (clean.startsWith('/')) {
    basePath = REPO_ROOT;
    rel = clean.slice(1);
  } else {
    basePath = fileDir;
    rel = clean;
  }
  return path.normalize(path.join(basePath, rel));
}

function internalTargetExists(target) {
  if (fs.existsSync(target)) {
    const st = fs.statSync(target);
    if (st.isDirectory()) {
      return fs.existsSync(path.join(target, 'index.html'));
    }
    return true;
  }
  if (fs.existsSync(target + '.html')) return true;
  return false;
}

function checkInternalLinks(file, maskedText) {
  const offsets = buildLineOffsets(maskedText);
  const fileDir = path.dirname(file);
  const re = /\bhref\s*=\s*["']([^"']*)["']/g;
  let m;
  while ((m = re.exec(maskedText)) !== null) {
    const href = m[1];
    if (isSkippableHref(href)) continue;
    const cleanNoQueryHash = href.split('#')[0].split('?')[0];
    if (!cleanNoQueryHash) continue; // "#..."や"?..."のみは対象外（isSkippableHrefで大半処理済み）

    const target = resolveInternalTarget(href, fileDir);
    const line = lineFromOffset(offsets, m.index);
    if (!internalTargetExists(target)) {
      addIssue(
        file,
        line,
        'BROKEN_INTERNAL_LINK',
        `href="${href}" の参照先が見つからない（解決先: ${toRel(target)}）`,
        'error'
      );
    }
  }
}

function checkHtmlStructure(file, text) {
  const blocks = extractScriptBlocks(text);
  checkJsonLd(file, text, blocks);
  checkInlineScriptSyntax(file, text, blocks);

  const maskedText = maskScriptBlocks(text, blocks);
  const idSet = checkIdDuplicates(file, maskedText);
  checkTocAnchors(file, maskedText, idSet);
  checkAriaReferences(file, maskedText, idSet);
  checkInternalLinks(file, maskedText);
}

// ------------------------------------------------------------------
// メイン処理
// ------------------------------------------------------------------

function main() {
  const files = collectFiles();

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      addIssue(file, 0, 'READ_ERROR', `ファイルの読み込みに失敗: ${err.message}`, 'error');
      continue;
    }

    // 全ファイル種別共通: 禁止語句・近接判定・料金表記監査・矛盾数値・限定残存チェック
    checkBannedPhrases(file, text);
    checkProximityRules(file, text);
    checkRequiredContextRules(file, text);
    checkPriceAudit(file, text);
    checkContradictionCoOccurrence(file, text);
    checkFamilyMartRestrictedPhrases(file, text);

    // HTML固有の構造チェック
    if (ext === '.html') {
      checkHtmlStructure(file, text);
    }
  }

  // 出力: ファイル → 行番号順にソート
  const sorted = [...issues].sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.line - b.line;
  });

  for (const issue of sorted) {
    const label = issue.severity === 'error' ? 'ERROR' : 'INFO';
    console.log(`${issue.file}:${issue.line} - [${label}] ${issue.type} - ${issue.message}`);
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  // 種別ごとのサマリ
  const byType = new Map();
  for (const i of issues) {
    byType.set(i.type, (byType.get(i.type) || 0) + 1);
  }

  console.log('');
  console.log('==================== サマリ ====================');
  console.log(`走査ファイル数: ${files.length}`);
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}件`);
  }
  console.log(`エラー件数: ${errorCount}件`);
  console.log(`情報（レポートのみ）件数: ${infoCount}件`);
  console.log('==================================================');

  process.exit(errorCount > 0 ? 1 : 0);
}

main();
