// Inline form validation + double-submit protection.
// Use: <form class="validate-form" novalidate> ... </form>
// Optional input attributes: data-msg="custom message", data-match="#otherInput", data-strength
(function () {
  var EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/u;

  function holder(input) { return input.closest('.money-input') || input; }

  function errorEl(input) {
    var h = holder(input);
    var e = h.nextElementSibling;
    if (!e || !e.classList.contains('field-error')) {
      e = document.createElement('small');
      e.className = 'field-error';
      h.insertAdjacentElement('afterend', e);
    }
    return e;
  }

  function message(input) {
    var v = input.validity;
    if (input.dataset.msg && !v.valid && !v.customError) return input.dataset.msg;
    if (v.valueMissing) return 'This field is required.';
    if (v.typeMismatch) return input.type === 'email' ? 'Enter a valid email address.' : 'Enter a valid value.';
    if (v.tooShort) return 'Must be at least ' + input.minLength + ' characters.';
    if (v.patternMismatch) return 'Invalid format.';
    if (v.rangeUnderflow) return 'Must be at least ' + input.min + '.';
    if (v.stepMismatch || v.badInput) return 'Enter a valid amount (max 2 decimals).';
    return input.validationMessage;
  }

  function check(input) {
    if (!input.dataset.match) input.setCustomValidity('');
    if (input.dataset.match) {
      var other = input.form.querySelector(input.dataset.match);
      input.setCustomValidity(other && input.value !== other.value ? 'Passwords do not match.' : '');
    }
    if (EMOJI.test(input.value)) input.setCustomValidity('Emojis are not allowed.');
    var ok = input.checkValidity();
    input.classList.toggle('invalid', !ok);
    input.classList.toggle('valid', ok && input.value !== '');
    errorEl(input).textContent = ok ? '' : message(input);
    return ok;
  }

  function strength(input) {
    var bar = document.createElement('div');
    bar.className = 'strength';
    bar.innerHTML = '<span></span>';
    holder(input).insertAdjacentElement('afterend', bar);
    input.addEventListener('input', function () {
      var p = input.value, s = 0;
      if (p.length >= 6) s++;
      if (p.length >= 10) s++;
      if (/[A-Z]/.test(p)) s++;
      if (/[0-9]/.test(p)) s++;
      if (/[^A-Za-z0-9]/.test(p)) s++;
      bar.firstChild.style.width = (p ? s * 20 : 0) + '%';
      bar.className = 'strength ' + (s >= 4 ? 'strong' : s >= 3 ? 'ok' : '');
    });
  }

  document.querySelectorAll('form.validate-form').forEach(function (form) {
    var fields = Array.prototype.slice.call(form.querySelectorAll('input:not([type=hidden]), select, textarea'));

    fields.forEach(function (f) {
      if (f.hasAttribute('data-strength')) strength(f);
      f.addEventListener('blur', function () { f.dataset.touched = '1'; check(f); });
      f.addEventListener('input', function () {
        if (EMOJI.test(f.value)) f.dataset.touched = '1';
        if (f.dataset.touched) check(f);
        fields.forEach(function (o) { if (o.dataset.match && o.dataset.touched) check(o); });
      });
    });

    form.addEventListener('submit', function (e) {
      var first = null;
      fields.forEach(function (f) {
        f.dataset.touched = '1';
        if (!check(f) && !first) first = f;
      });
      if (first) { e.preventDefault(); first.focus(); return; }
      var btn = form.querySelector('button[type=submit], button:not([type])');
      if (btn) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.textContent = 'Please wait…'; }
    });
  });

  window.addEventListener('pageshow', function () {
    document.querySelectorAll('form.validate-form button[disabled]').forEach(function (b) {
      b.disabled = false;
      if (b.dataset.label) b.textContent = b.dataset.label;
    });
  });
})();