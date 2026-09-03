(function () {
  'use strict';

  var form = document.getElementById('guestAgreementForm');
  var loading = document.getElementById('guestAgreementLoading');
  var submitBtn = document.getElementById('guestAgreementSubmit');
  if (!form || !loading) return;

  form.addEventListener('submit', function () {
    var accepted = form.querySelector('#AcceptedTerms');
    if (accepted && !accepted.checked) return;

    loading.hidden = false;
    loading.setAttribute('aria-hidden', 'false');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
    }

    document.body.classList.add('guest-auth-is-loading');
  });
})();
