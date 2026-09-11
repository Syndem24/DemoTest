(() => {
  const root = document.querySelector('[data-public-reviews]');
  if (!root) return;

  const section = root.closest('.guest-reviews') || root;
  const openBtn = section.querySelector('[data-reviews-modal-open]');
  const modal = document.querySelector('[data-reviews-modal]');
  const modalList = modal?.querySelector('[data-reviews-modal-list]');
  const closeButtons = modal?.querySelectorAll('[data-reviews-modal-close]') ?? [];
  const apiUrl = root.getAttribute('data-public-reviews-api') || '/api/guest/reviews/public?take=60';
  const translateUrl =
    root.getAttribute('data-public-reviews-translate-api') || '/api/guest/reviews/translate';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let lastFocused = null;
  let loadedAllReviews = false;
  let closing = false;
  let closeTimer = 0;
  let pendingFocusKey = '';

  if (modal && modal.parentElement !== document.body) {
    document.body.append(modal);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function t(key, fallback) {
    try {
      if (window.MoriI18n && typeof window.MoriI18n.t === 'function') {
        const value = window.MoriI18n.t(key);
        if (value && value !== key) return value;
      }
    } catch (_) {
      /* keep fallback */
    }
    return fallback;
  }

  function uiLang() {
    try {
      if (window.MoriI18n && typeof window.MoriI18n.getLang === 'function') {
        return window.MoriI18n.getLang() || 'en';
      }
      return localStorage.getItem('moriGuestLang') || 'en';
    } catch (_) {
      return 'en';
    }
  }

  function formatMonth(value) {
    try {
      return new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        year: 'numeric',
      }).format(new Date(value));
    } catch {
      return '';
    }
  }

  function stars(rating) {
    const safe = Math.max(0, Math.min(5, Number(rating || 0)));
    return Array.from({ length: 5 }, (_, index) => {
      const on = index < safe ? 'is-on' : '';
      return `<span class="${on}" aria-hidden="true">★</span>`;
    }).join('');
  }

  function tagLabel(tag) {
    switch (tag) {
      case 'FriendlyStaff':
        return 'Friendly staff';
      case 'CleanRooms':
        return 'Clean rooms';
      case 'QuietStay':
        return 'Quiet stay';
      case 'GreatValue':
        return 'Great value';
      case 'ComfortableBed':
        return 'Comfortable bed';
      case 'NiceBathroom':
        return 'Nice bathroom';
      case 'SlowCheckIn':
        return 'Slow check-in';
      case 'WifiIssues':
        return 'Wi-Fi issues';
      default:
        return String(tag || '');
    }
  }

  function focusKey(text) {
    return String(text || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 120)
      .toLowerCase();
  }

  /** Show translate when comment script likely differs from the guest UI language. */
  function needsTranslation(text, lang) {
    const value = String(text || '').trim();
    if (value.length < 8) return false;

    const hasCjk = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7a3]/u.test(value);
    const hasCyr = /[\u0400-\u04ff]/u.test(value);
    const mostlyLatin = /^[\x00-\x7F\s\p{P}\p{S}]+$/u.test(value);
    const ui = String(lang || 'en').toLowerCase();

    if (ui.startsWith('zh') || ui === 'ja' || ui === 'ko' || ui === 'ru') {
      return mostlyLatin && /[A-Za-z]{12,}/.test(value);
    }

    return hasCjk || hasCyr;
  }

  function modalTranslateControlsHtml(original) {
    if (!needsTranslation(original, uiLang())) return '';
    return `
      <p class="guest-review-comment is-translated" data-review-translated hidden></p>
      <button type="button"
              class="guest-review-translate"
              data-review-translate
              aria-expanded="false">
        ${escapeHtml(t('home.reviewsSeeTranslation', 'See translation'))}
      </button>`;
  }

  function commentBlockHtml(comment, ratingsFallback) {
    if (!comment) {
      return `<p class="guest-review-comment is-muted">${escapeHtml(ratingsFallback)}</p>`;
    }
    return `
      <div class="guest-review-comment-wrap" data-review-comment-wrap>
        <p class="guest-review-comment" data-review-original>${escapeHtml(comment)}</p>
        ${modalTranslateControlsHtml(comment)}
      </div>`;
  }

  async function fetchTranslation(text) {
    const res = await fetch(translateUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        text,
        targetLang: uiLang(),
      }),
    });
    if (!res.ok) throw new Error(`Translate failed (${res.status})`);
    const body = await res.json();
    const translated = String(body?.translated || '').trim();
    if (!translated) throw new Error('Empty translation');
    return translated;
  }

  async function onTranslateClick(button) {
    const wrap = button.closest('[data-review-comment-wrap]');
    if (!wrap || !modal?.contains(wrap)) return;

    const originalEl = wrap.querySelector('[data-review-original]');
    const translatedEl = wrap.querySelector('[data-review-translated]');
    if (!(originalEl instanceof HTMLElement) || !(translatedEl instanceof HTMLElement)) return;

    const showingTranslated = button.getAttribute('data-showing') === '1';
    if (showingTranslated) {
      translatedEl.hidden = true;
      originalEl.hidden = false;
      button.setAttribute('data-showing', '0');
      button.setAttribute('aria-expanded', 'false');
      button.textContent = t('home.reviewsSeeTranslation', 'See translation');
      return;
    }

    const cached = button.getAttribute('data-translated-text');
    if (cached) {
      translatedEl.textContent = cached;
      translatedEl.hidden = false;
      originalEl.hidden = true;
      button.setAttribute('data-showing', '1');
      button.setAttribute('aria-expanded', 'true');
      button.textContent = t('home.reviewsShowOriginal', 'Show original');
      return;
    }

    const original = originalEl.textContent || '';
    button.disabled = true;
    button.textContent = t('home.reviewsTranslating', 'Translating…');

    try {
      const translated = await fetchTranslation(original);
      button.setAttribute('data-translated-text', translated);
      translatedEl.textContent = translated;
      translatedEl.hidden = false;
      originalEl.hidden = true;
      button.setAttribute('data-showing', '1');
      button.setAttribute('aria-expanded', 'true');
      button.textContent = t('home.reviewsShowOriginal', 'Show original');
    } catch {
      button.textContent = t('home.reviewsTranslateFailed', 'Translation unavailable');
      window.setTimeout(() => {
        button.textContent = t('home.reviewsSeeTranslation', 'See translation');
        button.disabled = false;
      }, 1800);
      return;
    }

    button.disabled = false;
  }

  function focusPendingReview() {
    if (!pendingFocusKey || !modalList) {
      pendingFocusKey = '';
      return false;
    }
    const cards = modalList.querySelectorAll('[data-review-focus-key]');
    let match = null;
    cards.forEach((card) => {
      if (match) return;
      if (card.getAttribute('data-review-focus-key') === pendingFocusKey) match = card;
    });
    if (!match) {
      cards.forEach((card) => {
        if (match) return;
        const key = card.getAttribute('data-review-focus-key') || '';
        if (key && (key.startsWith(pendingFocusKey) || pendingFocusKey.startsWith(key))) {
          match = card;
        }
      });
    }
    pendingFocusKey = '';
    if (!(match instanceof HTMLElement)) return false;

    match.classList.add('is-focus-review');
    match.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    const translateBtn = match.querySelector('[data-review-translate]');
    if (translateBtn instanceof HTMLElement) {
      translateBtn.focus();
    } else {
      match.setAttribute('tabindex', '-1');
      match.focus({ preventScroll: true });
    }

    window.setTimeout(() => match.classList.remove('is-focus-review'), 2200);
    return true;
  }

  /** Carousel: label only — opens the full reviews modal (no translate yet). */
  function enhanceCarouselOpeners(scope) {
    scope?.querySelectorAll('.guest-review-slide .guest-review-comment').forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (el.closest('[data-review-comment-wrap]')) return;
      if (el.classList.contains('is-muted')) return;
      const text = (el.textContent || '').trim();
      if (!needsTranslation(text, uiLang())) return;

      const wrap = document.createElement('div');
      wrap.className = 'guest-review-comment-wrap';
      wrap.setAttribute('data-review-comment-wrap', '');
      el.parentNode?.insertBefore(wrap, el);
      el.setAttribute('data-review-original', '');
      wrap.append(el);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'guest-review-translate';
      button.setAttribute('data-review-open-modal', '');
      button.setAttribute('data-review-focus-key', focusKey(text));
      button.setAttribute(
        'aria-label',
        t('home.reviewsOpenForTranslation', 'See translation') + ' — open all reviews'
      );
      button.textContent = t('home.reviewsSeeTranslation', 'See translation');
      wrap.append(button);
    });
  }

  async function loadAllReviews() {
    if (loadedAllReviews || !modalList) return;
    modalList.innerHTML = '<p class="guest-reviews-empty">Loading reviews…</p>';

    try {
      const res = await fetch(apiUrl, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const page = await res.json();
      const items = Array.isArray(page?.items) ? page.items : [];
      if (!items.length) {
        modalList.innerHTML =
          '<p class="guest-reviews-empty">No reviews are available right now.</p>';
        loadedAllReviews = true;
        return;
      }

      modalList.innerHTML = items
        .map((review) => {
          const tags = Array.isArray(review.tags) ? review.tags : [];
          const comment = String(review.comment || '').trim();
          const commentHtml = commentBlockHtml(
            comment,
            `Rated staff ${Number(review.staffRating || 0)} · comfort ${Number(review.comfortRating || 0)} · facilities ${Number(review.facilitiesRating || 0)}`
          );
          const tagHtml = tags.length
            ? `<ul class="guest-review-tags">${tags
                .map((tag) => `<li>${escapeHtml(tagLabel(tag))}</li>`)
                .join('')}</ul>`
            : '';
          const replyHtml = review.hotelReply
            ? `<div class="guest-review-reply">
                <p class="guest-review-reply-label">Review response</p>
                <p>${escapeHtml(review.hotelReply)}</p>
              </div>`
            : '';

          return `
            <article class="guest-review-card guest-review-card-modal"
                     data-review-id="${Number(review.id || 0)}"
                     data-review-focus-key="${escapeHtml(focusKey(comment))}">
              <header class="guest-review-card-head">
                <div>
                  <strong>${escapeHtml(review.displayName || 'Guest')}</strong>
                  <span class="guest-review-stars" aria-label="${Number(review.overallRating || 0)} out of 5 stars">
                    ${stars(review.overallRating)}
                  </span>
                </div>
                <time datetime="${escapeHtml(String(review.createdAtUtc || ''))}">
                  ${escapeHtml(formatMonth(review.createdAtUtc))}
                </time>
              </header>
              ${commentHtml}
              ${tagHtml}
              ${replyHtml}
            </article>`;
        })
        .join('');
      loadedAllReviews = true;
    } catch {
      modalList.innerHTML =
        '<p class="guest-reviews-empty">Unable to load all reviews right now.</p>';
    }
  }

  async function openModal(options = {}) {
    if (!modal || closing) return;
    pendingFocusKey = String(options.focusKey || '').trim();
    lastFocused = document.activeElement;
    modal.classList.remove('is-leaving');
    modal.hidden = false;
    document.body.classList.add('guest-public-reviews-open');
    await loadAllReviews();
    const focused = focusPendingReview();
    if (!focused) {
      const firstClose = modal.querySelector('[data-reviews-modal-close]');
      firstClose?.focus();
    }
  }

  function finishClose() {
    if (!modal) return;
    modal.hidden = true;
    modal.classList.remove('is-leaving');
    document.body.classList.remove('guest-public-reviews-open');
    closing = false;
    pendingFocusKey = '';
    if (lastFocused instanceof HTMLElement) {
      lastFocused.focus();
    }
  }

  function closeModal() {
    if (!modal || modal.hidden || closing) return;
    if (closeTimer) window.clearTimeout(closeTimer);
    if (reduceMotion.matches) {
      finishClose();
      return;
    }
    closing = true;
    modal.classList.add('is-leaving');
    closeTimer = window.setTimeout(finishClose, 280);
  }

  section?.addEventListener('click', (event) => {
    const openTranslate = event.target.closest('[data-review-open-modal]');
    if (openTranslate && section.contains(openTranslate)) {
      event.preventDefault();
      void openModal({
        focusKey: openTranslate.getAttribute('data-review-focus-key') || '',
      });
      return;
    }
  });

  modal?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-review-translate]');
    if (!button || !modal.contains(button)) return;
    event.preventDefault();
    void onTranslateClick(button);
  });

  enhanceCarouselOpeners(section);

  openBtn?.addEventListener('click', () => {
    void openModal();
  });
  closeButtons.forEach((button) => button.addEventListener('click', closeModal));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.hidden) {
      closeModal();
    }
  });

  document.addEventListener('mori:langchange', () => {
    loadedAllReviews = false;
    section.querySelectorAll('[data-review-open-modal]').forEach((btn) => btn.remove());
    section.querySelectorAll('.guest-review-slide [data-review-comment-wrap]').forEach((wrap) => {
      const original = wrap.querySelector('[data-review-original]');
      if (original instanceof HTMLElement) {
        original.removeAttribute('data-review-original');
        wrap.parentNode?.insertBefore(original, wrap);
      }
      wrap.remove();
    });
    enhanceCarouselOpeners(section);
  });
})();
