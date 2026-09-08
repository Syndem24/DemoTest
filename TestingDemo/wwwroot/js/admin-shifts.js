(() => {
  const root = document.querySelector('[data-admin-shifts]');
  if (!root) return;

  const token =
    document.querySelector('#adminAntiForgery input[name="__RequestVerificationToken"]')?.value
    || root.querySelector('input[name="__RequestVerificationToken"]')?.value
    || '';

  const messageEl = root.querySelector('[data-shift-message]');
  const briefingPanel = root.querySelector('[data-shift-briefing]');
  const clockSection = root.querySelector('[data-shift-clock]');
  const startBtn = root.querySelector('[data-shift-start]');
  const endBtn = root.querySelector('[data-shift-end]');
  const saveBtn = root.querySelector('[data-shift-save-briefing]');
  const refreshBtn = root.querySelector('[data-shift-refresh]');
  const clockLede = root.querySelector('[data-shift-clock-lede]');
  const clockFoot = root.querySelector('[data-shift-clock-foot]');
  const historyBody = root.querySelector('[data-shift-history]');
  const historyPrev = root.querySelector('[data-shift-history-prev]');
  const historyNext = root.querySelector('[data-shift-history-next]');
  const historyPageLabel = root.querySelector('[data-shift-history-page]');
  const historyPageSize = root.querySelector('[data-shift-history-page-size]');
  const historyCount = root.querySelector('[data-shift-history-count]');
  const ondutyBanner = root.querySelector('[data-shift-onduty-banner]');
  const idleFlag = root.querySelector('[data-shift-idle-flag]');
  const lastHandoverBtn = root.querySelector('[data-view-last-handover]');

  const openingInput = root.querySelector('[data-shift-opening]');
  const closingInput = root.querySelector('[data-shift-closing]');
  const roomsInput = root.querySelector('[data-shift-rooms]');
  const guestsInput = root.querySelector('[data-shift-guests]');
  const offersInput = root.querySelector('[data-shift-offers]');
  const gainNotesInput = root.querySelector('[data-shift-gain-notes]');

  const noteModal = root.querySelector('[data-shift-note-modal]');
  const noteModalTitle = root.querySelector('[data-shift-note-modal-title]');
  const noteModalLabel = root.querySelector('[data-shift-note-modal-label]');
  const noteModalHint = root.querySelector('[data-shift-note-modal-hint]');
  const noteModalInput = root.querySelector('[data-shift-note-modal-input]');
  const noteEditWrap = root.querySelector('[data-shift-note-edit-wrap]');
  const noteReadWrap = root.querySelector('[data-shift-note-read-wrap]');
  const noteReadMeta = root.querySelector('[data-shift-note-read-meta]');
  const noteReadBlocks = root.querySelector('[data-shift-note-read-blocks]');
  const noteApplyBtn = root.querySelector('[data-shift-note-apply]');
  const detailsModal = root.querySelector('[data-shift-details-modal]');
  const detailsTitle = root.querySelector('[data-shift-details-title]');
  const detailsMeta = root.querySelector('[data-shift-details-meta]');
  const detailsLive = root.querySelector('[data-shift-details-live]');
  const detailsOffers = root.querySelector('[data-shift-details-offers]');
  const detailsGain = root.querySelector('[data-shift-details-gain]');
  const detailsOps = root.querySelector('[data-shift-details-ops]');
  const isAdmin = root.getAttribute('data-is-admin') === 'true';
  const viewerUserId = root.getAttribute('data-staff-user-id') || '';
  const onDutyList = root.querySelector('[data-shift-on-duty-list]');

  /** @type {any} */
  let current = null;
  /** @type {any} */
  let lastHandover = null;
  /** @type {Map<number, any>} */
  const shiftById = new Map();
  /** @type {string|null} */
  let editingKey = null;
  let modalMode = 'edit';
  let historyPage = 1;
  let historyTotalPages = 1;
  let historyTotal = 0;

  const noteMeta = {
    rooms: {
      title: 'Rooms briefing',
      label: 'Room notes',
      hint: 'OOO, assignment backlog, housekeeping',
      input: () => roomsInput,
      max: 4000,
    },
    guests: {
      title: 'Guests briefing',
      label: 'Guest notes',
      hint: 'VIP, pending calls, special requests',
      input: () => guestsInput,
      max: 4000,
    },
    offers: {
      title: 'Special offers',
      label: 'Offer / launching notes',
      hint: 'Which offer, room types, until when',
      input: () => offersInput,
      max: 4000,
    },
    gain: {
      title: 'Gain / cash notes',
      label: 'Cash notes',
      hint: 'Float variance, tips, unexplained amounts',
      input: () => gainNotesInput,
      max: 2000,
    },
    closing: {
      title: 'Closing note',
      label: 'Closing handoff',
      hint: 'Final message for the next shift',
      input: () => closingInput,
      max: 2000,
    },
  };

  const money = (n) =>
    `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const phTime = (iso) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return String(iso);
    }
  };

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

  function briefingPayload() {
    return {
      openingNote: openingInput?.value || '',
      closingNote: closingInput?.value || '',
      roomsBriefing: roomsInput?.value || '',
      guestsBriefing: guestsInput?.value || '',
      offersBriefing: offersInput?.value || '',
      gainNotes: gainNotesInput?.value || '',
    };
  }

  function previewText(value) {
    const text = String(value || '').trim();
    if (!text) return 'No notes yet.';
    return text.length > 140 ? `${text.slice(0, 137)}…` : text;
  }

  function syncNotePreviews() {
    Object.keys(noteMeta).forEach((key) => {
      const input = noteMeta[key].input();
      const preview = root.querySelector(`[data-note-preview="${key}"]`);
      if (preview) preview.textContent = previewText(input?.value);
      const card = root.querySelector(`[data-note-card="${key}"]`);
      if (card) card.classList.toggle('has-notes', Boolean(String(input?.value || '').trim()));
    });
  }

  function fillBriefingFields(shift) {
    if (!shift) return;
    if (openingInput) openingInput.value = shift.openingNote || '';
    if (closingInput) closingInput.value = shift.closingNote || '';
    if (roomsInput) roomsInput.value = shift.roomsBriefing || '';
    if (guestsInput) guestsInput.value = shift.guestsBriefing || '';
    if (offersInput) offersInput.value = shift.offersBriefing || '';
    if (gainNotesInput) gainNotesInput.value = shift.gainNotes || '';
    syncNotePreviews();
  }

  function renderGain(gain) {
    const set = (sel, text) => {
      const el = root.querySelector(sel);
      if (el) el.textContent = text;
    };
    set('[data-kpi-collected]', money(gain?.totalCollected));
    set('[data-kpi-cash]', money(gain?.cash));
    set('[data-gain-cash]', money(gain?.cash));
    set('[data-gain-ewallet]', money(gain?.eWallet));
    set('[data-gain-bank]', money(gain?.bankTransfer));
    set('[data-gain-other]', money(gain?.other));
    set('[data-gain-total]', money(gain?.totalCollected));
    set('[data-gain-refunded]', money(gain?.totalRefunded));
    set('[data-gain-count]', String(gain?.paymentCount ?? 0));
  }

  function renderOpsList(container, ops, mode) {
    if (!container || !ops) return;
    if (mode === 'live') {
      container.innerHTML = `
        <li><span>Arrivals</span><strong>${ops.arrivalsToday}</strong></li>
        <li><span>Departures</span><strong>${ops.departuresToday}</strong></li>
        <li><span>Need assign</span><strong>${ops.roomsNeedingAssign}</strong></li>
        <li><span>Offers</span><strong>${ops.activeOffers}</strong></li>`;
      return;
    }
    container.innerHTML = `
      <div><dt>Created</dt><dd>${ops.bookingsCreated}</dd></div>
      <div><dt>Confirmed</dt><dd>${ops.bookingsConfirmed}</dd></div>
      <div><dt>Checked out</dt><dd>${ops.bookingsCheckedOut}</dd></div>
      <div><dt>Cancelled</dt><dd>${ops.bookingsCancelled}</dd></div>
      <div><dt>Offer changes</dt><dd>${ops.offersTouchedInWindow}</dd></div>`;
  }

  function renderOfferTitles(ops) {
    const el = root.querySelector('[data-shift-offer-titles]');
    if (!el) return;
    const titles = ops?.activeOfferTitles || [];
    if (!titles.length) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = titles.join(' · ');
  }

  function initialsFromName(name) {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function renderOnDuty(people, fallbackShift) {
    if (!onDutyList) return;
    const rows = Array.isArray(people) ? people.slice() : [];
    if (!rows.length && fallbackShift?.isOpen) {
      rows.push({
        staffUserId: fallbackShift.staffUserId,
        staffDisplayName: fallbackShift.staffDisplayName,
        startedAtUtc: fallbackShift.startedAtUtc,
      });
    }

    if (!rows.length) {
      onDutyList.innerHTML = '<li class="admin-shift-on-duty-empty">No one on shift</li>';
      return;
    }

    onDutyList.innerHTML = rows
      .map((person) => {
        const name = person.staffDisplayName || 'Staff';
        const isYou = Boolean(
          viewerUserId && person.staffUserId && person.staffUserId === viewerUserId
        );
        const since = `Since ${phTime(person.startedAtUtc)}`;
        return `<li class="admin-shift-on-duty-chip${isYou ? ' is-you' : ''}">
          <span class="admin-shift-on-duty-avatar" aria-hidden="true">${escapeHtml(initialsFromName(name))}</span>
          <span class="admin-shift-on-duty-meta">
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(isYou ? `You · ${since}` : since)}</small>
          </span>
        </li>`;
      })
      .join('');
  }

  function renderCurrent(shift) {
    current = shift || null;
    const statusEl = root.querySelector('[data-kpi-status]');
    const statusMeta = root.querySelector('[data-kpi-status-meta]');
    const onDuty = Boolean(shift?.isOpen);
    root.classList.toggle('is-on-shift', onDuty);

    if (startBtn) startBtn.hidden = onDuty;
    if (saveBtn) saveBtn.hidden = !onDuty;
    if (endBtn) endBtn.hidden = !onDuty;
    if (clockSection) clockSection.hidden = onDuty;
    if (briefingPanel) {
      briefingPanel.hidden = false;
      briefingPanel.classList.toggle('is-idle', !onDuty);
    }
    if (idleFlag) idleFlag.hidden = onDuty;
    root.querySelectorAll('[data-open-note-modal]').forEach((btn) => {
      btn.hidden = !onDuty;
    });

    if (onDuty) {
      if (statusEl) statusEl.textContent = 'On shift';
      if (statusMeta) statusMeta.textContent = `Since ${phTime(shift.startedAtUtc)}`;
      if (ondutyBanner) {
        ondutyBanner.textContent = `On since ${phTime(shift.startedAtUtc)} — edit a card, then Save notes or End shift.`;
      }
      fillBriefingFields(shift);
      renderGain(shift.gain);
      renderOpsList(root.querySelector('[data-shift-window-ops]'), shift.ops, 'window');
    } else {
      if (statusEl) statusEl.textContent = 'Off shift';
      if (statusMeta) statusMeta.textContent = 'No open shift';
      if (clockLede) {
        clockLede.textContent = 'Add opening note, then Start in the toolbar.';
      }
      if (ondutyBanner) {
        ondutyBanner.textContent =
          'Cards are read-only until you start a shift. Use Previous handover notes to read the last desk briefing.';
      }
      if (clockFoot) {
        clockFoot.innerHTML = 'Then press <strong>Start shift</strong> in the top toolbar.';
      }
      if (openingInput) openingInput.value = '';
      if (closingInput) closingInput.value = '';
      if (roomsInput) roomsInput.value = '';
      if (guestsInput) guestsInput.value = '';
      if (offersInput) offersInput.value = '';
      if (gainNotesInput) gainNotesInput.value = '';
      syncNotePreviews();
      renderGain({
        totalCollected: 0,
        cash: 0,
        eWallet: 0,
        bankTransfer: 0,
        other: 0,
        totalRefunded: 0,
        paymentCount: 0,
      });
    }
  }

  function renderHistoryPager(total, page, pageSize) {
    historyTotal = Number(total || 0);
    historyPage = Math.max(1, Number(page || 1));
    const size = Math.max(1, Number(pageSize || 10));
    historyTotalPages = Math.max(1, Math.ceil(historyTotal / size));
    historyPage = Math.min(historyPage, historyTotalPages);
    if (historyPageLabel) {
      historyPageLabel.textContent = `Page ${historyPage} of ${historyTotalPages}`;
    }
    if (historyPrev) historyPrev.disabled = historyPage <= 1;
    if (historyNext) historyNext.disabled = historyPage >= historyTotalPages;
    if (historyCount) {
      if (historyTotal === 0) {
        historyCount.hidden = true;
        historyCount.textContent = '';
      } else {
        const start = (historyPage - 1) * size + 1;
        const end = Math.min(historyTotal, historyPage * size);
        historyCount.hidden = false;
        historyCount.textContent = `Showing ${start}–${end} of ${historyTotal}`;
      }
    }
  }

  function renderHistory(items) {
    if (!historyBody) return;
    historyBody.replaceChildren();
    shiftById.clear();
    if (!items?.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'admin-bookings-empty';
      cell.textContent = 'No shifts recorded yet.';
      row.append(cell);
      historyBody.append(row);
      return;
    }
    items.forEach((item) => {
      shiftById.set(Number(item.id), item);
      const id = Number(item.id);
      const notesBtn = item.isOpen
        ? '<span class="admin-shift-muted">—</span>'
        : `<button type="button" class="admin-shift-btn admin-shift-btn-ghost" data-view-shift-handover="${id}">View notes</button>`;
      const detailsBtn = isAdmin
        ? `<button type="button" class="admin-shift-btn admin-shift-btn-ghost" data-view-shift-details="${id}">Details</button>`
        : '';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(item.staffDisplayName || 'Staff')}</td>
        <td>${escapeHtml(phTime(item.startedAtUtc))}</td>
        <td>${escapeHtml(item.endedAtUtc ? phTime(item.endedAtUtc) : 'Open')}</td>
        <td>${escapeHtml(money(item.gain?.totalCollected))}</td>
        <td><span class="admin-booking-status ${item.isOpen ? 'is-confirmed' : ''}">${item.isOpen ? 'Open' : 'Ended'}</span></td>
        <td><div class="admin-shift-history-actions">${notesBtn}${detailsBtn}</div></td>`;
      historyBody.append(row);
    });
    historyBody.querySelectorAll('[data-view-shift-handover]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-view-shift-handover'));
        const shift = shiftById.get(id);
        if (shift) openHandoverReader(shift);
      });
    });
    historyBody.querySelectorAll('[data-view-shift-details]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-view-shift-details'));
        const shift = shiftById.get(id);
        if (shift) openShiftDetails(shift);
      });
    });
  }

  function renderLastHandover(shift) {
    lastHandover = shift || null;
    if (lastHandoverBtn) lastHandoverBtn.hidden = !lastHandover;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setModalMode(mode) {
    modalMode = mode;
    if (noteEditWrap) noteEditWrap.hidden = mode !== 'edit';
    if (noteReadWrap) noteReadWrap.hidden = mode !== 'read';
    if (noteApplyBtn) noteApplyBtn.hidden = mode !== 'edit';
  }

  function openNoteModal(key) {
    if (!current?.isOpen) return;
    const meta = noteMeta[key];
    if (!meta || !noteModal || !noteModalInput) return;
    editingKey = key;
    setModalMode('edit');
    const input = meta.input();
    if (noteModalTitle) noteModalTitle.textContent = meta.title;
    if (noteModalLabel) noteModalLabel.textContent = meta.label;
    if (noteModalHint) noteModalHint.textContent = meta.hint;
    noteModalInput.maxLength = meta.max;
    noteModalInput.value = input?.value || '';
    noteModal.hidden = false;
    document.body.classList.add('admin-shift-modal-open');
    noteModalInput.focus();
  }

  function openHandoverReader(shift) {
    if (!noteModal || !shift) return;
    editingKey = null;
    setModalMode('read');
    if (noteModalTitle) noteModalTitle.textContent = 'Handover briefing';
    if (noteReadMeta) {
      noteReadMeta.textContent = `${shift.staffDisplayName || 'Staff'} · ${phTime(shift.startedAtUtc)} → ${phTime(shift.endedAtUtc)} · ${money(shift.gain?.totalCollected)} collected`;
    }
    if (noteReadBlocks) {
      const blocks = [
        ['Opening note', shift.openingNote],
        ['Rooms', shift.roomsBriefing],
        ['Guests', shift.guestsBriefing],
        ['Special offers', shift.offersBriefing],
        ['Gain / cash', shift.gainNotes],
        ['Closing note', shift.closingNote],
      ];
      noteReadBlocks.innerHTML = blocks
        .map(
          ([label, value]) => `
        <article>
          <h4>${escapeHtml(label)}</h4>
          <p>${escapeHtml(String(value || '').trim() || '—')}</p>
        </article>`
        )
        .join('');
    }
    noteModal.hidden = false;
    document.body.classList.add('admin-shift-modal-open');
  }

  function openShiftDetails(shift) {
    if (!isAdmin || !detailsModal || !shift) return;
    const gain = shift.gain || {};
    const ops = shift.ops || {};
    if (detailsTitle) {
      detailsTitle.textContent = `Shift details · ${shift.staffDisplayName || 'Staff'}`;
    }
    if (detailsMeta) {
      detailsMeta.textContent = `${phTime(shift.startedAtUtc)} → ${shift.endedAtUtc ? phTime(shift.endedAtUtc) : 'Open'} · ${money(gain.totalCollected)} collected`;
    }
    if (detailsLive) {
      detailsLive.innerHTML = `
        <li><span>Arrivals</span><strong>${ops.arrivalsToday ?? 0}</strong></li>
        <li><span>Departures</span><strong>${ops.departuresToday ?? 0}</strong></li>
        <li><span>Need assign</span><strong>${ops.roomsNeedingAssign ?? 0}</strong></li>
        <li><span>Offers</span><strong>${ops.activeOffers ?? 0}</strong></li>`;
    }
    if (detailsOffers) {
      const titles = ops.activeOfferTitles || [];
      if (titles.length) {
        detailsOffers.hidden = false;
        detailsOffers.textContent = titles.join(' · ');
      } else {
        detailsOffers.hidden = true;
        detailsOffers.textContent = '';
      }
    }
    if (detailsGain) {
      detailsGain.innerHTML = `
        <div><dt>Cash</dt><dd>${escapeHtml(money(gain.cash))}</dd></div>
        <div><dt>E-wallet</dt><dd>${escapeHtml(money(gain.eWallet))}</dd></div>
        <div><dt>Bank</dt><dd>${escapeHtml(money(gain.bankTransfer))}</dd></div>
        <div><dt>Other</dt><dd>${escapeHtml(money(gain.other))}</dd></div>
        <div class="is-total"><dt>Total</dt><dd>${escapeHtml(money(gain.totalCollected))}</dd></div>
        <div><dt>Refunded</dt><dd>${escapeHtml(money(gain.totalRefunded))}</dd></div>
        <div><dt>Payments</dt><dd>${escapeHtml(String(gain.paymentCount ?? 0))}</dd></div>`;
    }
    if (detailsOps) {
      detailsOps.innerHTML = `
        <div><dt>Created</dt><dd>${ops.bookingsCreated ?? 0}</dd></div>
        <div><dt>Confirmed</dt><dd>${ops.bookingsConfirmed ?? 0}</dd></div>
        <div><dt>Checked out</dt><dd>${ops.bookingsCheckedOut ?? 0}</dd></div>
        <div><dt>Cancelled</dt><dd>${ops.bookingsCancelled ?? 0}</dd></div>
        <div><dt>Offer changes</dt><dd>${ops.offersTouchedInWindow ?? 0}</dd></div>`;
    }
    detailsModal.hidden = false;
    document.body.classList.add('admin-shift-modal-open');
  }

  function closeShiftDetails() {
    if (!detailsModal) return;
    detailsModal.hidden = true;
    if (!noteModal || noteModal.hidden) {
      document.body.classList.remove('admin-shift-modal-open');
    }
  }

  function closeNoteModal() {
    if (!noteModal) return;
    noteModal.hidden = true;
    editingKey = null;
    if (!detailsModal || detailsModal.hidden) {
      document.body.classList.remove('admin-shift-modal-open');
    }
  }

  function applyNoteModal() {
    if (modalMode !== 'edit' || !editingKey) return;
    const meta = noteMeta[editingKey];
    const input = meta?.input();
    if (input && noteModalInput) {
      input.value = noteModalInput.value;
      syncNotePreviews();
    }
    closeNoteModal();
  }

  async function loadPage() {
    showMessage('');
    const size = Number(historyPageSize?.value || 10);
    try {
      const page = await apiFetch(
        `/api/admin/shifts?page=${encodeURIComponent(String(historyPage))}&pageSize=${encodeURIComponent(String(size))}`
      );
      renderCurrent(page.current);
      renderOnDuty(page.onDuty, page.current);
      renderLastHandover(page.lastHandover);
      renderOpsList(root.querySelector('[data-shift-live-ops]'), page.liveHotel, 'live');
      renderOfferTitles(page.liveHotel);
      renderHistory(page.recent);
      renderHistoryPager(page.recentTotal, page.recentPage, page.recentPageSize);
      if (historyPageSize && page.recentPageSize) {
        historyPageSize.value = String(page.recentPageSize);
      }
      if (page.current?.isOpen) renderGain(page.current.gain);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Unable to load shifts.', true);
      if (historyBody) {
        historyBody.innerHTML =
          '<tr><td colspan="6" class="admin-bookings-empty">Unable to load shifts.</td></tr>';
      }
    }
  }

  startBtn?.addEventListener('click', async () => {
    startBtn.disabled = true;
    try {
      const shift = await apiFetch('/api/admin/shifts/start', {
        method: 'POST',
        body: JSON.stringify({ openingNote: openingInput?.value || '' }),
      });
      renderCurrent(shift);
      showMessage('Shift started.');
      if (typeof window.showMoriNotice === 'function') {
        window.showMoriNotice('Shift started.', 'success');
      }
      await loadPage();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Unable to start shift.', true);
    } finally {
      startBtn.disabled = false;
    }
  });

  saveBtn?.addEventListener('click', async () => {
    if (!current?.id) return;
    saveBtn.disabled = true;
    try {
      const shift = await apiFetch(`/api/admin/shifts/${current.id}/briefing`, {
        method: 'PUT',
        body: JSON.stringify(briefingPayload()),
      });
      renderCurrent(shift);
      showMessage('Notes saved.');
      if (typeof window.showMoriNotice === 'function') {
        window.showMoriNotice('Shift notes saved.', 'success');
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Unable to save notes.', true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  endBtn?.addEventListener('click', async () => {
    if (!current?.id) return;
    const ok = window.confirm(
      'End this shift?\n\nHotel gain for the window will be frozen on the shift record.'
    );
    if (!ok) return;
    endBtn.disabled = true;
    try {
      const shift = await apiFetch(`/api/admin/shifts/${current.id}/end`, {
        method: 'POST',
        body: JSON.stringify(briefingPayload()),
      });
      renderCurrent(null);
      showMessage(`Shift ended. Collected ${money(shift.gain?.totalCollected)}.`);
      if (typeof window.showMoriNotice === 'function') {
        window.showMoriNotice('Shift ended. Totals frozen.', 'success');
      }
      await loadPage();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Unable to end shift.', true);
    } finally {
      endBtn.disabled = false;
    }
  });

  refreshBtn?.addEventListener('click', () => {
    void loadPage();
  });

  historyPrev?.addEventListener('click', () => {
    if (historyPage <= 1) return;
    historyPage -= 1;
    void loadPage();
  });

  historyNext?.addEventListener('click', () => {
    if (historyPage >= historyTotalPages) return;
    historyPage += 1;
    void loadPage();
  });

  historyPageSize?.addEventListener('change', () => {
    historyPage = 1;
    void loadPage();
  });

  lastHandoverBtn?.addEventListener('click', () => {
    if (lastHandover) openHandoverReader(lastHandover);
  });

  root.querySelectorAll('[data-open-note-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openNoteModal(btn.getAttribute('data-open-note-modal') || '');
    });
  });

  root.querySelectorAll('[data-shift-note-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeNoteModal());
  });

  root.querySelector('[data-shift-note-apply]')?.addEventListener('click', () => {
    applyNoteModal();
  });

  root.querySelectorAll('[data-shift-details-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeShiftDetails());
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (detailsModal && !detailsModal.hidden) {
      closeShiftDetails();
      return;
    }
    if (noteModal && !noteModal.hidden) {
      closeNoteModal();
    }
  });

  void loadPage();
})();
