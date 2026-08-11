/**
 * CTAクリック計測の共通ヘルパー
 * onclick="trackCta('referral_cta_click', {...})" / onclick="trackCta('journey_click', {...})" の形で
 * 各ページのCTAから呼び出す。page_url / page_title / device は自動付与するため、
 * 呼び出し側は cta_position・cta_type・destination・offer_type・reader_stage・page_type など
 * CTA固有のパラメータのみを渡せばよい。
 */
window.trackCta = function (eventName, params) {
  if (typeof gtag !== 'function') return;
  var device = window.innerWidth < 600 ? 'sp' : 'pc';
  gtag('event', eventName, Object.assign({
    page_url: location.pathname,
    page_title: document.title,
    device: device
  }, params || {}));
};
