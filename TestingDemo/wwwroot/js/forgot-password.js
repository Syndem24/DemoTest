(function () {
  'use strict';

  var form = document.getElementById('forgotPasswordForm');
  var loading = document.getElementById('forgotPasswordLoading');
  var submitBtn = document.getElementById('forgotPasswordSubmit');
  if (!form || !loading) return;

  form.addEventListener('submit', function (event) {
    if (!form.checkValidity()) return;

    loading.hidden = false;
    loading.setAttribute('aria-hidden', 'false');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
    }

    document.body.classList.add('guest-auth-is-loading');
  });
})();
