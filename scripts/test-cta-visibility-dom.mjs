#!/usr/bin/env node
/**
 * test-cta-visibility-dom.mjs
 *
 * components/cta-tracking.js の「ブラウザ接続部分」（IntersectionObserver / MutationObserver /
 * visibilitychange / 200ms tick と CtaVisibilityGate の結線）を対象にした回帰テスト。
 *
 * Gate単体のロジックは test-cta-visibility-gate.mjs で検証済みだが、2026-10-24の再レビューで
 * 「接続部分が200msの定期確認だけに頼っており、IO/MutationObserver/visibilitychangeの
 * イベント発生時点で即時にGateを更新・取消していない」という指摘を受けた。
 * このファイルは、実ファイル（cta-tracking.js）そのものを node:vm 上の疑似ブラウザ環境
 * （フェイクのIntersectionObserver / MutationObserver / document.visibilityState / 時計）で
 * 実行し、その疑似ブラウザ環境を通じてのみイベントを注入することで、
 * 「接続部分が実際にイベント駆動で動いているか」を検証する（Gateクラスを直接叩かない）。
 *
 * 使い方:
 *   node scripts/test-cta-visibility-dom.mjs
 */

import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.resolve(__dirname, '../components/cta-tracking.js'), 'utf8');

/**
 * cta-tracking.js を疑似ブラウザ環境（vm.createContext）でロードし、
 * IntersectionObserver・MutationObserver・visibilitychange・時計・intervalを
 * テストコードから制御できるハンドルを返す。
 */
function loadInFakeBrowser() {
  let currentTime = 0;
  let visibilityState = 'visible';
  const visibilityListeners = [];
  const intervalCallbacks = new Map();
  let nextIntervalId = 1;
  const allElements = [];
  const gtagCalls = [];

  const ioInstances = [];
  class FakeIntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
      ioInstances.push(this);
    }
    observe(el) {
      this.targets.add(el);
    }
    unobserve(el) {
      this.targets.delete(el);
    }
    disconnect() {
      this.targets.clear();
    }
  }
  function fireIntersection(el, ratio, time) {
    for (const observer of ioInstances) {
      if (observer.targets.has(el)) {
        observer.callback([{ target: el, intersectionRatio: ratio, time: time }]);
      }
    }
  }

  const moInstances = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      moInstances.push(this);
    }
    observe() {}
    disconnect() {}
  }
  function fireMutation() {
    for (const observer of moInstances) {
      observer.callback([{ type: 'attributes', attributeName: 'hidden' }]);
    }
  }

  function makeElement() {
    const attrs = {};
    const el = {
      hidden: false,
      isConnected: true,
      __style: { display: 'block', visibility: 'visible' },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
      },
      setAttribute(name, value) {
        attrs[name] = String(value);
      },
      hasAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attrs, name);
      },
    };
    allElements.push(el);
    return el;
  }

  const documentObj = {
    get visibilityState() {
      return visibilityState;
    },
    body: { __fakeBody: true },
    readyState: 'complete',
    title: 'test',
    addEventListener(type, cb) {
      if (type === 'visibilitychange') visibilityListeners.push(cb);
    },
    removeEventListener(type, cb) {
      if (type === 'visibilitychange') {
        const idx = visibilityListeners.indexOf(cb);
        if (idx !== -1) visibilityListeners.splice(idx, 1);
      }
    },
    querySelectorAll(selector) {
      if (selector === '[data-cta-id]') {
        return allElements.filter((el) => el.hasAttribute('data-cta-id'));
      }
      return [];
    },
  };

  function setVisibility(state) {
    visibilityState = state;
    // 実ブラウザのvisibilitychangeイベントはdocument上で発火する
    visibilityListeners.slice().forEach((cb) => cb());
  }

  const windowObj = {
    document: documentObj,
    IntersectionObserver: FakeIntersectionObserver,
    MutationObserver: FakeMutationObserver,
    performance: {
      now() {
        return currentTime;
      },
    },
    innerWidth: 1200,
    getComputedStyle(el) {
      return el.__style;
    },
    setInterval(cb) {
      const id = nextIntervalId++;
      intervalCallbacks.set(id, cb);
      return id;
    },
    clearInterval(id) {
      intervalCallbacks.delete(id);
    },
  };

  const sandbox = {
    window: windowObj,
    document: documentObj,
    location: { pathname: '/test' },
    gtag: function (type, name, params) {
      gtagCalls.push({ type: type, name: name, params: params });
    },
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(SRC, context, { filename: 'cta-tracking.js' });

  return {
    core: windowObj.CtaTrackingCore,
    recheckCtaViewTargets: windowObj.recheckCtaViewTargets,
    makeElement,
    fireIntersection,
    fireMutation,
    gtagCalls,
    setHidden(el, hidden) {
      el.hidden = hidden;
      fireMutation();
    },
    setVisibility,
    advanceTimeTo(t) {
      currentTime = t;
    },
    tick() {
      intervalCallbacks.forEach((cb) => cb());
    },
  };
}

