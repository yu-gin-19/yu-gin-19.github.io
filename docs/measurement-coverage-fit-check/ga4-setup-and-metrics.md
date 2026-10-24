# GA4管理画面の設定手順と指標の見方

作成日：2026-10-24（初版）／2026-10-24 再修正版（再レビューR1〜R6対応）
ステータス：**手順作成済み／登録未実施**（Claude CodeはGA4管理画面へのアクセス権限を持たないため、コード実装のみ完了。以下の手順をGA4管理者が実施する）

対象プロパティ：yu-gin-19.github.io（gtag ID: `G-W82F5QSC9N`）

このファイルはPR内のコード（`components/cta-tracking.js`・`components/fit-check-diagnosis.js`・対象ページのHTML）と合わせてレビューできるよう、リポジトリ内（`docs/measurement-coverage-fit-check/`）に置いている。

## 1. イベント名・発火条件・パラメータ一覧

| イベント名 | 発火条件 | 主なパラメータ |
|---|---|---|
| `cta_view` | `data-cta-id`付き要素が50%以上の可視率で、表示中タブのまま連続1秒以上見えた時。1ページ表示・同一cta_idにつき1回 | `cta_id`, `cta_kind`, `page_type`, `cta_position`, `destination` |
| `referral_cta_click` | 従業員紹介リンクのクリック | `cta_id`, `cta_kind`, `page_type`, `cta_position`, `offer_type`, `reader_stage`, `destination` |
| `journey_click` | サイト内導線（診断・条件確認等）のクリック | `cta_id`, `cta_kind`, `page_type`, `cta_position`, `destination` |
| `coverage_map_click` | 公式エリアマップへのリンクのクリック（coverage-areaの冒頭3ステップ・エリア確認手順の最初の2リンク・再確認リンクを含む計5箇所） | `cta_id`, `cta_kind`, `page_type`, `cta_position`, `destination` |
| `diagnosis_start` | fit-checkで最初の実ユーザーによる選択変更（1ページ表示につき1回） | `page_type`, `cta_id`, `cta_kind` |
| `diagnosis_result_view` | fit-checkの**結果要約（`#diagnosis-live`）**が、現在の診断結果区分のまま50%以上・連続1秒以上見えた時（結果区分ごとに1ページ表示1回）。結果CTAボタン枠（`#result-cta-fit`等）の表示ではない | `cta_id`（`fit-check-diagnosis-live-fit`/`-maybe`/`-unfit`）, `diagnosis_result`（fit/maybe/unfit）, `page_type` |

`cta_kind`は `referral`（紹介リンク） / `internal`（サイト内導線） / `official_map`（公式エリアマップ）の3種類に統一している（再レビューで指摘された`link`/`primary`の混在は解消済み）。

全イベント共通で `page_url`・`page_title`・`device`（sp/pc）が自動付与される（既存の`trackCta`ヘルパーによる）。

### 1-1. 表示計測の内部仕様（再レビューR1での修正点）

`cta_view`・`diagnosis_result_view`は「要素が50%以上・表示中タブで**連続**1秒以上見える」ことを条件とする。実装上は以下の通り、状態変化が起きた瞬間（IntersectionObserver・MutationObserver・visibilitychangeイベント）に即座にタイマーを更新・取消する設計にしている（200msごとの定期チェックは補助的なフォールバックのみ）。

- 要素が閾値未満になる・hiddenになる・祖先が非表示になる・タブが非アクティブになる、のいずれかが起きた瞬間に連続可視の起点をリセットする（「一時停止して蓄積を保持する」動作ではなく、その時点で0から数え直す）。
- fit-checkの診断結果が切り替わった場合も、該当しなくなった区分は即座に取消され、該当するようになった区分は0から数え直す。
- 上記の正しさは `scripts/test-cta-visibility-dom.mjs`（cta-tracking.js本体を疑似ブラウザ環境で実行する回帰テスト）で、再レビューで指摘された4つの再現ケースを含めて検証している。

モック確認（ローカルのPlaywright自動テスト・gtagスタブ経由）と、cta-tracking.js本体を対象にしたNode上の疑似ブラウザ回帰テストの結果は、このPRの完了報告（manifest.json）に記載する。**GA4本番プロパティでの実受信確認（DebugView）は本タスクでは未実施**（後述3章の手順で管理者が実施する）。

## 2. GA4管理画面での設定手順

### 2-1. キーイベントの設定

1. GA4管理画面 → 「設定」→「イベント」→「キーイベントとしてマークする」で `referral_cta_click` を追加。
   - 参考: https://support.google.com/analytics/answer/12844695
   - これは「紹介リンクへの移動」の計測であり、**申込完了の計測ではない**ことを設定メモに残しておくことを推奨。
2. カウント方式：「プロパティ設定」→「イベントごとのコンバージョン」→`referral_cta_click`のカウント方法を「セッションごとに1回」に設定することを推奨（申込接点の評価用）。
   - **既存設定がある場合は、変更前の値（デフォルトは「イベントごと」）を記録してから変更すること。**
3. `cta_view` / `journey_click` / `coverage_map_click` / `diagnosis_start` / `diagnosis_result_view` は**キーイベントにしない**。

### 2-2. カスタムディメンションの登録

「設定」→「カスタム定義」→「カスタムディメンションを作成」で、未登録のものだけイベントスコープで追加する。

