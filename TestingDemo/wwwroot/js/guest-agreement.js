(function () {
  'use strict';

  var form = document.getElementById('guestAgreementForm');
  var loading = document.getElementById('guestAgreementLoading');
  var submitBtn = document.getElementById('guestAgreementSubmit');
  var accepted = form && form.querySelector('#AcceptedTerms');
  if (!form || !loading || !submitBtn || !accepted) return;

  function syncSubmit() {
    submitBtn.disabled = !accepted.checked;
  }

  form.querySelectorAll('.guest-auth-policy-link').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.stopPropagation();
    });
  });

  accepted.addEventListener('change', syncSubmit);
  syncSubmit();

  form.addEventListener('submit', function (event) {
    if (!accepted.checked) {
      event.preventDefault();
      return;
    }

    loading.hidden = false;
    loading.setAttribute('aria-hidden', 'false');

    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');

    document.body.classList.add('guest-auth-is-loading');
  });
})();