test('R1再現-1: IOで画面外→画面内の遷移がtickを待たず即時に反映され、復帰450msでは発火しない', () => {
  const env = loadInFakeBrowser();
  const el = env.makeElement();
  let firedAt = null;
  const watch = env.core.createVisibilityWatch(el, {
    active: true,
    onFire: () => {
      firedAt = 'fired';
    },
  });

  env.advanceTimeTo(0);
  env.fireIntersection(el, 1, 0); // 可視開始

  env.advanceTimeTo(200);
  env.tick();
  env.advanceTimeTo(400);
  env.tick();
  env.advanceTimeTo(600);
  env.tick();

  // 650msでIOにより画面外になる（tickのタイミングとは無関係に即時反映されるべき）
  env.advanceTimeTo(650);
  env.fireIntersection(el, 0, 650);

  // 750msで再び画面内に戻る
  env.advanceTimeTo(750);
  env.fireIntersection(el, 1, 750);

  env.advanceTimeTo(800);
  env.tick();
  env.advanceTimeTo(1000);
  env.tick();
  env.advanceTimeTo(1200);
  env.tick();

  assert.equal(firedAt, null, '復帰(750ms)から1200msまでは450msしか経っていないため発火しないはず');
  void watch;
});

test('R1再現-1b: 復帰してから1000ms経過すると発火する', () => {
  const env = loadInFakeBrowser();
  const el = env.makeElement();
  let fired = false;
  env.core.createVisibilityWatch(el, { onFire: () => (fired = true) });

  env.advanceTimeTo(0);
  env.fireIntersection(el, 1, 0);
  env.advanceTimeTo(650);
  env.fireIntersection(el, 0, 650);
  env.advanceTimeTo(750);
  env.fireIntersection(el, 1, 750);

  env.advanceTimeTo(1750); // 750 + 1000ms
  env.fireIntersection(el, 1, 1750);

  assert.equal(fired, true, '復帰(750ms)から1000ms経過(1750ms)したタイミングのIO評価で発火する');
});

test('R1再現-2: タブ非表示中にtickが止まっていても、visibilitychangeで即時にリセットされ、非表示中の時間は数えない', () => {
  const env = loadInFakeBrowser();
  const el = env.makeElement();
  let fired = false;
  env.core.createVisibilityWatch(el, { onFire: () => (fired = true) });

  env.advanceTimeTo(0);
  env.fireIntersection(el, 1, 0);
  env.advanceTimeTo(200);
  env.tick(); // 200ms可視

  // その直後にタブが非表示になる（バックグラウンドではintervalが止まる想定なのでtickを呼ばない）
  env.advanceTimeTo(220);
  env.setVisibility('hidden');

  // 3200msの間バックグラウンド（tickなし）
  env.advanceTimeTo(3200);
  env.setVisibility('visible'); // 表示復帰、visibilitychangeが即時発火

  assert.equal(fired, false, '復帰直後はまだ発火しない');

  // 復帰直後(3200ms)から600ms後 → まだ発火しない
  env.advanceTimeTo(3800);
  env.tick();
  assert.equal(fired, false, '復帰後600msでは未発火');

  // 復帰直後(3200ms)から1000ms以上後 → 発火する
  env.advanceTimeTo(4200);
  env.tick();
  assert.equal(fired, true, '復帰後1000ms以上で発火。非表示中の2980msは一切加算されていない');
});

