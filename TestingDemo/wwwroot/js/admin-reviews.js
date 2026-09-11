(() => {
  const root = document.querySelector('[data-admin-reviews]');
  if (!root) return;

  const token =
    document.querySelector('#adminAntiForgery input[name="__RequestVerificationToken"]')?.value ||
    root.querySelector('input[name="__RequestVerificationToken"]')?.value ||
    '';
  const listEl = root.querySelector('[data-admin-reviews-list]');
  const messageEl = root.querySelector('[data-admin-reviews-message]');
  const totalEl = root.querySelector('[data-admin-reviews-total]');
  const pagerEl = root.querySelector('[data-admin-reviews-pager]');
  const prevBtn = root.querySelector('[data-admin-reviews-prev]');
  const nextBtn = root.querySelector('[data-admin-reviews-next]');
  const pageLabel = root.querySelector('[data-admin-reviews-page-label]');
  const pageSizeSelect = root.querySelector('[data-admin-reviews-page-size]');
  const replyStateSelect = root.querySelector('[data-admin-reviews-reply-state]');
  const modal = root.querySelector('[data-admin-reviews-modal]');
  const modalTitle = root.querySelector('[data-admin-reviews-modal-title]');
  const modalBody = root.querySelector('[data-admin-reviews-modal-body]');
  const modalCloseButtons = root.querySelectorAll('[data-admin-reviews-modal-close]');

  let currentPage = 1;
  let total = 0;
  let pageSize = Number(pageSizeSelect?.value || 20);
  let replyState = String(replyStateSelect?.value || 'all');
  let activeReviewId = 0;
  let lastFocused = null;
  const REPLY_TEMPLATES = {
    thanks: 'Thank you for your feedback. We appreciate your stay at Mori International Hotel.',
    apology:
      'Thank you for sharing this. We are sorry for the inconvenience and are working with our team to improve.',
    invite:
      'We appreciate your review and hope to welcome you back soon for an even better stay.',
  };

  const phDate = (iso) => {
    try {
      return new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return String(iso || '');
    }
  };

  const esc = (v) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  function needsTranslation(text) {
    const value = String(text || '').trim();
    if (value.length < 8) return false;
    return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7a3\u0400-\u04ff]/u.test(value);
  }

  function commentBlockHtml(comment) {
    const raw = String(comment || '').trim();
    if (!raw) {
      return '<p class="admin-reviews-comment">No guest comment.</p>';
    }
    if (!needsTranslation(raw)) {
      return `<p class="admin-reviews-comment">${esc(raw)}</p>`;
    }
    return `
      <div class="admin-reviews-comment-wrap" data-admin-review-comment-wrap>
        <p class="admin-reviews-comment" data-admin-review-original>${esc(raw)}</p>
        <p class="admin-reviews-comment is-translated" data-admin-review-translated hidden></p>
        <button type="button"
                class="admin-reviews-translate"
                data-admin-review-translate
                aria-expanded="false">
          See translation
        </button>
      </div>`;
  }

  async function fetchTranslation(text) {
    const res = await fetch('/api/guest/reviews/translate', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ text, targetLang: 'en' }),
    });
    if (!res.ok) throw new Error(`Translate failed (${res.status})`);
    const body = await res.json();
    const translated = String(body?.translated || '').trim();
    if (!translated) throw new Error('Empty translation');
    return translated;
  }

  async function onStaffTranslateClick(button) {
    const wrap = button.closest('[data-admin-review-comment-wrap]');
    if (!wrap) return;
    const originalEl = wrap.querySelector('[data-admin-review-original]');
    const translatedEl = wrap.querySelector('[data-admin-review-translated]');
    if (!(originalEl instanceof HTMLElement) || !(translatedEl instanceof HTMLElement)) return;

    if (button.getAttribute('data-showing') === '1') {
      translatedEl.hidden = true;
      originalEl.hidden = false;
      button.setAttribute('data-showing', '0');
      button.setAttribute('aria-expanded', 'false');
      button.textContent = 'See translation';
      return;
    }

    const cached = button.getAttribute('data-translated-text');
    if (cached) {
      translatedEl.textContent = cached;
      translatedEl.hidden = false;
      originalEl.hidden = true;
      button.setAttribute('data-showing', '1');
      button.setAttribute('aria-expanded', 'true');
      button.textContent = 'Show original';
      return;
    }

    button.disabled = true;
    button.textContent = 'Translating…';
    try {
      const translated = await fetchTranslation(originalEl.textContent || '');
      button.setAttribute('data-translated-text', translated);
      translatedEl.textContent = translated;
      translatedEl.hidden = false;
      originalEl.hidden = true;
      button.setAttribute('data-showing', '1');
      button.setAttribute('aria-expanded', 'true');
      button.textContent = 'Show original';
    } catch {
      button.textContent = 'Translation unavailable';
      window.setTimeout(() => {
        button.textContent = 'See translation';
        button.disabled = false;
      }, 1800);
      return;
    }
    button.disabled = false;
  }

  function showMessage(text, isError = false) {
    if (!messageEl) return;
    messageEl.hidden = !text;
    messageEl.textContent = text || '';
    messageEl.classList.toggle('is-error', !!isError);
  }

  async function apiFetch(url, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.method && options.method !== 'GET') {
      headers.RequestVerificationToken = token;
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, { ...options, headers, credentials: 'same-origin' });
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        msg = body.message || body.title || msg;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  function renderPager(itemsCount) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (!pagerEl || !prevBtn || !nextBtn || !pageLabel) return;

    pagerEl.hidden = total <= itemsCount;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
    pageLabel.textContent = `Page ${currentPage} of ${totalPages}`;
  }

  function rowHtml(item) {
    const replyTag = item.hasHotelReply
      ? '<span class="admin-reviews-status-tag is-replied">Done replying</span>'
      : '<span class="admin-reviews-status-tag is-pending">Not replied yet</span>';

    return `
      <article class="admin-reviews-card" data-review-id="${Number(item.id)}">
        <header class="admin-reviews-card-head">
          <div>
            <strong>${esc(item.bookingReference)} · ${esc(item.guestDisplayName)}</strong>
            <p>${esc(phDate(item.createdAtUtc))}</p>
          </div>
          <span class="admin-flush-badge ${item.isPublished ? 'is-ok' : 'is-admin'}">${item.isPublished ? 'Published' : 'Hidden'}</span>
        </header>

        <p class="admin-reviews-comment">${esc(item.commentPreview || 'No written comment.')}</p>
        <div class="admin-reviews-list-meta">
          ${replyTag}
        </div>

        <div class="admin-reviews-actions admin-reviews-actions-list">
          <button type="button" class="admin-flush-submit admin-reviews-view-btn" data-action-view>View</button>
        </div>
      </article>
    `;
  }

  function openModal() {
    if (!modal) return;
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('admin-reviews-modal-open');
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('admin-reviews-modal-open');
    activeReviewId = 0;
    if (lastFocused instanceof HTMLElement) lastFocused.focus();
  }

  function detailHtml(item) {
    const tags = Array.isArray(item.tags) && item.tags.length
      ? `<ul class="admin-reviews-tags">${item.tags.map((tag) => `<li>${esc(tag)}</li>`).join('')}</ul>`
      : '';

    return `
      <article class="admin-reviews-detail" data-review-detail-id="${Number(item.id)}">
        <p class="admin-reviews-detail-meta">
          <strong>${esc(item.bookingReference)} · ${esc(item.guestDisplayName)}</strong>
          <span>${esc(phDate(item.createdAtUtc))}</span>
        </p>
        ${commentBlockHtml(item.comment)}
        ${tags}
        <p class="admin-reviews-reply-meta">
          ${item.hotelReply ? `Review response by ${esc(item.hotelReplyBy || 'Admin')} · ${esc(phDate(item.hotelReplyAtUtc))}` : 'No review response yet.'}
        </p>
        <p class="admin-reviews-scoreline">
          Rating ${Number(item.overallRating || 0)}/5 · Staff ${Number(item.staffRating || 0)} · Comfort ${Number(item.comfortRating || 0)} · Facilities ${Number(item.facilitiesRating || 0)}
        </p>

        <div class="admin-reviews-actions">
          <button type="button" class="admin-flush-ghost" data-action-publish="${item.isPublished ? 'hide' : 'show'}">
            ${item.isPublished ? 'Hide review' : 'Publish review'}
          </button>
        </div>

        <label class="admin-reviews-reply-field">
          <span>Review response</span>
          <div class="admin-reviews-template-picks" aria-label="Reply templates">
            <button type="button" class="admin-reviews-template-btn" data-reply-template="thanks">Thank you</button>
            <button type="button" class="admin-reviews-template-btn" data-reply-template="apology">Apology</button>
            <button type="button" class="admin-reviews-template-btn" data-reply-template="invite">Invite back</button>
          </div>
          <textarea maxlength="1000" data-reply-input placeholder="e.g. Thank you for your feedback.">${esc(item.hotelReply || '')}</textarea>
        </label>

        <div class="admin-reviews-actions">
          <button type="button" class="admin-flush-submit" data-action-reply>Save reply</button>
          <button type="button" class="admin-flush-ghost" data-action-clear-reply>Clear reply</button>
        </div>
      </article>
    `;
  }

  async function loadDetail(id) {
    if (!modalBody) return;
    activeReviewId = id;
    modalBody.innerHTML = '<p class="admin-reviews-empty">Loading full review…</p>';
    try {
      const detail = await apiFetch(`/api/admin/reviews/${id}`);
      if (modalTitle) modalTitle.textContent = `Review details · ${detail.bookingReference}`;
      modalBody.innerHTML = detailHtml(detail);
      bindDetailActions();
      modalBody.querySelector('[data-action-publish]')?.focus();
    } catch (err) {
      modalBody.innerHTML = '<p class="admin-reviews-empty">Unable to load review details.</p>';
      showMessage(err instanceof Error ? err.message : 'Unable to load review details.', true);
    }
  }

  function bindDetailActions() {
    if (!modalBody || !activeReviewId) return;

    modalBody.querySelector('[data-admin-review-translate]')?.addEventListener('click', (event) => {
      const btn = event.currentTarget;
      if (!(btn instanceof HTMLElement)) return;
      void onStaffTranslateClick(btn);
    });

    modalBody.querySelector('[data-action-publish]')?.addEventListener('click', async (event) => {
      const btn = event.currentTarget;
      const willHide = btn?.getAttribute('data-action-publish') === 'hide';
      if (btn) btn.disabled = true;
      try {
        await apiFetch(`/api/admin/reviews/${activeReviewId}/publish`, {
          method: 'PUT',
          body: JSON.stringify({ isPublished: !willHide }),
        });
        showMessage(willHide ? 'Review hidden.' : 'Review published.');
        await Promise.all([loadPage(), loadDetail(activeReviewId)]);
      } catch (err) {
        showMessage(err instanceof Error ? err.message : 'Unable to update review.', true);
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    modalBody.querySelector('[data-action-reply]')?.addEventListener('click', async (event) => {
      const btn = event.currentTarget;
      const text = modalBody.querySelector('[data-reply-input]')?.value ?? '';
      if (btn) btn.disabled = true;
      try {
        await apiFetch(`/api/admin/reviews/${activeReviewId}/reply`, {
          method: 'PUT',
          body: JSON.stringify({ reply: text }),
        });
        closeModal();
        await loadPage();
        showMessage('Successfully responded to the review.');
        if (typeof window.showMoriNotice === 'function') {
          window.showMoriNotice('Successfully responded to the review.', 'success');
        }
      } catch (err) {
        showMessage(err instanceof Error ? err.message : 'Unable to save response.', true);
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    modalBody.querySelector('[data-action-clear-reply]')?.addEventListener('click', async (event) => {
      const btn = event.currentTarget;
      if (btn) btn.disabled = true;
      try {
        await apiFetch(`/api/admin/reviews/${activeReviewId}/reply`, {
          method: 'PUT',
          body: JSON.stringify({ reply: '' }),
        });
        showMessage('Hotel reply cleared.');
        await Promise.all([loadPage(), loadDetail(activeReviewId)]);
      } catch (err) {
        showMessage(err instanceof Error ? err.message : 'Unable to clear reply.', true);
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    modalBody.querySelectorAll('[data-reply-template]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-reply-template') || '';
        const template = REPLY_TEMPLATES[key];
        if (!template) return;
        const input = modalBody.querySelector('[data-reply-input]');
        if (!input) return;
        input.value = template;
        input.focus();
      });
    });
  }

  async function loadPage() {
    if (!listEl) return;
    showMessage('');
    listEl.innerHTML = '<p class="admin-reviews-empty">Loading reviews…</p>';
    try {
      const page = await apiFetch(
        `/api/admin/reviews?page=${encodeURIComponent(String(currentPage))}&pageSize=${encodeURIComponent(String(pageSize))}&replyState=${encodeURIComponent(replyState)}`
      );
      const items = Array.isArray(page?.items) ? page.items : [];
      total = Number(page?.total || 0);
      currentPage = Math.max(1, Number(page?.page || currentPage));
      if (totalEl) totalEl.textContent = String(total);

      if (!items.length) {
        listEl.innerHTML = '<p class="admin-reviews-empty">No reviews found on this page.</p>';
      } else {
        listEl.innerHTML = items.map(rowHtml).join('');
        listEl.querySelectorAll('[data-action-view]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const card = btn.closest('[data-review-id]');
            const id = Number(card?.getAttribute('data-review-id'));
            if (!id) return;
            openModal();
            await loadDetail(id);
          });
        });
      }
      renderPager(items.length);
    } catch (err) {
      listEl.innerHTML = '<p class="admin-reviews-empty">Unable to load reviews.</p>';
      showMessage(err instanceof Error ? err.message : 'Unable to load reviews.', true);
    }
  }

  prevBtn?.addEventListener('click', async () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    await loadPage();
  });

  nextBtn?.addEventListener('click', async () => {
    currentPage += 1;
    await loadPage();
  });

  pageSizeSelect?.addEventListener('change', async () => {
    const next = Number(pageSizeSelect.value || 20);
    pageSize = Number.isFinite(next) ? Math.max(10, Math.min(100, next)) : 20;
    currentPage = 1;
    await loadPage();
  });

  replyStateSelect?.addEventListener('change', async () => {
    replyState = String(replyStateSelect.value || 'all');
    currentPage = 1;
    await loadPage();
  });

  modalCloseButtons.forEach((button) => button.addEventListener('click', closeModal));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.hidden) {
      closeModal();
    }
  });

  void loadPage();
})();
