#!/usr/bin/env node
/**
 * test-fit-check-diagnosis.mjs
 *
 * components/fit-check-diagnosis.js の純粋関数 diagnoseFitCheck() のユニットテスト。
 * requirements.md 8-3章の表に対応する全6分岐（＋初期状態）を、境界値を含めて検証する。
 * 実際のロジック関数を呼び出して判定結果（resultKey / diagnosisResult）を検証する。
 *
 * 使い方:
 *   node scripts/test-fit-check-diagnosis.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import FitCheckDiagnosisModule from '../components/fit-check-diagnosis.js';

const { diagnoseFitCheck } = FitCheckDiagnosisModule;

test('初期状態: 何もチェックしていない場合は initial（結果イベントを送らない）', () => {
  const result = diagnoseFitCheck({ fit: 0, unfit: 0, coverageOk: false, coverageStop: false });
  assert.equal(result.resultKey, 'initial');
  assert.equal(result.diagnosisResult, null);
});

test('初期状態: coverageOk/coverageStopがtrueでもfit=0,unfit=0なら initial のまま', () => {
  const result = diagnoseFitCheck({ fit: 0, unfit: 0, coverageOk: true, coverageStop: true });
  assert.equal(result.resultKey, 'initial');
  assert.equal(result.diagnosisResult, null);
});

test('分岐1: 停止条件（coverageStop）は他の点数に関わらず unfit を最優先する', () => {
  const highFit = diagnoseFitCheck({ fit: 5, unfit: 0, coverageOk: true, coverageStop: true });
  assert.equal(highFit.resultKey, 'unfit');
  assert.equal(highFit.diagnosisResult, 'unfit');

  const lowFit = diagnoseFitCheck({ fit: 1, unfit: 1, coverageOk: false, coverageStop: true });
  assert.equal(lowFit.resultKey, 'unfit');
  assert.equal(lowFit.diagnosisResult, 'unfit');
});

test('分岐2: エリア未確認（coverageOk=false, coverageStop=false）は fit/unfitの点数に関わらず maybe', () => {
  const result = diagnoseFitCheck({ fit: 5, unfit: 0, coverageOk: false, coverageStop: false });
  assert.equal(result.resultKey, 'maybe');
  assert.equal(result.diagnosisResult, 'maybe');
});

test('分岐3: coverageOk=true かつ fit>=3 かつ unfit<=1 は fit（境界値 fit=3, unfit=1）', () => {
  const result = diagnoseFitCheck({ fit: 3, unfit: 1, coverageOk: true, coverageStop: false });
  assert.equal(result.resultKey, 'fit');
  assert.equal(result.diagnosisResult, 'fit');
});

test('分岐3: fit=5, unfit=0（余裕のある境界内）も fit', () => {
  const result = diagnoseFitCheck({ fit: 5, unfit: 0, coverageOk: true, coverageStop: false });
  assert.equal(result.resultKey, 'fit');
});

test('分岐4: coverageOk=true かつ fit<=2 かつ unfit>=2 は unfit（境界値 fit=2, unfit=2）', () => {
  const result = diagnoseFitCheck({ fit: 2, unfit: 2, coverageOk: true, coverageStop: false });
  assert.equal(result.resultKey, 'unfit');
  assert.equal(result.diagnosisResult, 'unfit');
});

test('分岐5: coverageOk=true かつ fit>=3 かつ unfit>=2 は maybe（fit条件を満たしてもunfitが多ければmaybe、境界値 fit=3, unfit=2）', () => {
  const result = diagnoseFitCheck({ fit: 3, unfit: 2, coverageOk: true, coverageStop: false });
  assert.equal(result.resultKey, 'maybe');
  assert.equal(result.diagnosisResult, 'maybe');
});

test('分岐6: coverageOk=true かつ fit<=2 かつ unfit<=1（残りのケース）は maybe（境界値 fit=2, unfit=1）', () => {
  const result = diagnoseFitCheck({ fit: 2, unfit: 1, coverageOk: true, coverageStop: false });
  assert.equal(result.resultKey, 'maybe');
  assert.equal(result.diagnosisResult, 'maybe');
});

test('分岐6: fit=0, unfit=1（coverageOkのみtrue、片方だけ選択）も maybe', () => {
  const result = diagnoseFitCheck({ fit: 0, unfit: 1, coverageOk: true, coverageStop: false });
  assert.equal(result.resultKey, 'maybe');
});

test('diagnosisResultは常にfit/maybe/unfitの3値のいずれか（初期状態を除く）', () => {
  const allowed = new Set(['fit', 'maybe', 'unfit']);
  const cases = [
    { fit: 3, unfit: 1, coverageOk: true, coverageStop: false },
    { fit: 2, unfit: 2, coverageOk: true, coverageStop: false },
    { fit: 3, unfit: 2, coverageOk: true, coverageStop: false },
    { fit: 1, unfit: 0, coverageOk: true, coverageStop: false },
    { fit: 4, unfit: 0, coverageOk: false, coverageStop: false },
    { fit: 0, unfit: 4, coverageOk: true, coverageStop: true },
  ];
  for (const input of cases) {
    const result = diagnoseFitCheck(input);
    assert.ok(allowed.has(result.diagnosisResult), `unexpected diagnosisResult for ${JSON.stringify(input)}`);
  }
});
