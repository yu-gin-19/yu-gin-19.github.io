/**
 * CTAクリック計測 + 表示計測（cta_view等）の共通基盤
 *
 * クリック計測:
 *   onclick="trackCta('referral_cta_click', {...})" / onclick="trackCta('journey_click', {...})" の形で
 *   各ページのCTAから呼び出す。page_url / page_title / device は自動付与するため、
 *   呼び出し側は cta_position・cta_type・destination・offer_type・reader_stage・page_type・cta_id・cta_kind など
 *   CTA固有のパラメータのみを渡せばよい。
 *
 * 表示計測（data-cta-id要素への自動結線）:
 *   data-cta-id 属性を持つ要素を自動的に監視し、「50%以上の可視率」かつ
 *   「表示中タブで連続1秒以上可視」の条件を満たした時だけイベントを送信する（1ページ表示につき同一 cta_id で1回のみ）。
 *   既定のイベント名は 'cta_view'。data-cta-event 属性で上書きできる。
 *   data-cta-kind / data-cta-page-type / data-cta-position / data-cta-destination / data-cta-result は
 *   そのまま cta_kind / page_type / cta_position / destination / diagnosis_result パラメータとして送信される。
 *
 * 表示計測（任意要素・任意条件での結線）:
 *   window.CtaTrackingCore.createVisibilityWatch(el, { active, requiredDurationMs, onFire }) で、
 *   data-cta-id を持たない要素や、「現在の状態と一致する間だけ計測対象にしたい」ケース
 *   （例: fit-checkの結果要約を、現在の診断結果区分と一致する間だけ計測する）に使う。
 *   返り値の .setActive(bool) で、外部の状態変化に応じて計測対象のON/OFFを切り替えられる。
 *
 * 可視性判定の設計:
 *   「表示中タブで連続1秒以上可視」は文字通り"連続"を要求する。要素が閾値未満になる・
 *   hiddenになる・非アクティブタブになる・active(=setActiveでfalseにされる)が外れる、
 *   のいずれかが起きた時点で積算はリセットされ、その後また条件を満たした時点から0秒から数え直す
 *   （「一時停止して蓄積を保持する」動作ではない）。
 *
 *   IntersectionObserver・MutationObserver・visibilitychange・setActive() の呼び出しは、
 *   いずれも発生した瞬間に即座に評価される（200msごとの定期チェックは、上記イベントが
 *   拾えない変化のための補助的なフォールバックとして残してある）。
 *   時刻には performance.now()（またはIntersectionObserverEntry.time、同一の時間軸）を使い、
 *   Date.now()とは混在させない。
 *
 * 可視判定・連続時間の核となるロジック（CtaVisibilityGate）は、
 * DOM / IntersectionObserver に依存しない純粋な状態遷移ロジックとして分離してあり、
 * Node環境から直接 require/import してユニットテストできる。
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // 可視性タイマーの純粋な状態遷移ロジック（DOM非依存・ユニットテスト対象）
  // ------------------------------------------------------------------

  /**
   * 1つの監視対象に対する「連続可視時間」の状態を管理するクラス。
   * ブラウザAPI（IntersectionObserver・document.visibilityState等）を一切参照せず、
   * 呼び出し側が渡す { timestamp, elementVisible, pageVisible } イベントだけで動作する。
   *
   * ルール:
   *   - elementVisible と pageVisible が両方 true の間だけ「連続可視」として扱う。
   *   - どちらか一方でも false になった瞬間、連続可視の起点をリセットする（蓄積は保持しない）。
   *   - 連続可視の起点から requiredDurationMs 以上経過した最初の update() 呼び出しで true を返す
   *     （以降は何度呼んでも false）。
   *   - timestampは単調増加する前提（performance.now()等）で、呼び出し側が時間軸を統一すること。
   */
  function CtaVisibilityGate(options) {
    options = options || {};
    this.requiredDurationMs =
      typeof options.requiredDurationMs === 'number' ? options.requiredDurationMs : 1000;
    this.visibleSinceTs = null;
    this.fired = false;
  }

  /**
   * @param {{timestamp:number, elementVisible:boolean, pageVisible?:boolean}} event
   * @returns {boolean} この呼び出しで発火条件を満たしたかどうか
   */
  CtaVisibilityGate.prototype.update = function (event) {
    if (this.fired) return false;

    var timestamp = event.timestamp;
    var elementVisible = !!event.elementVisible;
    var pageVisible = event.pageVisible !== false;
    var ok = elementVisible && pageVisible;

    if (!ok) {
      this.visibleSinceTs = null;
      return false;
    }

    if (typeof timestamp !== 'number') {
      return false;
    }

    if (this.visibleSinceTs === null) {
      this.visibleSinceTs = timestamp;
      return false;
    }

    if (timestamp - this.visibleSinceTs >= this.requiredDurationMs) {
      this.fired = true;
      return true;
    }
    return false;
  };

  CtaVisibilityGate.prototype.isFired = function () {
    return this.fired;
  };

  var VISIBILITY_RATIO_THRESHOLD = 0.5;
  var VISIBILITY_REQUIRED_MS = 1000;

  var CtaTrackingCore = {
    CtaVisibilityGate: CtaVisibilityGate,
    VISIBILITY_RATIO_THRESHOLD: VISIBILITY_RATIO_THRESHOLD,
    VISIBILITY_REQUIRED_MS: VISIBILITY_REQUIRED_MS,
  };

  // Node環境（ユニットテスト等）向けのCommonJSエクスポート。
  // ブラウザ実行時（<script src>経由）は module が存在しないため何も起きない。
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CtaTrackingCore;
  }

  // window が無い環境（Node単体でのGateテスト等）では、以降のDOM結線は行わない。
  if (typeof window === 'undefined') {
    return;
  }

  window.CtaTrackingCore = CtaTrackingCore;

  // ------------------------------------------------------------------
  // 既存: クリック計測
  // ------------------------------------------------------------------

  window.trackCta = function (eventName, params) {
    if (typeof gtag !== 'function') return;
    var device = window.innerWidth < 600 ? 'sp' : 'pc';
    gtag(
      'event',
      eventName,
      Object.assign(
        {
          page_url: location.pathname,
          page_title: document.title,
          device: device,
        },
        params || {}
      )
    );
  };

  // window はあっても document が無いテスト環境では、ここで止める。
  if (typeof document === 'undefined') {
    return;
  }

  // ------------------------------------------------------------------
  // 新規: 表示計測の共通エンジン（イベント駆動 + 補助的な定期チェック）
  // ------------------------------------------------------------------

  var TICK_MS = 200; // 補助的なフォールバック。主要な状態変化は即時評価する。

  function nowTs() {
    if (typeof window.performance === 'object' && typeof window.performance.now === 'function') {
      return window.performance.now();
    }
    return Date.now();
  }

  /**
   * 要素自身だけでなく祖先も含めて、hidden属性・display:none・visibility:hiddenが
   * ないかを同期的に確認する。visibility:hiddenは継承されるため要素自身のcomputed styleの
   * チェックだけでも拾えるが、display:noneは子孫の computed display 自体を変えないため、
   * 祖先を辿って明示的に確認する必要がある（fit-checkの結果枠hiddenの子にあるボタン等）。
   */
  function isElementActuallyVisible(el) {
    if (!el) return false;
    if (typeof el.isConnected === 'boolean' && !el.isConnected) return false;
    var node = el;
    var guard = 0;
    while (node && guard < 128) {
      guard++;
      if (node.hidden) return false;
      var style = window.getComputedStyle(node);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
      node = node.parentElement;
    }
    return true;
  }

  // record: { el, ratio, active, fired, gate, onFire, autoCtaId(存在すればdata-cta-id自動登録分) }
  var records = []; // 全レコード（評価の全走査に使う）
  var elementRecordMap = new Map(); // el -> [records...]（同じ要素を複数レコードが監視するケースに対応）
  var autoRegisteredElements = new WeakSet(); // data-cta-id自動結線で既に登録済みの要素
  var intersectionObserver = null;
  var tickTimer = null;
  var visibilityChangeBound = false;
  var mutationObserver = null;

  function evaluateRecord(record, timestamp) {
    if (record.fired) return;
    var elementVisible =
      record.active && record.ratio >= VISIBILITY_RATIO_THRESHOLD && isElementActuallyVisible(record.el);
    var pageVisible = document.visibilityState === 'visible';
    var fired = record.gate.update({
      timestamp: timestamp,
      elementVisible: elementVisible,
      pageVisible: pageVisible,
    });
    if (fired) {
      record.fired = true;
      try {
        record.onFire();
      } finally {
        detachIfNoLiveRecords(record.el);
      }
    }
  }

  function evaluateRecordsForElement(el, timestamp) {
    var list = elementRecordMap.get(el);
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      evaluateRecord(list[i], timestamp);
    }
  }

  function evaluateAll(timestamp) {
    for (var i = 0; i < records.length; i++) {
      evaluateRecord(records[i], timestamp);
    }
  }

  function detachIfNoLiveRecords(el) {
    var list = elementRecordMap.get(el);
    if (!list) return;
    var stillLive = list.some(function (r) {
      return !r.fired;
    });
    if (!stillLive && intersectionObserver) {
      intersectionObserver.unobserve(el);
    }
  }

  function getIntersectionObserver() {
    if (intersectionObserver) return intersectionObserver;
    if (typeof window.IntersectionObserver !== 'function') return null;
    intersectionObserver = new window.IntersectionObserver(
      function (entries) {
        // IO entryに複数の変化が入る場合、発生順（entry.time昇順）に処理する
        var sorted = entries.slice().sort(function (a, b) {
          return a.time - b.time;
        });
        for (var i = 0; i < sorted.length; i++) {
          var entry = sorted[i];
          var list = elementRecordMap.get(entry.target);
          if (!list) continue;
          for (var j = 0; j < list.length; j++) {
            list[j].ratio = entry.intersectionRatio;
          }
          evaluateRecordsForElement(entry.target, entry.time);
        }
      },
      { threshold: [0, VISIBILITY_RATIO_THRESHOLD, 1] }
    );
    return intersectionObserver;
  }

  function ensureGlobalWiring() {
    if (!tickTimer) {
      tickTimer = window.setInterval(function () {
        evaluateAll(nowTs());
      }, TICK_MS);
    }
    if (!visibilityChangeBound) {
      visibilityChangeBound = true;
      document.addEventListener('visibilitychange', function () {
        // タブの表示状態が変わった瞬間に即時評価する（非表示→表示の復帰直後は
        // CtaVisibilityGateが連続可視の起点をリセットしているため、ここではまだ発火しない）
        evaluateAll(nowTs());
      });
    }
    if (!mutationObserver && typeof window.MutationObserver === 'function' && document.body) {
      mutationObserver = new window.MutationObserver(function () {
        // 祖先要素の非表示化・DOM構造の変化も含めて即時再評価する。
        // 新規のdata-cta-id要素があればここで自動登録もする。
        autoRegisterCtaIdElements();
        evaluateAll(nowTs());
      });
      mutationObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['hidden', 'style', 'class'],
        subtree: true,
        childList: true,
      });
    }
  }

  /**
   * 任意の要素・任意の発火条件で表示計測を行うための公開API。
   * active: 初期状態でこの監視を有効にするか（既定true）。setActive()で後から切り替えられる。
   * onFire: 発火時に呼ばれるコールバック（trackCta呼び出し等は呼び出し側が行う）。
   * 戻り値: { setActive(bool), destroy() }
   */
  function createVisibilityWatch(el, options) {
    options = options || {};
    var record = {
      el: el,
      ratio: 0,
      active: options.active !== false,
      fired: false,
      gate: new CtaVisibilityGate({ requiredDurationMs: options.requiredDurationMs || VISIBILITY_REQUIRED_MS }),
      onFire: typeof options.onFire === 'function' ? options.onFire : function () {},
    };
    records.push(record);
    var list = elementRecordMap.get(el);
    if (!list) {
      list = [];
      elementRecordMap.set(el, list);
    }
    list.push(record);

    var observer = getIntersectionObserver();
    if (observer) observer.observe(el);
    ensureGlobalWiring();

    // 初期状態を即時評価（すでに画面内にある場合、次のIOコールバックを待たずに評価開始できる）
    evaluateRecord(record, nowTs());

    return {
      setActive: function (active) {
        active = !!active;
        if (record.fired || record.active === active) return;
        record.active = active;
        evaluateRecord(record, nowTs());
      },
      destroy: function () {
        record.fired = true; // 以後評価されないようにする
        var idx = records.indexOf(record);
        if (idx !== -1) records.splice(idx, 1);
        var elList = elementRecordMap.get(el);
        if (elList) {
          var elIdx = elList.indexOf(record);
          if (elIdx !== -1) elList.splice(elIdx, 1);
        }
        detachIfNoLiveRecords(el);
      },
    };
  }

  CtaTrackingCore.createVisibilityWatch = createVisibilityWatch;

  // ------------------------------------------------------------------
  // data-cta-id 要素への自動結線（既定のcta_view等）
  // ------------------------------------------------------------------

  function buildViewParams(el) {
    var params = {};
    var ctaId = el.getAttribute('data-cta-id');
    if (ctaId) params.cta_id = ctaId;
    var kind = el.getAttribute('data-cta-kind');
    if (kind) params.cta_kind = kind;
    var pageType = el.getAttribute('data-cta-page-type');
    if (pageType) params.page_type = pageType;
    var position = el.getAttribute('data-cta-position');
    if (position) params.cta_position = position;
    var destination = el.getAttribute('data-cta-destination');
    if (destination) params.destination = destination;
    var result = el.getAttribute('data-cta-result');
    if (result) params.diagnosis_result = result;
    return params;
  }

  function autoRegisterCtaIdElements() {
    var nodes = document.querySelectorAll('[data-cta-id]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (autoRegisteredElements.has(el)) continue;
      autoRegisteredElements.add(el);
      (function (targetEl) {
        createVisibilityWatch(targetEl, {
          active: true,
          onFire: function () {
            var eventName = targetEl.getAttribute('data-cta-event') || 'cta_view';
            if (typeof window.trackCta === 'function') {
              window.trackCta(eventName, buildViewParams(targetEl));
            }
          },
        });
      })(el);
    }
  }

  /**
   * data-cta-id を持つ要素を再スキャンして未登録のものを監視対象に追加する。
   * 外部（各ページのインラインscript）から明示的に呼べる関数としても残す（後方互換）。
   * 通常はMutationObserverが自動的に再スキャンするため、明示的な呼び出しは必須ではない。
   */
  window.recheckCtaViewTargets = function () {
    autoRegisterCtaIdElements();
    evaluateAll(nowTs());
  };

  function init() {
    ensureGlobalWiring();
    autoRegisterCtaIdElements();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
