(() => {
  const root = document.querySelector('[data-guest-reviews]');
  if (!root) return;

  const token =
    root.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
  const eligibleEl = root.querySelector('[data-review-eligible]');
  const mineEl = root.querySelector('[data-review-mine]');
  const messageEl = root.querySelector('[data-review-message]');
  const modal = root.querySelector('[data-review-modal]');
  const form = root.querySelector('[data-review-form]');
  const titleEl = root.querySelector('[data-review-modal-title]');
  const bookingIdInput = root.querySelector('[data-review-booking-id]');
  const reviewIdInput = root.querySelector('[data-review-id]');
  const overallSel = root.querySelector('[data-review-overall]');
  const staffSel = root.querySelector('[data-review-staff]');
  const comfortSel = root.querySelector('[data-review-comfort]');
  const facilitiesSel = root.querySelector('[data-review-facilities]');
  const commentEl = root.querySelector('[data-review-comment]');
  const submitBtn = root.querySelector('[data-review-submit]');
  let lastPage = null;

  function t(key, params) {
    const fn = window.MoriI18n?.t;
    return typeof fn === 'function' ? fn(key, params) : key;
  }

  function uiLocale() {
    const lang = window.MoriI18n?.getLang?.() || 'en';
    return lang === 'zh-Hans' ? 'zh-CN' : lang;
  }

  const phDate = (iso) => {
    try {
      return new Intl.DateTimeFormat(uiLocale(), {
        timeZone: 'Asia/Manila',
        dateStyle: 'medium',
      }).format(new Date(iso));
    } catch {
      return String(iso || '');
    }
  };

  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  function showMessage(text, isError = false) {
    if (!messageEl) return;
    messageEl.hidden = !text;
    messageEl.textContent = text || '';
    messageEl.classList.toggle('is-error', Boolean(isError));
  }

  async function apiFetch(url, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.method && options.method !== 'GET') {
      headers.RequestVerificationToken = token;
      if (options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }
    const res = await fetch(url, { ...options, headers, credentials: 'same-origin' });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        message = body.message || body.title || message;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('guest-review-modal-open');
  }

  function openCreate(stay) {
    if (!modal || !form) return;
    form.reset();
    if (bookingIdInput) bookingIdInput.value = String(stay.bookingId);
    if (reviewIdInput) reviewIdInput.value = '';
    if (titleEl) titleEl.textContent = t('reviews.reviewStay', { ref: stay.reference });
    if (submitBtn) submitBtn.textContent = t('reviews.submit');
    modal.hidden = false;
    document.body.classList.add('guest-review-modal-open');
  }

  function openEdit(review) {
    if (!modal || !form) return;
    form.reset();
    if (bookingIdInput) bookingIdInput.value = String(review.bookingId);
    if (reviewIdInput) reviewIdInput.value = String(review.id);
    if (overallSel) overallSel.value = String(review.overallRating);
    if (staffSel) staffSel.value = String(review.staffRating);
    if (comfortSel) comfortSel.value = String(review.comfortRating);
    if (facilitiesSel) facilitiesSel.value = String(review.facilitiesRating);
    if (commentEl) commentEl.value = review.comment || '';
    const tagSet = new Set(review.tags || []);
    root.querySelectorAll('[data-review-tags] input[type="checkbox"]').forEach((box) => {
      box.checked = tagSet.has(box.value);
    });
    if (titleEl) titleEl.textContent = t('reviews.editReview', { ref: review.bookingReference });
    if (submitBtn) submitBtn.textContent = t('reviews.saveChanges');
    modal.hidden = false;
    document.body.classList.add('guest-review-modal-open');
  }

  function renderEligible(items) {
    if (!eligibleEl) return;
    if (!items?.length) {
      eligibleEl.innerHTML =
        `<div class="guest-reviews-empty-card">
          <p class="guest-reviews-empty">${t('reviews.emptyEligible')}</p>
          <p class="guest-reviews-empty-sub">${t('reviews.emptyEligibleSub')}</p>
          <a class="guest-btn guest-btn-primary" href="/Booking/Accommodations#rooms">${t('reviews.bookNow')}</a>
        </div>`;
      return;
    }
    eligibleEl.innerHTML = items
      .map(
        (stay) => `
      <article class="guest-reviews-portal-card">
        <div>
          <strong>${escapeHtml(stay.reference)}</strong>
          <p>${escapeHtml(phDate(stay.checkInAtUtc))} → ${escapeHtml(phDate(stay.checkoutAtUtc))}</p>
        </div>
        <button type="button" class="guest-btn guest-btn-primary" data-open-create="${Number(stay.bookingId)}">${t('reviews.writeReview')}</button>
      </article>`
      )
      .join('');
    eligibleEl.querySelectorAll('[data-open-create]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-open-create'));
        const stay = items.find((s) => Number(s.bookingId) === id);
        if (stay) openCreate(stay);
      });
    });
  }

  function renderMine(items) {
    if (!mineEl) return;
    if (!items?.length) {
      mineEl.innerHTML = `<p class="guest-reviews-empty">${t('reviews.emptyMine')}</p>`;
      return;
    }
    mineEl.innerHTML = items
      .map(
        (review) => `
      <article class="guest-reviews-portal-card">
        <div>
          <strong>${escapeHtml(review.bookingReference)} · ${review.overallRating}/5</strong>
          <p>${escapeHtml(review.comment || t('reviews.noComment'))}</p>
          <small>${escapeHtml(t('reviews.ratingsLine', { staff: review.staffRating, comfort: review.comfortRating, facilities: review.facilitiesRating }))}</small>
        </div>
        ${
          review.canEdit
            ? `<button type="button" class="guest-btn guest-btn-ghost" data-open-edit="${Number(review.id)}">${t('reviews.edit')}</button>`
            : `<span class="guest-reviews-locked">${t('reviews.locked')}</span>`
        }
      </article>`
      )
      .join('');
    mineEl.querySelectorAll('[data-open-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-open-edit'));
        const review = items.find((r) => Number(r.id) === id);
        if (review) openEdit(review);
      });
    });
  }

  function collectPayload() {
    const tags = [...root.querySelectorAll('[data-review-tags] input:checked')].map((el) => el.value);
    return {
      bookingId: Number(bookingIdInput?.value || 0),
      overallRating: Number(overallSel?.value || 0),
      staffRating: Number(staffSel?.value || 0),
      comfortRating: Number(comfortSel?.value || 0),
      facilitiesRating: Number(facilitiesSel?.value || 0),
      wouldRecommend: null,
      comment: commentEl?.value || '',
      tags,
    };
  }

  async function loadPortal() {
    showMessage('');
    try {
      const page = await apiFetch('/api/guest/reviews/portal');
      lastPage = page;
      renderEligible(page.eligible);
      renderMine(page.mine);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : t('reviews.unableLoad'), true);
      if (eligibleEl) {
        eligibleEl.innerHTML = `<p class="guest-reviews-empty">${t('reviews.unableEligible')}</p>`;
      }
      if (mineEl) {
        mineEl.innerHTML = `<p class="guest-reviews-empty">${t('reviews.unableMine')}</p>`;
      }
    }
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = collectPayload();
    const id = Number(reviewIdInput?.value || 0);
    if (submitBtn) submitBtn.disabled = true;
    try {
      if (id > 0) {
        await apiFetch(`/api/guest/reviews/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showMessage(t('reviews.updated'));
      } else {
        await apiFetch('/api/guest/reviews', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showMessage(t('reviews.thankYou'));
      }
      closeModal();
      await loadPortal();
      if (typeof window.showMoriNotice === 'function') {
        window.showMoriNotice(t('reviews.saved'), 'success');
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : t('reviews.unableSave'), true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  root.querySelectorAll('[data-review-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal());
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.hidden) closeModal();
  });

  document.addEventListener('mori:langchange', () => {
    if (submitBtn && !modal?.hidden) {
      submitBtn.textContent = reviewIdInput?.value ? t('reviews.saveChanges') : t('reviews.submit');
    }
    if (titleEl && !modal?.hidden) {
      if (reviewIdInput?.value) {
        const review = lastPage?.mine?.find((item) => String(item.id) === String(reviewIdInput.value));
        if (review) titleEl.textContent = t('reviews.editReview', { ref: review.bookingReference });
      } else if (bookingIdInput?.value) {
        const stay = lastPage?.eligible?.find((item) => String(item.bookingId) === String(bookingIdInput.value));
        if (stay) titleEl.textContent = t('reviews.reviewStay', { ref: stay.reference });
      }
    }
    if (lastPage) {
      renderEligible(lastPage.eligible);
      renderMine(lastPage.mine);
    }
  });

  void loadPortal();
})();