test('R1再現-3: MutationObserverによるhidden切替も即時に反映され、再表示から計り直す', () => {
  const env = loadInFakeBrowser();
  const el = env.makeElement();
  let fired = false;
  env.core.createVisibilityWatch(el, { onFire: () => (fired = true) });

  env.advanceTimeTo(0);
  env.fireIntersection(el, 1, 0);
  env.advanceTimeTo(200);
  env.tick();
  env.advanceTimeTo(400);
  env.tick();
  env.advanceTimeTo(600);
  env.tick();

  // 次のtick(800ms)より前に hidden=true に変更（MutationObserver経由で即時検知されるべき）
  env.advanceTimeTo(650);
  env.setHidden(el, true);

  // その後 hidden=false に戻す
  env.advanceTimeTo(750);
  env.setHidden(el, false);

  env.advanceTimeTo(800);
  env.tick();
  env.advanceTimeTo(1000);
  env.tick();
  env.advanceTimeTo(1200);
  env.tick();
  assert.equal(fired, false, '再表示(750ms)から1200msまでは450msしか経っていないため未発火');

  env.advanceTimeTo(1800); // 750 + 1000ms
  env.tick();
  assert.equal(fired, true, '再表示から1000ms経過後のtickで発火する');
});

test('R1再現-4: 600ms可視→タブ非表示→復帰後600msでは未発火、復帰後1000msで1回だけ発火する', () => {
  const env = loadInFakeBrowser();
  const el = env.makeElement();
  const fireLog = [];
  env.core.createVisibilityWatch(el, { onFire: () => fireLog.push('fire') });

  env.advanceTimeTo(0);
  env.fireIntersection(el, 1, 0);
  env.advanceTimeTo(200);
  env.tick();
  env.advanceTimeTo(400);
  env.tick();
  env.advanceTimeTo(600);
  env.tick(); // ここまで600ms可視・pageVisible=true

  env.advanceTimeTo(600);
  env.setVisibility('hidden');

  env.advanceTimeTo(5000); // バックグラウンドで長時間経過（tickなし）
  env.setVisibility('visible');

  env.advanceTimeTo(5600); // 復帰から600ms
  env.tick();
  assert.deepEqual(fireLog, [], '復帰後600msでは未発火（取消前の600msは持ち越されない）');

  env.advanceTimeTo(6000); // 復帰から1000ms
  env.tick();
  assert.deepEqual(fireLog, ['fire'], '復帰後1000msで1回だけ発火する');

  // さらに時間が進んでも再発火しない
  env.advanceTimeTo(8000);
  env.tick();
  assert.deepEqual(fireLog, ['fire'], '発火後は再発火しない');
});

test('結果切替等で古いタイマーが残らない: setActive(false)で即座に取消され、再度trueにすると0から計測し直す', () => {
  const env = loadInFakeBrowser();
  const el = env.makeElement();
  let fired = false;
  const watch = env.core.createVisibilityWatch(el, { active: true, onFire: () => (fired = true) });

  env.advanceTimeTo(0);
  env.fireIntersection(el, 1, 0);
  env.advanceTimeTo(600);
  env.tick(); // 600ms蓄積

  // 診断結果が切り替わり、このカテゴリは非アクティブになる（要素自体は非表示にならない想定）
  env.advanceTimeTo(650);
  watch.setActive(false);

  env.advanceTimeTo(900);
  env.tick();
  assert.equal(fired, false);

  // 再びこのカテゴリがアクティブに戻る
  env.advanceTimeTo(1000);
  watch.setActive(true);

  env.advanceTimeTo(1600); // activeに戻ってから600ms
  env.tick();
  assert.equal(fired, false, 'アクティブに戻ってから600msでは未発火（持ち越しなし）');

  env.advanceTimeTo(2000); // activeに戻ってから1000ms
  env.tick();
  assert.equal(fired, true, 'アクティブに戻ってから1000msで発火する');
});

