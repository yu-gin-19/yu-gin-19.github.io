document.querySelectorAll('.faq-question').forEach(function (btn) {
  var item = btn.closest('.faq-item');
  var panel = document.getElementById(btn.getAttribute('aria-controls'));
  if (!item || !panel) return;

  function setOpen(isOpen) {
    item.classList.toggle('is-open', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
    panel.setAttribute('aria-hidden', String(!isOpen));
    if (isOpen) {
      panel.removeAttribute('inert');
    } else {
      panel.setAttribute('inert', '');
    }
  }

  setOpen(btn.getAttribute('aria-expanded') === 'true');

  btn.addEventListener('click', function () {
    setOpen(!item.classList.contains('is-open'));
  });
});