参考: https://support.google.com/analytics/answer/14239696 / https://support.google.com/analytics/answer/14240153

優先登録項目：

| ディメンション名（表示用） | イベントパラメータ | スコープ |
|---|---|---|
| CTA ID | `cta_id` | イベント |
| CTA種別 | `cta_kind` | イベント |
| CTA設置位置 | `cta_position` | イベント |
| 遷移先 | `destination` | イベント |
| 診断結果 | `diagnosis_result` | イベント |

`page_type`は既存のカスタムディメンション登録状況を先に確認し、未登録の場合のみ追加する（二重登録しない）。`page_url`・`device`はGA4標準のページパス・端末カテゴリで代替可能なため、新規登録しない。

### 2-3. DebugView等での実受信確認

1. GA4管理画面 →「DebugView」を開く。
2. ブラウザのデバッグモードを有効にする（GA Debuggerの拡張機能、または対象ページURLに`?debug_mode=1`を付与する方法のいずれか。当サイトのgtag実装に合わせて選択）。
3. coverage-area・fit-check・campaign-guideの各CTAを実際に表示・クリックし、DebugViewで `cta_view` → `referral_cta_click`/`journey_click`/`coverage_map_click`、fit-checkでは `diagnosis_start` → `diagnosis_result_view` の順でイベントが受信され、パラメータ（`cta_id`等）が意図通りの値になっていることを確認する。
4. **確認は本番プロパティで少数回に留め、キーイベント（`referral_cta_click`）を大量発火させない。**
5. ローカルのモック確認（本タスクでPlaywright経由で実施済み・47件PASS）と、本番プロパティでのDebugView確認は別物として記録する。

### 2-4. 設定日・比較開始日の記録

新規計測・カスタムディメンションの設定が完了した日付を記録し、**その日より前の期間についてcta_view等の表示数を遡って取得済みとして扱わない**（設定前はデータが存在しないため）。

## 3. 成果の見方（GA4探索での作り方）

requirements.md・元指示書11章に基づく4指標の作成方法。

### 3-1. 対象ページの紹介リンク到達率

`= 対象ページ閲覧とそのページでの紹介クリックが同一セッション内にあるセッション数 ÷ 対象ページ閲覧セッション数`

- GA4「探索」→「セグメント重複」または「ファネルデータ探索」で、「ページパスが対象ページ」のセグメントと「`referral_cta_click`が発生し、かつ同一セッション内で直前に対象ページを閲覧」のセグメントを作成して比較する。
- イベント数の単純な割り算にしない（1セッションで複数回表示・クリックされ得るため、必ずセッション数ベースにする）。

### 3-2. CTAの表示後クリック率

`= 同じcta_idで表示後にクリックしたセッション数 ÷ そのCTAの表示セッション数`

- 「探索」→「ファネルデータ探索」で、ステップ1を `cta_view`（`cta_id`で絞り込み）、ステップ2を同じ`cta_id`の`referral_cta_click`/`journey_click`/`coverage_map_click`（イベント名はcta_kindに応じて選択）とし、「順序を適用」を有効にする。
- 単純な「クリック数 ÷ 表示数」のイベント数割り算は、1秒未満でクリックされ表示イベントが発生しなかったケースを考慮できないため使わない（3-4参照）。

### 3-3. 診断結果への到達率

`= diagnosis_start後にdiagnosis_result_viewを見たセッション数 ÷ diagnosis_startのセッション数`

- ファネルデータ探索でステップ1を`diagnosis_start`、ステップ2を`diagnosis_result_view`（任意のdiagnosis_result値）とする。
- これは「結果要約を見た」ことを示すのみで、**9項目全問への回答や診断の最終確定を意味しない**。

### 3-4. 実獲得件数

GA4のクリックイベントからは算出しない。**紹介実績側（楽天モバイルの紹介管理画面・レポート等）の集計単位で確認する。** GA4の`referral_cta_click`はあくまで「紹介ページへの移動」であり、個々の契約・ページ別の獲得件数をGA4から推定しない。

### 3-5. 補足：1秒未満クリックの扱い

「可視率50%以上かつ連続1秒以上」の条件を満たす前にクリックされた場合、`cta_view`は送信されず`referral_cta_click`等のクリックイベントのみ記録される。そのため「表示後クリック率」が意図せず100%を超えて見えるケースがあり得る。これは実装上想定済みの挙動であり、クリック時に実際には満たしていない1秒表示を人為的に補って送信することはしていない。GA4探索では、`cta_view`を伴わない単独クリックの件数も別途確認し、「`cta_view`だけで母数を漏れなく取れている」とは説明しないこと。

### 3-6. 比較期間・観察期間

- 公開後の比較は、同じ長さ・同じ曜日構成の期間で行う。
- 新設の表示系指標（`cta_view`・`diagnosis_start`等）は設定日以降のデータしかないため、既存クリック系指標の公開前後比較とは別軸で扱う。
- 28日間を観察の目安とするが、母数が小さい場合は率だけで成功・失敗を断定せず、実数も併記する。
- 検索順位・流入量・検索語の変化も確認する。coverage-areaは「契約者の不具合検索」と「契約前のエリア不安の検索」を区別して読み、個々の検索語を個人の申込に直接結びつけない。
