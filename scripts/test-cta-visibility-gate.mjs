#!/usr/bin/env node
/**
 * test-cta-visibility-gate.mjs
 *
 * components/cta-tracking.js から切り出した CtaVisibilityGate（可視性タイマーの純粋な状態遷移ロジック）の
 * ユニットテスト。DOM / IntersectionObserver / setTimeout 等のブラウザAPIは一切使わず、
 * { timestamp, elementVisible, pageVisible } の模擬イベント列を直接 update() に渡して検証する。
 *
 * 使い方:
 *   node scripts/test-cta-visibility-gate.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import CtaTrackingCore from '../components/cta-tracking.js';

const { CtaVisibilityGate } = CtaTrackingCore;

test('50%未満（elementVisible=false）が続く間は一度も発火しない', () => {
  const gate = new CtaVisibilityGate({ requiredDurationMs: 1000 });
  let fired = false;
  for (let t = 0; t <= 2000; t += 200) {
    fired = gate.update({ timestamp: t, elementVisible: false, pageVisible: true }) || fired;
  }
  assert.equal(fired, false);
  assert.equal(gate.isFired(), false);
});

test('可視率50%以上が連続1秒続くと1回だけ発火する', () => {
  const gate = new CtaVisibilityGate({ requiredDurationMs: 1000 });
  const fires = [];
  // 0ms, 200ms, 400ms, 600ms, 800ms, 1000ms, 1200ms と継続的に可視
  for (let t = 0; t <= 1200; t += 200) {
    const didFire = gate.update({ timestamp: t, elementVisible: true, pageVisible: true });
    if (didFire) fires.push(t);
  }
  assert.equal(fires.length, 1, '発火は1回のみ');
  assert.equal(fires[0], 1000, '1000ms経過時点のupdate呼び出しで発火する');
  assert.equal(gate.isFired(), true);

  // 発火後にさらにupdateを呼んでも再発火しない
  const again = gate.update({ timestamp: 1400, elementVisible: true, pageVisible: true });
  assert.equal(again, false);
});

test('1秒未満で不可視化（elementVisible=false）するとタイマーが取消され、再度可視になっても0から再計測する', () => {
  const gate = new CtaVisibilityGate({ requiredDurationMs: 1000 });

  // 0 -> 600ms まで可視（600ms蓄積、まだ発火しない）
  gate.update({ timestamp: 0, elementVisible: true, pageVisible: true });
  let fired = gate.update({ timestamp: 600, elementVisible: true, pageVisible: true });
  assert.equal(fired, false);

  // 600ms時点で不可視化 → タイマー取消（蓄積0にリセット）
  fired = gate.update({ timestamp: 600, elementVisible: false, pageVisible: true });
  assert.equal(fired, false);

  // 再度可視化してから1000ms未満（800ms）では発火しない
  gate.update({ timestamp: 600, elementVisible: true, pageVisible: true });
  fired = gate.update({ timestamp: 1400, elementVisible: true, pageVisible: true }); // 600→1400 = 800ms
  assert.equal(fired, false, '取消前の600msは持ち越されない（0から再計測のため合計1000ms未満）');

  // さらに200ms進めて合計1000msに到達すれば発火する
  fired = gate.update({ timestamp: 1600, elementVisible: true, pageVisible: true });
  assert.equal(fired, true);
});

test('非アクティブタブ（pageVisible=false）になると連続可視の起点がリセットされる（蓄積は保持しない）', () => {
  // 「表示中タブで連続1秒」という仕様上、タブが非アクティブになった時点で"連続"が途切れるため、
  // 一時停止ではなく起点リセットが正しい挙動（再レビューでの明示的な訂正）。
  const gate = new CtaVisibilityGate({ requiredDurationMs: 1000 });

  // 0 -> 500ms 可視・アクティブタブ（500ms経過、まだ発火しない）
  gate.update({ timestamp: 0, elementVisible: true, pageVisible: true });
  let fired = gate.update({ timestamp: 500, elementVisible: true, pageVisible: true });
  assert.equal(fired, false);

  // 500ms時点でタブが非アクティブになり、3000msの間そのまま
  gate.update({ timestamp: 500, elementVisible: true, pageVisible: false });
  fired = gate.update({ timestamp: 3500, elementVisible: true, pageVisible: false });
  assert.equal(fired, false, '非アクティブタブの間は加算されないため発火しない');

  // タブがアクティブに戻った直後は、起点がリセットされているため即座には発火しない
  fired = gate.update({ timestamp: 3500, elementVisible: true, pageVisible: true });
  assert.equal(fired, false, '復帰直後は起点がリセットされているため発火しない（蓄積済みの500msは持ち越されない）');
  fired = gate.update({ timestamp: 4000, elementVisible: true, pageVisible: true }); // 復帰から500ms
  assert.equal(fired, false, '復帰から500msではまだ発火しない（持ち越しなしで0から再計測のため）');
  fired = gate.update({ timestamp: 4500, elementVisible: true, pageVisible: true }); // 復帰から1000ms
  assert.equal(fired, true, '復帰してから新たに1000ms連続可視になった時点で発火する');
});

test('非アクティブタブ中に要素が不可視化した場合はタイマーが取消される', () => {
  const gate = new CtaVisibilityGate({ requiredDurationMs: 1000 });

  gate.update({ timestamp: 0, elementVisible: true, pageVisible: true });
  gate.update({ timestamp: 500, elementVisible: true, pageVisible: true }); // 500ms蓄積

  // タブが非アクティブになり、かつ要素も不可視になる（例: 結果ブロックが非表示に切り替わった等）
  let fired = gate.update({ timestamp: 500, elementVisible: false, pageVisible: false });
  assert.equal(fired, false);

  // 再度可視・アクティブになっても、蓄積は0からスタートする
  gate.update({ timestamp: 10000, elementVisible: true, pageVisible: true });
  fired = gate.update({ timestamp: 10800, elementVisible: true, pageVisible: true }); // 800ms
  assert.equal(fired, false, '取消されているため800msでは発火しない');
  fired = gate.update({ timestamp: 11000, elementVisible: true, pageVisible: true }); // 1000ms
  assert.equal(fired, true);
});

test('結果切替等で古いタイマーが残らない: 新しいCtaVisibilityGateインスタンスは互いに独立している', () => {
  const gateA = new CtaVisibilityGate({ requiredDurationMs: 1000 });
  const gateB = new CtaVisibilityGate({ requiredDurationMs: 1000 });

  // gateAだけ1000ms可視にして発火させる
  gateA.update({ timestamp: 0, elementVisible: true, pageVisible: true });
  const firedA = gateA.update({ timestamp: 1000, elementVisible: true, pageVisible: true });
  assert.equal(firedA, true);

  // gateBは一度もupdateを呼ばれていないので未発火・未蓄積のまま
  assert.equal(gateB.isFired(), false);
  const firedB = gateB.update({ timestamp: 1000, elementVisible: true, pageVisible: true });
  assert.equal(firedB, false, '新しいgateは0msからの計測になるため、1回のupdateだけでは発火しない');
});

test('しきい値50%の判定自体はgateの外側（呼び出し側）の責務: elementVisible=falseとして渡されたら発火しない', () => {
  // ratio>=0.5 かどうかの判定は呼び出し側（IntersectionObserverのratio）で行い、
  // gateにはbooleanのelementVisibleとして渡す。ratio=0.4のような境界未満は呼び出し側でfalseに変換される想定。
  const gate = new CtaVisibilityGate({ requiredDurationMs: 1000 });
  gate.update({ timestamp: 0, elementVisible: false, pageVisible: true }); // ratio 0.4相当
  const fired = gate.update({ timestamp: 2000, elementVisible: false, pageVisible: true });
  assert.equal(fired, false);
});
