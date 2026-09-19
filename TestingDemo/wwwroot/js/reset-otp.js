(function () {
  'use strict';

  var form = document.getElementById('staffResetOtpForm');
  if (!form) return;

  var hidden = document.getElementById('Otp');
  var digits = Array.prototype.slice.call(document.querySelectorAll('.guest-auth-otp-digit'));
  if (!hidden || digits.length !== 6) return;

  function syncHidden() {
    hidden.value = digits.map(function (el) { return el.value.replace(/\D/g, ''); }).join('');
  }

  function focusIndex(index) {
    if (index >= 0 && index < digits.length) digits[index].focus();
  }

  digits.forEach(function (input, index) {
    input.addEventListener('input', function () {
      var val = input.value.replace(/\D/g, '');
      input.value = val.slice(-1);
      if (val && index < digits.length - 1) focusIndex(index + 1);
      syncHidden();
    });

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Backspace' && !input.value && index > 0) {
        focusIndex(index - 1);
      }
      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        focusIndex(index - 1);
      }
      if (event.key === 'ArrowRight' && index < digits.length - 1) {
        event.preventDefault();
        focusIndex(index + 1);
      }
    });

    input.addEventListener('paste', function (event) {
      event.preventDefault();
      var text = (event.clipboardData || window.clipboardData).getData('text') || '';
      var chars = text.replace(/\D/g, '').slice(0, 6).split('');
      chars.forEach(function (ch, i) {
        if (digits[i]) digits[i].value = ch;
      });
      syncHidden();
      focusIndex(Math.min(chars.length, digits.length - 1));
    });
  });

  form.addEventListener('submit', function () {
    syncHidden();
  });

  if (!hidden.value && digits[0]) {
    digits[0].focus();
  }
})();
