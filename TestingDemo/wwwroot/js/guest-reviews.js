(() => {
  const root = document.querySelector('[data-guest-reviews]');
  if (!root) return;

  const STAR_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.6l2.7 6.2 6.7.6-5.1 4.4 1.5 6.5L12 16.9 6.2 20.3l1.5-6.5-5.1-4.4 6.7-.6L12 2.6z"/></svg>';

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
  const overallInput = root.querySelector('[data-review-overall]');
  const staffInput = root.querySelector('[data-review-staff]');
  const comfortInput = root.querySelector('[data-review-comfort]');
  const facilitiesInput = root.querySelector('[data-review-facilities]');
  const commentEl = root.querySelector('[data-review-comment]');
  const submitBtn = root.querySelector('[data-review-submit]');
  let lastPage = null;
  let lastFocused = null;

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

  function ratingWord(value) {
    const n = Number(value);
    if (n === 5) return t('reviews.excellentShort');
    if (n === 4) return t('reviews.veryGoodShort');
    if (n === 3) return t('reviews.goodShort');
    if (n === 2) return t('reviews.fairShort');
    if (n === 1) return t('reviews.poorShort');
    return '';
  }

  function starsMarkup(rating, ariaLabel) {
    const n = Math.max(0, Math.min(5, Number(rating) || 0));
    const label = ariaLabel || t('reviews.starsOutOf', { n });
    let html = `<span class="guest-review-stars" aria-label="${escapeHtml(label)}">`;
    for (let i = 1; i <= 5; i += 1) {
      html += `<span class="${i <= n ? 'is-on' : ''}" aria-hidden="true">${STAR_SVG}</span>`;
    }
    html += '</span>';
    return html;
  }

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

  function setStarValue(field, value, { announce = true } = {}) {
    const wrap = root.querySelector(`[data-star-field="${field}"]`);
    if (!wrap) return;
    const input = wrap.querySelector('input[type="hidden"]');
    const labelEl = wrap.querySelector('[data-star-label]');
    const n = Math.max(0, Math.min(5, Number(value) || 0));
    if (input) input.value = n > 0 ? String(n) : '';
    wrap.classList.toggle('is-rated', n > 0);
    wrap.querySelectorAll('[data-star-value]').forEach((btn) => {
      const v = Number(btn.getAttribute('data-star-value'));
      const on = v <= n && n > 0;
      const selected = v === n;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-checked', selected ? 'true' : 'false');
      btn.tabIndex = selected || (n === 0 && v === 1) ? 0 : -1;
    });
    if (labelEl) {
      labelEl.textContent = n > 0 ? `${n}/5 · ${ratingWord(n)}` : '';
      if (!announce) labelEl.setAttribute('aria-hidden', n ? 'false' : 'true');
    }
  }

  function previewStars(field, hoverValue) {
    const wrap = root.querySelector(`[data-star-field="${field}"]`);
    if (!wrap) return;
    const current = Number(wrap.querySelector('input[type="hidden"]')?.value || 0);
    const n = hoverValue == null ? current : hoverValue;
    wrap.querySelectorAll('[data-star-value]').forEach((btn) => {
      const v = Number(btn.getAttribute('data-star-value'));
      btn.classList.toggle('is-preview', hoverValue != null && v <= hoverValue);
      if (hoverValue == null) {
        btn.classList.toggle('is-on', current > 0 && v <= current);
      }
    });
  }

  function initStarFields() {
    root.querySelectorAll('[data-star-field]').forEach((field) => {
      const name = field.getAttribute('data-star-field');
      const row = field.querySelector('[data-star-row]');
      if (!row || row.childElementCount) return;

      for (let v = 1; v <= 5; v += 1) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'guest-star-btn';
        btn.setAttribute('role', 'radio');
        btn.setAttribute('data-star-value', String(v));
        btn.setAttribute('aria-checked', 'false');
        btn.tabIndex = v === 1 ? 0 : -1;
        btn.setAttribute('aria-label', `${v} — ${ratingWord(v) || v}`);
        btn.innerHTML = STAR_SVG;
        btn.addEventListener('click', () => setStarValue(name, v));
        btn.addEventListener('mouseenter', () => previewStars(name, v));
        btn.addEventListener('mouseleave', () => previewStars(name, null));
        btn.addEventListener('focus', () => previewStars(name, v));
        btn.addEventListener('blur', () => previewStars(name, null));
        btn.addEventListener('keydown', (event) => {
          let next = null;
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(5, v + 1);
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(1, v - 1);
          if (event.key === 'Home') next = 1;
          if (event.key === 'End') next = 5;
          if (next == null) return;
          event.preventDefault();
          setStarValue(name, next);
          field.querySelector(`[data-star-value="${next}"]`)?.focus();
        });
        row.appendChild(btn);
      }

      setStarValue(name, 0, { announce: false });
    });
  }

  function resetStars() {
    ['overall', 'staff', 'comfort', 'facilities'].forEach((name) => setStarValue(name, 0, { announce: false }));
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('guest-review-modal-open');
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus();
    }
    lastFocused = null;
  }

  function openCreate(stay) {
    if (!modal || !form) return;
    lastFocused = document.activeElement;
    form.reset();
    resetStars();
    if (bookingIdInput) bookingIdInput.value = String(stay.bookingId);
    if (reviewIdInput) reviewIdInput.value = '';
    if (titleEl) titleEl.textContent = t('reviews.reviewStay', { ref: stay.reference });
    if (submitBtn) submitBtn.textContent = t('reviews.submit');
    modal.hidden = false;
    document.body.classList.add('guest-review-modal-open');
    modal.querySelector('[data-star-field="overall"] [data-star-value="1"]')?.focus();
  }

  function openEdit(review) {
    if (!modal || !form) return;
    lastFocused = document.activeElement;
    form.reset();
    if (bookingIdInput) bookingIdInput.value = String(review.bookingId);
    if (reviewIdInput) reviewIdInput.value = String(review.id);
    setStarValue('overall', review.overallRating, { announce: false });
    setStarValue('staff', review.staffRating, { announce: false });
    setStarValue('comfort', review.comfortRating, { announce: false });
    setStarValue('facilities', review.facilitiesRating, { announce: false });
    if (commentEl) commentEl.value = review.comment || '';
    const tagSet = new Set(review.tags || []);
    root.querySelectorAll('[data-review-tags] input[type="checkbox"]').forEach((box) => {
      box.checked = tagSet.has(box.value);
    });
    if (titleEl) titleEl.textContent = t('reviews.editReview', { ref: review.bookingReference });
    if (submitBtn) submitBtn.textContent = t('reviews.saveChanges');
    modal.hidden = false;
    document.body.classList.add('guest-review-modal-open');
    modal.querySelector('[data-star-field="overall"] [aria-checked="true"]')?.focus();
  }

  function renderEligible(items) {
    if (!eligibleEl) return;
    if (!items?.length) {
      eligibleEl.innerHTML = `
        <div class="guest-reviews-empty-card">
          <div class="guest-reviews-empty-visual" aria-hidden="true">
            <img src="/Images/Hallways/Hallway4.jpg" alt="" decoding="async" loading="lazy" />
          </div>
          <div class="guest-reviews-empty-copy">
            <p class="guest-reviews-empty">${t('reviews.emptyEligible')}</p>
            <p class="guest-reviews-empty-sub">${t('reviews.emptyEligibleSub')}</p>
            <a class="guest-btn guest-btn-primary" href="/Booking/Accommodations#rooms">${t('reviews.bookNow')}</a>
          </div>
        </div>`;
      return;
    }
    eligibleEl.innerHTML = items
      .map(
        (stay) => `
      <article class="guest-reviews-portal-card is-eligible">
        <div class="guest-reviews-portal-card-media" aria-hidden="true">
          <img src="/Images/Rooms/Room1.jpg" alt="" decoding="async" loading="lazy" />
        </div>
        <div class="guest-reviews-portal-card-body">
          <p class="guest-reviews-portal-kicker">${t('reviews.verified')}</p>
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
      mineEl.innerHTML = `
        <div class="guest-reviews-empty-card is-soft">
          <p class="guest-reviews-empty">${t('reviews.emptyMine')}</p>
        </div>`;
      return;
    }
    mineEl.innerHTML = items
      .map(
        (review) => `
      <article class="guest-reviews-portal-card is-mine">
        <div class="guest-reviews-portal-card-body">
          <div class="guest-reviews-portal-card-top">
            <strong>${escapeHtml(review.bookingReference)}</strong>
            ${starsMarkup(review.overallRating, t('reviews.starsOutOf', { n: review.overallRating }))}
          </div>
          <p>${escapeHtml(review.comment || t('reviews.noComment'))}</p>
          <small>${escapeHtml(
            t('reviews.ratingsLine', {
              staff: review.staffRating,
              comfort: review.comfortRating,
              facilities: review.facilitiesRating,
            })
          )}</small>
        </div>
        ${
            review.canEdit
            ? `<button type="button" class="guest-btn guest-btn-ghost" data-open-edit="${Number(review.id)}">${t('reviews.editReviewBtn')}</button>`
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
      overallRating: Number(overallInput?.value || 0),
      staffRating: Number(staffInput?.value || 0),
      comfortRating: Number(comfortInput?.value || 0),
      facilitiesRating: Number(facilitiesInput?.value || 0),
      wouldRecommend: null,
      comment: commentEl?.value || '',
      tags,
    };
  }

  function ratingsComplete(payload) {
    return [payload.overallRating, payload.staffRating, payload.comfortRating, payload.facilitiesRating].every(
      (n) => n >= 1 && n <= 5
    );
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
    if (!ratingsComplete(payload)) {
      showMessage(t('reviews.needRatings'), true);
      modal?.querySelector('[data-star-field="overall"] [data-star-value="1"]')?.focus();
      return;
    }
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
      const message = error instanceof Error ? error.message : t('reviews.unableSave');
      const alreadyReviewed = /already has a review/i.test(message);
      if (alreadyReviewed && id <= 0) {
        await loadPortal();
        const existing = lastPage?.mine?.find((item) => Number(item.bookingId) === payload.bookingId);
        if (existing?.canEdit) {
          openEdit(existing);
          showMessage(t('reviews.alreadyReviewedEdit'), false);
          return;
        }
        if (existing) {
          showMessage(t('reviews.alreadyReviewedLocked'), true);
          return;
        }
      }
      showMessage(message, true);
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
    root.querySelectorAll('[data-star-field]').forEach((field) => {
      const name = field.getAttribute('data-star-field');
      const value = field.querySelector('input[type="hidden"]')?.value;
      field.querySelectorAll('[data-star-value]').forEach((btn) => {
        const v = Number(btn.getAttribute('data-star-value'));
        btn.setAttribute('aria-label', `${v} — ${ratingWord(v) || v}`);
      });
      setStarValue(name, value, { announce: false });
    });
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

  initStarFields();
  void loadPortal();
})();