test('data-cta-id自動結線（実際にfit-checkの結果CTA等が使う経路）: hidden切替のたびに即時取消され、再表示から計り直す', () => {
  const env = loadInFakeBrowser();
  const el = env.makeElement();
  el.setAttribute('data-cta-id', 'test-cta');
  el.setAttribute('data-cta-event', 'cta_view');
  el.hidden = true; // 初期状態は非表示（fit-checkの結果ブロック相当）

  env.recheckCtaViewTargets(); // data-cta-id要素をスキャンして自動登録

  env.advanceTimeTo(0);
  env.setHidden(el, false); // 表示する（結果が確定した想定）
  env.fireIntersection(el, 1, 0);
  env.advanceTimeTo(600);
  env.tick();
  assert.equal(env.gtagCalls.length, 0, '600ms時点ではまだ発火しない');

  // 結果が切り替わり、このCTAは一旦非表示に戻る → 即座に取消されるべき
  env.advanceTimeTo(650);
  env.setHidden(el, true);

  // その後また同じ結果に戻り、再表示される
  env.advanceTimeTo(750);
  env.setHidden(el, false);
  env.fireIntersection(el, 1, 750);

  env.advanceTimeTo(1200); // 再表示(750ms)から450ms
  env.tick();
  assert.equal(env.gtagCalls.length, 0, '再表示から450msでは未発火（取消前の600msは持ち越されない）');

  env.advanceTimeTo(1750); // 再表示(750ms)から1000ms
  env.tick();
  assert.equal(env.gtagCalls.length, 1, '再表示から1000ms経過後に1回だけ発火する');
  assert.equal(env.gtagCalls[0].name, 'cta_view');
  assert.equal(env.gtagCalls[0].params.cta_id, 'test-cta');

  // 以降さらにhidden/表示を繰り返しても再発火しない（1ページ表示・同一cta_idにつき1回）
  env.advanceTimeTo(1800);
  env.setHidden(el, true);
  env.advanceTimeTo(1900);
  env.setHidden(el, false);
  env.fireIntersection(el, 1, 1900);
  env.advanceTimeTo(3500);
  env.tick();
  assert.equal(env.gtagCalls.length, 1, '一度発火したcta_idは再発火しない');
});

// ------------------------------------------------------------------
// 再レビューA: 祖先が非表示になった場合、IOのratio更新を待たずに同期的に取消する
// ------------------------------------------------------------------
// fit-checkの結果枠（#result-cta-fit等）はhiddenを親要素に付け、監視対象のボタンは
// その子要素になる。親のhidden/display:noneは子自身のcomputed displayには現れないため、
// 祖先を辿って明示的に確認する必要がある（2026-10-24再レビューの再現コードに基づく）。

test('A再現: 親がhiddenになった瞬間、IOのratio更新が届く前でも同期的に取消される', () => {
  const env = loadInFakeBrowser();
  const parent = env.makeElement();
  const button = env.makeElement();
  button.parentElement = parent;
  let fired = false;
  env.core.createVisibilityWatch(button, { onFire: () => (fired = true) });

  env.advanceTimeTo(0);
  env.fireIntersection(button, 1, 0);
  env.advanceTimeTo(600);
  env.tick();
  assert.equal(fired, false, '600ms時点ではまだ発火しない');

  // 650msで親を非表示にする（MutationObserverはここで即時に呼ばれる）。
  // IOのratio=0通知はまだ届いていない状態を模している。
  env.advanceTimeTo(650);
  env.setHidden(parent, true);

  // IOの通知を待たず、1000ms時点のtick（同期的なisElementActuallyVisible評価）で
  // 取消が反映されているべき
  env.advanceTimeTo(1000);
  env.tick();
  assert.equal(fired, false, '親が非表示の間はIO通知を待たずに取消され、発火しない');

  env.advanceTimeTo(2000);
  env.tick();
  assert.equal(fired, false, 'その後も親が非表示のままなら発火しない');
});

