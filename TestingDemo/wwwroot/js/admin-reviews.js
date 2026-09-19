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
  const searchEl = root.querySelector('[data-admin-reviews-q]');
  const modal = root.querySelector('[data-admin-reviews-modal]');
  const modalTitle = root.querySelector('[data-admin-reviews-modal-title]');
  const modalBody = root.querySelector('[data-admin-reviews-modal-body]');
  const modalCloseButtons = root.querySelectorAll('[data-admin-reviews-modal-close]');

  // --- store ---------------------------------------------------------------
  const store = {
    items: new Map(), // id -> list dto
    page: 1,
    total: 0,
    pageSize: Number(pageSizeSelect?.value || 20),
    replyState: String(replyStateSelect?.value || 'all'),
    q: '',
    loading: false,
  };
  let reqSeq = 0;
  let listAbort = null;
  let detailAbort = null;
  let prefetched = null; // { key, data }

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

  // Mirrors StayReviewService.SummarizeText so mutation responses can patch
  // the list card without a full page refetch.
  function summarizeText(value) {
    const oneLine = String(value || '')
      .split(/\r?\n/)
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' ');
    if (!oneLine) return 'No written comment.';
    return oneLine.length <= 150 ? oneLine : `${oneLine.slice(0, 150).trimEnd()}...`;
  }

  const debounce = (fn, ms) => {
    let t = 0;
    return (...args) => {
      window.clearTimeout(t);
      t = window.setTimeout(() => fn(...args), ms);
    };
  };

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

  // --- rendering ------------------------------------------------------------

  function renderPager(itemsCount) {
    const totalPages = Math.max(1, Math.ceil(store.total / store.pageSize));
    if (!pagerEl || !prevBtn || !nextBtn || !pageLabel) return;

    pagerEl.hidden = store.total <= itemsCount;
    prevBtn.disabled = store.loading || store.page <= 1;
    nextBtn.disabled = store.loading || store.page >= totalPages;
    pageLabel.textContent = `Page ${store.page} of ${totalPages}`;
  }

  function rowHtml(item) {
    const replyTag = item.hasHotelReply
      ? '<span class="admin-reviews-status-tag is-replied">Done replying</span>'
      : '<span class="admin-reviews-status-tag is-pending">Not replied yet</span>';

    return `
      <tr data-review-id="${Number(item.id)}">
        <td data-label="When (PH)">${esc(phDate(item.createdAtUtc))}</td>
        <td data-label="Booking"><strong>${esc(item.bookingReference)}</strong></td>
        <td data-label="Guest">${esc(item.guestDisplayName)}</td>
        <td data-label="Rating">${Number(item.overallRating || 0)}/5</td>
        <td data-label="Comment" class="admin-reviews-comment-cell">${esc(item.commentPreview || 'No written comment.')}</td>
        <td data-label="Reply">${replyTag}</td>
        <td data-label="Status"><span class="admin-flush-badge ${item.isPublished ? 'is-ok' : 'is-admin'}">${item.isPublished ? 'Published' : 'Hidden'}</span></td>
        <td class="admin-booking-table-actions" data-label="Actions">
          <button type="button" data-action-view>View</button>
        </td>
      </tr>
    `;
  }

  function buildRow(item) {
    const template = document.createElement('template');
    template.innerHTML = rowHtml(item).trim();
    return template.content.firstElementChild;
  }

  function renderItems(items) {
    const frag = document.createDocumentFragment();
    for (const item of items) {
      store.items.set(item.id, item);
      frag.appendChild(buildRow(item));
    }
    listEl.replaceChildren(frag); // single DOM flush — no per-row reflow
  }

  // Patch one row in place after a mutation — no list reload, no scroll jump.
  function patchFromDetail(detail) {
    const item = {
      id: detail.id,
      bookingReference: detail.bookingReference,
      guestDisplayName: detail.guestDisplayName,
      overallRating: detail.overallRating,
      isPublished: detail.isPublished,
      createdAtUtc: detail.createdAtUtc,
      commentPreview: summarizeText(detail.comment),
      hasHotelReply: !!detail.hotelReply,
    };
    store.items.set(item.id, item);
    const old = listEl?.querySelector(`[data-review-id="${item.id}"]`);
    if (old) old.replaceWith(buildRow(item));
  }

  // --- fetching -------------------------------------------------------------

  const pageUrl = (page) =>
    `/api/admin/reviews?page=${encodeURIComponent(String(page))}` +
    `&pageSize=${encodeURIComponent(String(store.pageSize))}` +
    `&replyState=${encodeURIComponent(store.replyState)}` +
    `&q=${encodeURIComponent(store.q)}`;

  const prefetchKey = (page) =>
    `${page}|${store.pageSize}|${store.replyState}|${store.q}`;

  function schedulePrefetch() {
    const totalPages = Math.ceil(store.total / store.pageSize);
    if (store.page >= totalPages) return;
    const next = store.page + 1;
    const key = prefetchKey(next);
    if (prefetched?.key === key) return;
    const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 250));
    idle(async () => {
      try {
        const data = await apiFetch(pageUrl(next));
        prefetched = { key, data };
      } catch {
        prefetched = null;
      }
    });
  }

  async function loadPage() {
    if (!listEl) return;
    listAbort?.abort();
    const ctl = new AbortController();
    listAbort = ctl;
    const seq = ++reqSeq;
    store.loading = true;
    renderPager(listEl.childElementCount);
    showMessage('');

    // Keep existing rows while fetching — only show the empty "Loading" state
    // when the list has nothing yet (first paint).
    if (!listEl.childElementCount) {
      listEl.innerHTML = '<tr><td colspan="8" class="admin-bookings-loading">Loading reviews…</td></tr>';
    } else {
      listEl.classList.add('is-updating');
    }

    try {
      let page;
      const key = prefetchKey(store.page);
      if (prefetched?.key === key) {
        page = prefetched.data;
        prefetched = null;
      } else {
        page = await apiFetch(pageUrl(store.page), { signal: ctl.signal });
      }
      if (seq !== reqSeq) return; // a newer request already superseded this one

      const items = Array.isArray(page?.items) ? page.items : [];
      store.total = Number(page?.total || 0);
      store.page = Math.max(1, Number(page?.page || store.page));
      store.items = new Map(items.map((i) => [i.id, i]));
      if (totalEl) totalEl.textContent = String(store.total);

      listEl.classList.remove('is-updating');
      if (!items.length) {
        listEl.innerHTML = '<tr><td colspan="8" class="admin-bookings-loading">No reviews found.</td></tr>';
      } else {
        renderItems(items);
      }
      renderPager(items.length);
      schedulePrefetch();
    } catch (err) {
      if (ctl.signal.aborted || err?.name === 'AbortError') return;
      listEl.classList.remove('is-updating');
      listEl.innerHTML = '<tr><td colspan="8" class="admin-bookings-loading">Unable to load reviews.</td></tr>';
      showMessage(err instanceof Error ? err.message : 'Unable to load reviews.', true);
    } finally {
      if (seq === reqSeq) store.loading = false;
      renderPager(listEl.childElementCount);
    }
  }

  // --- detail modal -----------------------------------------------------------

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
    detailAbort?.abort();
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
    detailAbort?.abort();
    const ctl = new AbortController();
    detailAbort = ctl;
    activeReviewId = id;
    modalBody.innerHTML = '<p class="admin-reviews-empty">Loading full review…</p>';
    try {
      const detail = await apiFetch(`/api/admin/reviews/${id}`, { signal: ctl.signal });
      if (ctl.signal.aborted) return;
      if (modalTitle) modalTitle.textContent = `Review details · ${detail.bookingReference}`;
      modalBody.innerHTML = detailHtml(detail);
      bindDetailActions();
      modalBody.querySelector('[data-action-publish]')?.focus();
    } catch (err) {
      if (ctl.signal.aborted || err?.name === 'AbortError') return;
      modalBody.innerHTML = '<p class="admin-reviews-empty">Unable to load review details.</p>';
      showMessage(err instanceof Error ? err.message : 'Unable to load review details.', true);
    }
  }

  // Refresh strategy after a reply mutation: under an active reply-state filter
  // the item may no longer belong in this list — reload. Under "all", patch.
  async function refreshAfterReplyChange() {
    if (store.replyState === 'all') return; // card already patched in place
    await loadPage();
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
        const updated = await apiFetch(`/api/admin/reviews/${activeReviewId}/publish`, {
          method: 'PUT',
          body: JSON.stringify({ isPublished: !willHide }),
        });
        patchFromDetail(updated);
        showMessage(willHide ? 'Review hidden.' : 'Review published.');
        await loadDetail(activeReviewId);
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
        const updated = await apiFetch(`/api/admin/reviews/${activeReviewId}/reply`, {
          method: 'PUT',
          body: JSON.stringify({ reply: text }),
        });
        patchFromDetail(updated);
        closeModal();
        await refreshAfterReplyChange();
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
        const updated = await apiFetch(`/api/admin/reviews/${activeReviewId}/reply`, {
          method: 'PUT',
          body: JSON.stringify({ reply: '' }),
        });
        patchFromDetail(updated);
        await Promise.all([loadDetail(activeReviewId), refreshAfterReplyChange()]);
        showMessage('Hotel reply cleared.');
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

  // --- events (delegated — bound once, survive re-renders) --------------------

  listEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action-view]');
    if (!btn) return;
    const card = btn.closest('[data-review-id]');
    const id = Number(card?.getAttribute('data-review-id'));
    if (!id) return;
    openModal();
    void loadDetail(id);
  });

  prevBtn?.addEventListener('click', async () => {
    if (store.loading || store.page <= 1) return;
    store.page -= 1;
    await loadPage();
  });

  nextBtn?.addEventListener('click', async () => {
    if (store.loading) return;
    const totalPages = Math.ceil(store.total / store.pageSize);
    if (store.page >= totalPages) return;
    store.page += 1;
    await loadPage();
  });

  pageSizeSelect?.addEventListener('change', async () => {
    const next = Number(pageSizeSelect.value || 20);
    store.pageSize = Number.isFinite(next) ? Math.max(10, Math.min(100, next)) : 20;
    store.page = 1;
    prefetched = null;
    await loadPage();
  });

  replyStateSelect?.addEventListener('change', async () => {
    store.replyState = String(replyStateSelect.value || 'all');
    store.page = 1;
    prefetched = null;
    await loadPage();
  });

  searchEl?.addEventListener(
    'input',
    debounce(() => {
      const next = searchEl.value.trim();
      if (next === store.q) return;
      store.q = next;
      store.page = 1;
      prefetched = null;
      void loadPage();
    }, 300)
  );

  modalCloseButtons.forEach((button) => button.addEventListener('click', closeModal));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.hidden) {
      closeModal();
    }
  });

  void loadPage();
})();
