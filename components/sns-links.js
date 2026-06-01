/**
 * SNS導線の共通パーツ
 * LPと全記事の .line-cta 要素の直後に自動挿入される
 * SNSアカウントの変更はこのファイルのみ編集すればよい
 */
(function () {
  var SNS_HTML =
    '<div class="sns-links">' +
      '<p class="sns-links__text">最新情報はSNSでも発信しています</p>' +
      '<div class="sns-links__icons">' +
        '<a href="https://x.com/gin_rakuten" target="_blank" rel="noopener noreferrer" class="sns-links__btn sns-links__btn--x">X（@gin_rakuten）</a>' +
        '<a href="https://www.instagram.com/gin_rakuten" target="_blank" rel="noopener noreferrer" class="sns-links__btn sns-links__btn--instagram">Instagram</a>' +
        '<a href="https://note.com/gin_rakuten" target="_blank" rel="noopener noreferrer" class="sns-links__btn sns-links__btn--note">note</a>' +
      '</div>' +
    '</div>';

  document.querySelectorAll('.line-cta').forEach(function (el) {
    el.insertAdjacentHTML('afterend', SNS_HTML);
  });
})();