test('A再現-2: 親を再表示してから1秒未満では未発火、1秒経過後に1回だけ発火する', () => {
  const env = loadInFakeBrowser();
  const parent = env.makeElement();
  const button = env.makeElement();
  button.parentElement = parent;
  const fireLog = [];
  env.core.createVisibilityWatch(button, { onFire: () => fireLog.push('fire') });

  env.advanceTimeTo(0);
  env.fireIntersection(button, 1, 0);
  env.advanceTimeTo(300);
  env.tick();

  env.advanceTimeTo(350);
  env.setHidden(parent, true);
  env.advanceTimeTo(2000);
  env.tick();
  assert.deepEqual(fireLog, [], '非表示の間は発火しない');

  // 親を再表示
  env.advanceTimeTo(2000);
  env.setHidden(parent, false);
  env.fireIntersection(button, 1, 2000); // IO側も遅れて再通知される想定

  env.advanceTimeTo(2600); // 再表示から600ms
  env.tick();
  assert.deepEqual(fireLog, [], '再表示から600msでは未発火（取消前の時間は持ち越さない）');

  env.advanceTimeTo(3000); // 再表示から1000ms
  env.tick();
  assert.deepEqual(fireLog, ['fire'], '再表示から1000ms経過後に1回だけ発火する');

  env.advanceTimeTo(5000);
  env.tick();
  assert.deepEqual(fireLog, ['fire'], '発火後は再発火しない');
});

test('A再現-3: 親のdisplay:none切替（hidden属性ではなくCSS）でも即時に取消される', () => {
  const env = loadInFakeBrowser();
  const parent = env.makeElement();
  const button = env.makeElement();
  button.parentElement = parent;
  let fired = false;
  env.core.createVisibilityWatch(button, { onFire: () => (fired = true) });

  env.advanceTimeTo(0);
  env.fireIntersection(button, 1, 0);
  env.advanceTimeTo(500);
  env.tick();

  env.advanceTimeTo(550);
  parent.__style.display = 'none';
  env.fireMutation(); // style/class変化相当の即時再評価を模す

  env.advanceTimeTo(1600); // 元の可視開始から1600ms経過しても、550ms以降は非表示
  env.tick();
  assert.equal(fired, false, '祖先のdisplay:none化がCSS経由でも即時に取消される');
});

test('A再現-4: 監視対象そのものがDOMから取り外された場合も取消される', () => {
  const env = loadInFakeBrowser();
  const button = env.makeElement();
  let fired = false;
  env.core.createVisibilityWatch(button, { onFire: () => (fired = true) });

  env.advanceTimeTo(0);
  env.fireIntersection(button, 1, 0);
  env.advanceTimeTo(500);
  env.tick();

  env.advanceTimeTo(550);
  button.isConnected = false;
  env.fireMutation();

  env.advanceTimeTo(1600);
  env.tick();
  assert.equal(fired, false, 'DOMから取り外された要素は可視と判定されない');
});

test('A再現-5: 祖先hidden配下の孫要素（fit-checkの結果ボタン相当）でも同様に検出される', () => {
  const env = loadInFakeBrowser();
  const grandparent = env.makeElement(); // #result-cta-fit 相当
  const parent = env.makeElement(); // 中間要素
  const button = env.makeElement(); // data-cta-id付きボタン
  parent.parentElement = grandparent;
  button.parentElement = parent;
  let fired = false;
  env.core.createVisibilityWatch(button, { onFire: () => (fired = true) });

  env.advanceTimeTo(0);
  env.fireIntersection(button, 1, 0);
  env.advanceTimeTo(400);
  env.tick();

  env.advanceTimeTo(450);
  env.setHidden(grandparent, true); // 直接の親ではなく祖父要素を非表示にする
  env.advanceTimeTo(1600);
  env.tick();
  assert.equal(fired, false, '2階層上の祖先が非表示でも検出され取消される');
});
