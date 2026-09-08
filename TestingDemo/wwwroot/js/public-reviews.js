(() => {
  const root = document.querySelector('[data-public-reviews]');
  if (!root) return;

  const section = root.closest('.guest-reviews') || root;
  const openBtn = section.querySelector('[data-reviews-modal-open]');
  const modal = document.querySelector('[data-reviews-modal]');
  const modalList = modal?.querySelector('[data-reviews-modal-list]');
  const closeButtons = modal?.querySelectorAll('[data-reviews-modal-close]') ?? [];
  const apiUrl = root.getAttribute('data-public-reviews-api') || '/api/guest/reviews/public?take=60';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let lastFocused = null;
  let loadedAllReviews = false;
  let closing = false;
  let closeTimer = 0;

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
          const comment = review.comment
            ? `<p class="guest-review-comment">${escapeHtml(review.comment)}</p>`
            : `<p class="guest-review-comment is-muted">Rated staff ${Number(review.staffRating || 0)} · comfort ${Number(review.comfortRating || 0)} · facilities ${Number(review.facilitiesRating || 0)}</p>`;
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
            <article class="guest-review-card guest-review-card-modal">
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
              ${comment}
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

  async function openModal() {
    if (!modal || closing) return;
    lastFocused = document.activeElement;
    modal.classList.remove('is-leaving');
    modal.hidden = false;
    document.body.classList.add('guest-public-reviews-open');
    await loadAllReviews();
    const firstClose = modal.querySelector('[data-reviews-modal-close]');
    firstClose?.focus();
  }

  function finishClose() {
    if (!modal) return;
    modal.hidden = true;
    modal.classList.remove('is-leaving');
    document.body.classList.remove('guest-public-reviews-open');
    closing = false;
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

  openBtn?.addEventListener('click', () => {
    void openModal();
  });
  closeButtons.forEach((button) => button.addEventListener('click', closeModal));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.hidden) {
      closeModal();
    }
  });
})();
