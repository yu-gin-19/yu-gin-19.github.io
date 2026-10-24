/**
 * articles/fit-check/ の向き不向き診断の判定ロジック（純粋関数）。
 *
 * DOM・ブラウザAPIに一切依存しない。入力はチェック数とエリア確認状況のみで、
 * 出力は「どの結果ブロックを表示すべきか」「どのメッセージを出すか」。
 *
 * 重要: ここに書かれている条件分岐・優先順位・しきい値は、
 * 従来 articles/fit-check/index.html のインラインscript内にあった判定ロジックを
 * そのまま関数として切り出したものであり、値や分岐の意味は一切変更していない
 * （requirements.md 8-3章の全6分岐に対応）。
 */
(function () {
  'use strict';

  /**
   * @param {{fit:number, unfit:number, coverageOk:boolean, coverageStop:boolean}} input
   * @returns {{resultKey:('initial'|'fit'|'maybe'|'unfit'), diagnosisResult:(string|null), message:string}}
   */
  function diagnoseFitCheck(input) {
    input = input || {};
    var fit = input.fit || 0;
    var unfit = input.unfit || 0;
    var coverageOk = !!input.coverageOk;
    var coverageStop = !!input.coverageStop;

    // 優先順1: 何も選択されていない場合は初期案内のみ表示
    if (fit === 0 && unfit === 0) {
      return {
        resultKey: 'initial',
        diagnosisResult: null,
        message: '当てはまる項目にチェックを付けると、ここに目安が表示されます。',
      };
    }

    // 優先順2: 停止条件（エリア外・通信不足確認済みで予備回線なし）は他の点数より優先。
    // coverage-okと同時選択でも停止条件を優先する
    if (coverageStop) {
      return {
        resultKey: 'unfit',
        diagnosisResult: 'unfit',
        message:
          '現時点では向いていない可能性があります。主な利用場所がエリア外、または通信不足が確認されており予備回線もない状態のため、他の項目の点数に関わらず慎重な判断をおすすめします。',
      };
    }

    // 優先順3: エリア確認（サービスエリア内）が済んでいない場合は判断保留
    if (!coverageOk) {
      return {
        resultKey: 'maybe',
        diagnosisResult: 'maybe',
        message:
          '生活圏を確認できるまでは判断を保留してください。公式エリアマップで主な利用場所を確認したうえで、あらためてチェックしてみてください。',
      };
    }

    // 優先順4以降: エリア確認済みの場合のみ、既存の点数基準で判定
    if (fit >= 3 && unfit <= 1) {
      return {
        resultKey: 'fit',
        diagnosisResult: 'fit',
        message: '向いている可能性が高いです。紹介特典の条件へ進んでください。',
      };
    }
    if (fit <= 2 && unfit >= 2) {
      return {
        resultKey: 'unfit',
        diagnosisResult: 'unfit',
        message: '現時点では他社の方が合っている可能性があります。下の対処法を確認してから判断してください。',
      };
    }
    if (unfit >= 2) {
      return {
        resultKey: 'maybe',
        diagnosisResult: 'maybe',
        message: '注意条件が多めです。すぐに申し込まず、下の対処法を確認してください。',
      };
    }
    return {
      resultKey: 'maybe',
      diagnosisResult: 'maybe',
      message: '向き不向きが分かれる結果です。料金差と注意条件のどちらを重く見るかで判断してください。',
    };
  }

  var FitCheckDiagnosis = { diagnoseFitCheck: diagnoseFitCheck };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FitCheckDiagnosis;
  }
  if (typeof window !== 'undefined') {
    window.FitCheckDiagnosis = FitCheckDiagnosis;
  }
})();
