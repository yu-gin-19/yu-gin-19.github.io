/**
 * CTAクリック計測 + 表示計測（cta_view等）の共通基盤
 *
 * クリック計測:
 *   onclick="trackCta('referral_cta_click', {...})" / onclick="trackCta('journey_click', {...})" の形で
 *   各ページのCTAから呼び出す。page_url / page_title / device は自動付与するため、
 *   呼び出し側は cta_position・cta_type・destination・offer_type・reader_stage・page_type・cta_id・cta_kind など
 *   CTA固有のパラメータのみを渡せばよい。
 *
 * 表示計測:
 *   data-cta-id 属性を持つ要素を自動的に監視し、「50%以上の可視率」かつ
 *   「表示中タブで連続1秒以上可視」の条件を満たした時だけイベントを送信する（1ページ表示につき同一 cta_id で1回のみ）。
 *   既定のイベント名は 'cta_view'。data-cta-event 属性で上書きできる（例: 'diagnosis_result_view'）。
 *   data-cta-kind / data-cta-page-type / data-cta-position / data-cta-destination / data-cta-result は
 *   そのまま cta_kind / page_type / cta_position / destination / diagnosis_result パラメータとして送信される。
 *   hidden / display:none / 折りたたみ中 / 画面外 / 非アクティブタブでは発火しない。
 *   1秒未満で不可視化したらタイマーを取消する。
 *   hidden属性が動的に切り替わる要素（fit-checkの結果ブロックなど）も、切替後に監視し直される。
 *
 * 可視判定・1秒タイマー管理の核となるロジック（CtaVisibilityGate）は、
 * DOM / IntersectionObserver に依存しない純粋な状態遷移ロジックとして分離してあり、
 * Node環境から直接 require/import してユニットテストできる。
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // 可視性タイマーの純粋な状態遷移ロジック（DOM非依存・ユニットテスト対象）
  // ------------------------------------------------------------------

  /**
   * 1つの監視対象（1つの cta_id）に対する可視性タイマーの状態を管理するクラス。
   * ブラウザAPI（IntersectionObserver・document.visibilityState等）を一切参照せず、
   * 呼び出し側が渡す { timestamp, elementVisible, pageVisible } イベント列だけで動作する。
   *
   * ルール:
   *   - elementVisible が true かつ pageVisible が true の間だけ経過時間を積算する。
   *   - elementVisible が false になった瞬間、積算時間を0にリセットする（タイマー取消）。
   *   - pageVisible が false（非アクティブタブ）の間は、積算時間を増やさない（一時停止。リセットはしない）。
   *   - 積算時間が requiredDurationMs 以上になった最初の update() 呼び出しで true を返す（以降は何度呼んでも false）。
   */
  function CtaVisibilityGate(options) {
    options = options || {};
    this.requiredDurationMs =
      typeof options.requiredDurationMs === 'number' ? options.requiredDurationMs : 1000;
    this.accumulatedMs = 0;
    this.lastTimestamp = null;
    this.lastElementVisible = false;
    this.lastPageVisible = true;
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

    var wasAccumulating =
      this.lastTimestamp !== null && this.lastElementVisible && this.lastPageVisible;
    if (wasAccumulating && typeof timestamp === 'number') {
      var delta = timestamp - this.lastTimestamp;
      if (delta > 0) {
        this.accumulatedMs += delta;
      }
    }

    if (!elementVisible) {
      // 要素が閾値未満・非表示になった場合はタイマーを取消する
      this.accumulatedMs = 0;
    }

    this.lastTimestamp = typeof timestamp === 'number' ? timestamp : this.lastTimestamp;
    this.lastElementVisible = elementVisible;
    this.lastPageVisible = pageVisible;

    if (elementVisible && pageVisible && this.accumulatedMs >= this.requiredDurationMs) {
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

  // ブラウザ環境でなければ（Node環境のテストからrequireされた場合）、以降のDOM結線は行わない。
  if (typeof window === 'undefined' || typeof document === 'undefined') {
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

  // ------------------------------------------------------------------
  // 新規: 表示計測（cta_view等）のDOM結線
  // ------------------------------------------------------------------

  var TICK_MS = 200;

  var watchers = new Map(); // element -> { ctaId, gate, ratio }
  var firedCtaIds = Object.create(null);
  var intersectionObserver = null;
  var tickTimer = null;

  function isElementActuallyVisible(el) {
    if (!el || el.hidden) return false;
    if (typeof el.isConnected === 'boolean' && !el.isConnected) return false;
    var style = window.getComputedStyle(el);
    if (!style) return true;
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return true;
  }

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

  function fireView(el, watcher) {
    firedCtaIds[watcher.ctaId] = true;
    if (typeof window.trackCta === 'function') {
      var eventName = el.getAttribute('data-cta-event') || 'cta_view';
      window.trackCta(eventName, buildViewParams(el));
    }
    watchers.delete(el);
    if (intersectionObserver) intersectionObserver.unobserve(el);
  }

  function tick() {
    if (watchers.size === 0) {
      stopTicking();
      return;
    }
    var now = Date.now();
    var pageVisible = document.visibilityState === 'visible';

    watchers.forEach(function (watcher, el) {
      if (firedCtaIds[watcher.ctaId]) {
        watchers.delete(el);
        if (intersectionObserver) intersectionObserver.unobserve(el);
        return;
      }
      var elementVisible =
        watcher.ratio >= VISIBILITY_RATIO_THRESHOLD && isElementActuallyVisible(el);
      var fired = watcher.gate.update({
        timestamp: now,
        elementVisible: elementVisible,
        pageVisible: pageVisible,
      });
      if (fired) {
        fireView(el, watcher);
      }
    });

    if (watchers.size === 0) stopTicking();
  }

  function startTicking() {
    if (tickTimer) return;
    tickTimer = window.setInterval(tick, TICK_MS);
  }

  function stopTicking() {
    if (!tickTimer) return;
    window.clearInterval(tickTimer);
    tickTimer = null;
  }

  function getObserver() {
    if (intersectionObserver) return intersectionObserver;
    if (typeof window.IntersectionObserver !== 'function') return null;
    intersectionObserver = new window.IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var watcher = watchers.get(entry.target);
          if (!watcher) return;
          watcher.ratio = entry.intersectionRatio;
        });
      },
      { threshold: [0, VISIBILITY_RATIO_THRESHOLD, 1] }
    );
    return intersectionObserver;
  }

  function watchElement(el) {
    var ctaId = el.getAttribute('data-cta-id');
    if (!ctaId) return;
    if (firedCtaIds[ctaId]) return;
    if (watchers.has(el)) return;

    var observer = getObserver();
    if (!observer) return; // IntersectionObserver非対応環境では計測しない（クリック計測には影響しない）

    watchers.set(el, {
      ctaId: ctaId,
      ratio: 0,
      gate: new CtaVisibilityGate({ requiredDurationMs: VISIBILITY_REQUIRED_MS }),
    });
    observer.observe(el);
    startTicking();
  }

  /**
   * data-cta-id を持つ要素を再スキャンして監視対象に追加する。
   * fit-checkの結果ブロックのようにhidden属性が動的に切り替わる要素向けに、
   * 外部（各ページのインラインscript）から明示的に呼べる関数としてexportする。
   */
  function recheckCtaViewTargets() {
    var nodes = document.querySelectorAll('[data-cta-id]');
    for (var i = 0; i < nodes.length; i++) {
      watchElement(nodes[i]);
    }
  }
  window.recheckCtaViewTargets = recheckCtaViewTargets;

  // hidden属性・style・class・DOM構造の変化を検知して自動的に再スキャンする
  function observeMutations() {
    if (typeof window.MutationObserver !== 'function' || !document.body) return;
    var mutationObserver = new window.MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (
          m.type === 'childList' ||
          (m.type === 'attributes' &&
            (m.attributeName === 'hidden' || m.attributeName === 'style' || m.attributeName === 'class'))
        ) {
          recheckCtaViewTargets();
          return;
        }
      }
    });
    mutationObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['hidden', 'style', 'class'],
      subtree: true,
      childList: true,
    });
  }

  function init() {
    recheckCtaViewTargets();
    observeMutations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
