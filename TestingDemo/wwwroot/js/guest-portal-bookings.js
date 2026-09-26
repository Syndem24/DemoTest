(() => {
  const root = document.querySelector('[data-guest-bookings]');
  if (!root) return;

  const token =
    document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';

  const activeEl = root.querySelector('[data-guest-active-bookings]');
  const historyEl = root.querySelector('[data-guest-booking-history]');
  const messageEl = root.querySelector('[data-guest-booking-message]');

  const editDrawer = root.querySelector('[data-guest-booking-edit]');
  const editForm = root.querySelector('[data-guest-booking-edit-form]');
  const editIdInput = root.querySelector('[data-guest-booking-edit-id]');
  const editNameInput = root.querySelector('[data-guest-booking-edit-name]');
  const editEmailInput = root.querySelector('[data-guest-booking-edit-email]');
  const editPhoneInput = root.querySelector('[data-guest-booking-edit-phone]');
  const editCheckInInput = root.querySelector('[data-guest-booking-edit-checkin]');
  const editCheckOutInput = root.querySelector('[data-guest-booking-edit-checkout]');
  const editRoomsContainer = root.querySelector('[data-guest-booking-edit-rooms]');
  const editSaveBtn = root.querySelector('[data-guest-booking-edit-save]');
  const editErrorEl = root.querySelector('[data-guest-booking-edit-error]');
  const addRoomBtn = root.querySelector('[data-guest-booking-edit-add-room]');
  const partySummaryEl = root.querySelector('[data-guest-booking-edit-party]');
  const roomsLockedEl = root.querySelector('[data-guest-booking-edit-rooms-locked]');

  let roomTypeCatalog = null;
  let editRoomRows = [];
  let editRoomsLocked = false;

  let allBookings = [];
  let editingBooking = null;
  let lastFocused = null;

  function t(key, params) {
    const fn = window.MoriI18n?.t;
    return typeof fn === 'function' ? fn(key, params) : key;
  }

  const money = (amount) => {
    try {
      return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
      }).format(amount ?? 0);
    } catch {
      return `₱${Number(amount ?? 0).toFixed(2)}`;
    }
  };

  const phDate = (iso) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        dateStyle: 'medium',
      }).format(new Date(iso));
    } catch {
      return String(iso);
    }
  };

  const toManilaDateInput = (iso) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(iso));
    } catch {
      return '';
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
    messageEl.classList.toggle('is-ok', !isError && Boolean(text));
  }

  // Centered notice pop-up (same pattern as the admin alertdialog) used for
  // action feedback — save booking, submit review, etc.
  const popupEl = root.querySelector('[data-guest-booking-popup]');
  const popupTitleEl = root.querySelector('[data-guest-booking-popup-title]');
  const popupTextEl = root.querySelector('[data-guest-booking-popup-text]');
  const popupOkBtn = root.querySelector('[data-guest-booking-popup-ok]');
  // Escape the page stacking context (the frosted sticky nav otherwise paints
  // over the toast) — mori-notice does the same by living on document.body.
  if (popupEl) document.body.appendChild(popupEl);
  let popupReturnFocus = null;
  let popupTimer = null;

  function showGuestNotice(text, { title, isError = false } = {}) {
    if (!popupEl) {
      showMessage(text, isError);
      return;
    }
    if (popupTitleEl) popupTitleEl.textContent = title || t('bookingsPortal.notice');
    if (popupTextEl) popupTextEl.textContent = text || '';
    popupEl.classList.toggle('is-error', Boolean(isError));
    popupEl.hidden = false;
    if (popupTimer) clearTimeout(popupTimer);
    popupTimer = setTimeout(hideGuestNotice, 5000);
  }

  function hideGuestNotice() {
    if (!popupEl || popupEl.hidden) return;
    if (popupTimer) {
      clearTimeout(popupTimer);
      popupTimer = null;
    }
    popupEl.hidden = true;
  }

  popupOkBtn?.addEventListener('click', hideGuestNotice);
  popupEl?.addEventListener('click', (event) => {
    if (event.target === popupEl) hideGuestNotice();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideGuestNotice();
  });

  // Full-screen busy overlay (same component as the admin export loading screen)
  // shown while a booking edit or review submit is in flight.
  const busyEl = root.querySelector('[data-guest-booking-loading]');
  const busyTitleEl = root.querySelector('[data-guest-booking-loading-title]');
  const busyDetailEl = root.querySelector('[data-guest-booking-loading-detail]');
  if (busyEl) document.body.appendChild(busyEl);

  function setBookingBusy(visible, { title, detail } = {}) {
    if (!busyEl) return;
    if (busyTitleEl && title) busyTitleEl.textContent = title;
    if (busyDetailEl && detail) busyDetailEl.textContent = detail;
    busyEl.hidden = !visible;
    document.body.setAttribute('aria-busy', visible ? 'true' : 'false');
    if (visible) busyEl.querySelector('.guest-portal-booking-loading-card')?.focus?.();
  }

  // Shared with guest-reviews.js (same page) so review feedback uses the pop-up too.
  window.GuestNotice = { show: showGuestNotice, busy: setBookingBusy };

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
      const err = new Error(message);
      try {
        const body = await res.json();
        if (body.errors) {
          const firstErrors = Object.values(body.errors)
            .flat()
            .filter(Boolean);
          if (firstErrors.length > 0) {
            message = firstErrors.join('\n');
          }
        }
        err.message = body.message || body.title || message;
        err.availability = Array.isArray(body.availability) ? body.availability : undefined;
      } catch {
        /* ignore */
      }
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function isActiveBooking(booking) {
    return (
      !booking.isArchived &&
      (booking.status === 'Pending' || booking.status === 'Confirmed')
    );
  }

  function isEditableBooking(booking) {
    if (booking.isArchived) return false;
    if (booking.status !== 'Pending' && booking.status !== 'Confirmed') return false;
    const paid = Number(booking.paidTotal ?? 0);
    const total = Number(booking.totalAmount ?? 0);
    const balance = Math.max(0, total - paid);
    return balance > 0.009;
  }

  function statusBadge(status) {
    return `<span class="guest-portal-booking-status guest-portal-booking-status--${escapeHtml(
      status.toLowerCase()
    )}">${escapeHtml(t(`bookingsPortal.status.${status}`) || status)}</span>`;
  }

  function renderPayments(payments) {
    if (!payments?.length) {
      return `<p class="guest-portal-booking-empty-list">${t('bookingsPortal.noPayments')}</p>`;
    }
    return `<ul class="guest-portal-booking-records">
      ${payments
        .map(
          (p) =>
            `<li>
              <span>${escapeHtml(p.receiptNumber || t('bookingsPortal.payment'))} · ${escapeHtml(
                p.eventType
              )} · ${escapeHtml(p.method)}</span>
              <span class="guest-portal-booking-amount ${
                p.status !== 'Posted' ? 'is-voided' : ''
              }">${money(p.amount)}${p.status !== 'Posted' ? ` (${t(
                'bookingsPortal.voided'
              )})` : ''}</span>
            </li>`
        )
        .join('')}
    </ul>`;
  }

  function renderCharges(charges) {
    if (!charges?.length) {
      return `<p class="guest-portal-booking-empty-list">${t('bookingsPortal.noCharges')}</p>`;
    }
    return `<ul class="guest-portal-booking-records">
      ${charges
        .map(
          (c) =>
            `<li>
              <span>${escapeHtml(c.label || c.chargeType)}</span>
              <span class="guest-portal-booking-amount">${money(c.amount)}</span>
            </li>`
        )
        .join('')}
    </ul>`;
  }

  function renderItems(items) {
    if (!items?.length) return '';
    return `<ul class="guest-portal-booking-items-list">
      ${items
        .map(
          (item) =>
            `<li>
              <span>${escapeHtml(item.quantity)}× ${escapeHtml(item.roomTypeName)}</span>
              <span>${money(item.pricePerNight)} ${t('bookingsPortal.perNight')}</span>
            </li>`
        )
        .join('')}
    </ul>`;
  }

  const chevron =
    '<svg class="guest-portal-booking-chevron" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7.4 8.6 12 13.2l4.6-4.6 1.4 1.4-6 6-6-6z"/></svg>';

  function sectionDropdown(title, bodyHtml, open) {
    return `<details class="guest-portal-booking-section"${open ? ' open' : ''}>
      <summary><span>${escapeHtml(title)}</span>${chevron}</summary>
      <div class="guest-portal-booking-section-body">${bodyHtml}</div>
    </details>`;
  }

  function renderBookingCard(booking) {
    const paid = Number(booking.paidTotal ?? 0);
    const total = Number(booking.totalAmount ?? 0);
    const balance = Math.max(0, total - paid);
    const editable = isEditableBooking(booking);

    let actions = '';
    if (editable) {
      actions = `<button type="button" class="guest-btn guest-btn-primary guest-portal-booking-edit-btn" data-edit-id="${Number(
        booking.id
      )}">${t('bookingsPortal.edit')}</button>`;
    } else if (isActiveBooking(booking)) {
      actions = `<span class="guest-portal-booking-locked">${t(
        'bookingsPortal.contactReceptionist'
      )}</span>`;
    }

    const fullyPaid = balance <= 0.009;
    const paymentSummary = fullyPaid
      ? `<span class="guest-portal-booking-paid-label">${t('bookingsPortal.fullyPaid')}</span>`
      : '';

    return `<article class="guest-portal-booking-card" data-booking-id="${Number(
      booking.id
    )}">
      <header class="guest-portal-booking-card-head">
        <div>
          <p class="guest-portal-booking-reference">
            <span>${escapeHtml(t('bookingsPortal.reference'))}</span>: <strong>${escapeHtml(
              booking.reference
            )}</strong>
          </p>
          <p class="guest-portal-booking-dates">${phDate(booking.checkInAtUtc)} — ${phDate(
      booking.checkoutTimeUtc
    )}</p>
        </div>
        ${statusBadge(booking.status)}
      </header>

      <div class="guest-portal-booking-card-body">
        ${sectionDropdown(t('bookingsPortal.rooms'), renderItems(booking.items), true)}
        ${sectionDropdown(t('bookingsPortal.charges'), renderCharges(booking.charges), false)}
        ${sectionDropdown(
          t('bookingsPortal.payments'),
          renderPayments(booking.guestPayments),
          false
        )}

        <div class="guest-portal-booking-totals">
          <p><span>${escapeHtml(t('bookingsPortal.total'))}</span>: <strong>${money(
            total
          )}</strong></p>
          <p><span>${escapeHtml(t('bookingsPortal.paid'))}</span>: ${money(paid)} ${paymentSummary}</p>
          <p><span>${escapeHtml(t('bookingsPortal.balance'))}</span>: <strong>${money(
            balance
          )}</strong></p>
        </div>

        ${actions ? `<div class="guest-portal-booking-actions">${actions}</div>` : ''}
      </div>
    </article>`;
  }

  function roomsSummary(items) {
    if (!items?.length) return '—';
    return items.map((item) => `${item.quantity}× ${item.roomTypeName}`).join(' · ');
  }

  function renderHistoryTable(container, items) {
    if (!items?.length) {
      container.innerHTML = `<p class="guest-portal-bookings-empty">${t(
        'bookingsPortal.noHistory'
      )}</p>`;
      return;
    }
    const rows = items
      .map((booking) => {
        const paid = Number(booking.paidTotal ?? 0);
        const total = Number(booking.totalAmount ?? 0);
        const balance = Math.max(0, total - paid);
        return `<tr data-booking-id="${Number(booking.id)}">
          <td data-label="${escapeHtml(t('bookingsPortal.reference'))}"><span class="guest-portal-booking-ref">${escapeHtml(
            booking.reference
          )}</span></td>
          <td data-label="${escapeHtml(t('bookingsPortal.dates'))}">${phDate(
            booking.checkInAtUtc
          )} — ${phDate(booking.checkoutTimeUtc)}</td>
          <td data-label="${escapeHtml(t('bookingsPortal.statusCol'))}">${statusBadge(
            booking.status
          )}</td>
          <td data-label="${escapeHtml(t('bookingsPortal.rooms'))}">${escapeHtml(
            roomsSummary(booking.items)
          )}</td>
          <td data-label="${escapeHtml(t('bookingsPortal.total'))}" class="guest-portal-booking-num">${money(
            total
          )}</td>
          <td data-label="${escapeHtml(t('bookingsPortal.paid'))}" class="guest-portal-booking-num">${money(
            paid
          )}</td>
          <td data-label="${escapeHtml(t('bookingsPortal.balance'))}" class="guest-portal-booking-num"><strong>${money(
            balance
          )}</strong></td>
        </tr>`;
      })
      .join('');

    container.innerHTML = `<div class="guest-portal-booking-table-wrap">
      <table class="guest-portal-booking-table">
        <thead>
          <tr>
            <th scope="col">${escapeHtml(t('bookingsPortal.reference'))}</th>
            <th scope="col">${escapeHtml(t('bookingsPortal.dates'))}</th>
            <th scope="col">${escapeHtml(t('bookingsPortal.statusCol'))}</th>
            <th scope="col">${escapeHtml(t('bookingsPortal.rooms'))}</th>
            <th scope="col" class="guest-portal-booking-num">${escapeHtml(
              t('bookingsPortal.total')
            )}</th>
            <th scope="col" class="guest-portal-booking-num">${escapeHtml(
              t('bookingsPortal.paid')
            )}</th>
            <th scope="col" class="guest-portal-booking-num">${escapeHtml(
              t('bookingsPortal.balance')
            )}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function renderActiveList(container, items) {
    if (!container) return;
    if (!items?.length) {
      container.innerHTML = `<p class="guest-portal-bookings-empty">${t(
        'bookingsPortal.noActive'
      )}</p>`;
      return;
    }
    container.innerHTML = items.map(renderBookingCard).join('');
    container.querySelectorAll('[data-edit-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-edit-id'));
        const booking = allBookings.find((b) => b.id === id);
        if (booking) openEdit(booking);
      });
    });
  }

  function setBlockCount(container, count) {
    const badge = container
      ?.closest('details')
      ?.querySelector('[data-block-count]');
    if (!badge) return;
    badge.textContent = String(count ?? 0);
    badge.hidden = false;
  }

  function renderLists() {
    const active = allBookings.filter(isActiveBooking);
    const history = allBookings.filter((b) => !isActiveBooking(b));
    renderActiveList(activeEl, active);
    renderHistoryTable(historyEl, history);
    setBlockCount(activeEl, active.length);
    setBlockCount(historyEl, history.length);
  }

  async function loadBookings() {
    showMessage('');
    try {
      const bookings = await apiFetch('/api/guest/bookings');
      allBookings = Array.isArray(bookings) ? bookings : [];
      renderLists();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('bookingsPortal.unableLoad');
      showMessage(message, true);
      if (activeEl) activeEl.innerHTML = '';
      if (historyEl) historyEl.innerHTML = '';
    }
  }

  // Stay times follow the booking convention: check-in 14:00, check-out 12:00 Manila.
  function dateInputToPayload(value, manilaTime) {
    if (!value) return '';
    return `${value}T${manilaTime}:00`;
  }

  function showEditError(error) {
    if (!editErrorEl) return;
    const message = error instanceof Error ? error.message : t('bookingsPortal.unableSave');
    const availability = error?.availability;
    const conflictLines = (availability || [])
      .filter((slot) => slot.remaining <= 0 || slot.exceedsAvailableInventory)
      .map(
        (slot) =>
          `${slot.roomTypeName}: ${t('bookingsPortal.onlyLeft', {
            n: Math.max(0, Number(slot.remaining ?? 0)),
          })}`
      );
    const text = [message, ...conflictLines].join(' · ');
    editErrorEl.textContent = text;
    editErrorEl.hidden = false;
    showGuestNotice(text, { title: t('bookingsPortal.errorTitle'), isError: true });
  }

  function clearEditError() {
    if (!editErrorEl) return;
    editErrorEl.hidden = true;
    editErrorEl.textContent = '';
  }

  function openEdit(booking) {
    if (!editDrawer || !editForm) return;
    editingBooking = booking;
    lastFocused = document.activeElement;
    editForm.reset();
    clearEditError();

    if (editIdInput) editIdInput.value = String(booking.id);
    if (editNameInput) editNameInput.value = booking.guestName || '';
    if (editEmailInput) editEmailInput.value = booking.guestEmail || '';
    if (editPhoneInput) editPhoneInput.value = booking.guestPhone || '';
    if (editCheckInInput) editCheckInInput.value = toManilaDateInput(booking.checkInAtUtc);
    if (editCheckOutInput) editCheckOutInput.value = toManilaDateInput(booking.checkoutTimeUtc);

    // Expand booked items into one row per physical room, paired with the saved
    // per-room head-count cards (same shape as the accommodations wizard).
    editRoomRows = [];
    (booking.items || [])
      .filter((item) => item.roomTypeId > 0)
      .forEach((item) => {
        for (let i = 0; i < Number(item.quantity || 1); i += 1) {
          editRoomRows.push({
            roomTypeId: Number(item.roomTypeId),
            roomTypeName: item.roomTypeName || '',
          });
        }
      });
    const savedParty = Array.isArray(booking.guestRooms) ? booking.guestRooms : [];
    editRoomRows = editRoomRows.map((row, index) => {
      const party = savedParty[index] || {};
      return {
        ...row,
        adults: Math.min(3, Math.max(0, Number(party.adults ?? party.Adults ?? 2))),
        children: Math.min(3, Math.max(0, Number(party.children ?? party.Children ?? 0))),
      };
    });
    if (editRoomRows.length === 0) {
      editRoomRows = [{ roomTypeId: 0, roomTypeName: '', adults: 2, children: 0 }];
    }
    editRoomRows.forEach((row) => clampRoomRow(row));

    // Door numbers already assigned — room types/quantities are frozen server-side.
    editRoomsLocked = (booking.items || []).some(
      (item) => Array.isArray(item.assignedRooms) && item.assignedRooms.length > 0
    );

    renderRoomRows();
    void ensureRoomTypes().then(() => renderRoomRows());

    editDrawer.hidden = false;
    document.body.classList.add('guest-portal-booking-edit-open');
    editNameInput?.focus();
  }

  async function ensureRoomTypes() {
    if (roomTypeCatalog) return roomTypeCatalog;
    try {
      const types = await apiFetch('/api/guest/room-types');
      roomTypeCatalog = Array.isArray(types) ? types : [];
    } catch {
      roomTypeCatalog = [];
    }
    return roomTypeCatalog;
  }

  function clampRoomRow(row) {
    row.adults = Math.min(3, Math.max(0, Number(row.adults) || 0));
    row.children = Math.min(3, Math.max(0, Number(row.children) || 0));
    if (row.adults + row.children === 0) row.adults = 1;
    if (row.adults + row.children > 3) row.children = Math.max(0, 3 - row.adults);
    if (row.adults + row.children === 0) row.adults = 1;
  }

  function roomTypeOptionsHtml(selectedId, fallbackName) {
    const options = (roomTypeCatalog || [])
      .map(
        (type) =>
          `<option value="${Number(type.roomTypeId)}"${
            Number(type.roomTypeId) === selectedId ? ' selected' : ''
          }>${escapeHtml(type.name)} · ${money(type.pricePerNight)}${t(
            'bookingsPortal.perNight'
          )}</option>`
      )
      .join('');
    const missing =
      selectedId > 0 && !(roomTypeCatalog || []).some((type) => Number(type.roomTypeId) === selectedId)
        ? `<option value="${selectedId}" selected>${escapeHtml(fallbackName || `#${selectedId}`)}</option>`
        : '';
    return missing + options;
  }

  function renderRoomRows() {
    if (!editRoomsContainer) return;

    editRoomsContainer.innerHTML = editRoomRows
      .map((row, index) => {
        const guestTotal = row.adults + row.children;
        const extraFee = guestTotal > 2;
        return `<div class="guest-portal-booking-edit-room" data-room-row="${index}">
          <div class="guest-portal-booking-edit-room-head">
            <span class="guest-portal-booking-edit-room-title">${escapeHtml(
              t('bookingsPortal.roomN', { n: index + 1 })
            )}</span>
            ${
              editRoomRows.length > 1
                ? `<button type="button" class="guest-portal-booking-edit-room-remove" data-remove-room="${index}" aria-label="${escapeHtml(
                    t('bookingsPortal.removeRoom')
                  )}">×</button>`
                : ''
            }
          </div>
          <label class="guest-portal-booking-edit-room-field">
            <span>${escapeHtml(t('bookingsPortal.rooms'))}</span>
            <select data-room-type>
              ${roomTypeOptionsHtml(row.roomTypeId, row.roomTypeName)}
            </select>
          </label>
          <div class="guest-portal-booking-edit-room-party">
            <label class="guest-portal-booking-edit-room-field">
              <span>${escapeHtml(t('bookingsPortal.adults'))}</span>
              <select data-room-adults>
                ${[0, 1, 2, 3]
                  .map(
                    (n) =>
                      `<option value="${n}"${n === row.adults ? ' selected' : ''}>${n}</option>`
                  )
                  .join('')}
              </select>
            </label>
            <label class="guest-portal-booking-edit-room-field">
              <span>${escapeHtml(t('bookingsPortal.children'))}</span>
              <select data-room-children>
                ${[0, 1, 2, 3]
                  .map(
                    (n) =>
                      `<option value="${n}"${n === row.children ? ' selected' : ''}>${n}</option>`
                  )
                  .join('')}
              </select>
            </label>
          </div>
          ${extraFee ? `<p class="guest-portal-booking-edit-room-fee">${escapeHtml(t('bookingsPortal.extraGuestFee'))}</p>` : ''}
        </div>`;
      })
      .join('');

    editRoomsContainer.querySelectorAll('[data-room-row]').forEach((rowEl) => {
      const index = Number(rowEl.getAttribute('data-room-row'));
      rowEl.querySelector('[data-room-type]')?.addEventListener('change', (e) => {
        const value = Number(e.target.value);
        editRoomRows[index].roomTypeId = value;
        const type = (roomTypeCatalog || []).find((t0) => Number(t0.roomTypeId) === value);
        editRoomRows[index].roomTypeName = type?.name || editRoomRows[index].roomTypeName;
      });
      rowEl.querySelector('[data-room-adults]')?.addEventListener('change', (e) => {
        editRoomRows[index].adults = Number(e.target.value);
        clampRoomRow(editRoomRows[index]);
        renderRoomRows();
      });
      rowEl.querySelector('[data-room-children]')?.addEventListener('change', (e) => {
        editRoomRows[index].children = Number(e.target.value);
        clampRoomRow(editRoomRows[index]);
        renderRoomRows();
      });
      rowEl.querySelector('[data-remove-room]')?.addEventListener('click', () => {
        editRoomRows.splice(index, 1);
        renderRoomRows();
      });
    });

    if (roomsLockedEl) roomsLockedEl.hidden = !editRoomsLocked;
    if (partySummaryEl) {
      const adults = editRoomRows.reduce((sum, r) => sum + r.adults, 0);
      const children = editRoomRows.reduce((sum, r) => sum + r.children, 0);
      partySummaryEl.textContent = t('bookingsPortal.partySummary', {
        rooms: editRoomRows.length,
        adults,
        children,
      });
    }
  }

  function closeEdit() {
    if (!editDrawer) return;
    editDrawer.hidden = true;
    editingBooking = null;
    document.body.classList.remove('guest-portal-booking-edit-open');
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus();
    }
    lastFocused = null;
  }

  function collectEditPayload() {
    const byType = new Map();
    editRoomRows.forEach((row) => {
      if (row.roomTypeId > 0) {
        byType.set(row.roomTypeId, (byType.get(row.roomTypeId) || 0) + 1);
      }
    });
    const items = [...byType.entries()].map(([roomTypeId, quantity]) => ({
      roomTypeId,
      quantity,
    }));

    const guestRooms = editRoomRows.map((row) => ({
      adults: row.adults,
      children: row.children,
      extraPerson: row.adults + row.children > 2,
    }));

    return {
      guestName: editNameInput?.value?.trim() || '',
      guestEmail: editEmailInput?.value?.trim() || '',
      guestPhone: editPhoneInput?.value?.trim() || '',
      checkInAtUtc: dateInputToPayload(editCheckInInput?.value, '14:00'),
      checkoutTimeUtc: dateInputToPayload(editCheckOutInput?.value, '12:00'),
      adultCount: guestRooms.reduce((sum, r) => sum + r.adults, 0),
      childCount: guestRooms.reduce((sum, r) => sum + r.children, 0),
      guestRooms,
      items,
    };
  }

  addRoomBtn?.addEventListener('click', () => {
    if (editRoomRows.length >= 20) return;
    const fallbackType = roomTypeCatalog?.[0];
    editRoomRows.push({
      roomTypeId: Number(fallbackType?.roomTypeId ?? editingBooking?.items?.[0]?.roomTypeId ?? 0),
      roomTypeName: fallbackType?.name || '',
      adults: 2,
      children: 0,
    });
    renderRoomRows();
  });

  editForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = Number(editIdInput?.value || 0);
    if (!id) return;

    if (editSaveBtn) editSaveBtn.disabled = true;
    showMessage('');
    clearEditError();
    setBookingBusy(true, {
      title: t('bookingsPortal.savingTitle'),
      detail: t('bookingsPortal.savingDetail'),
    });

    try {
      const payload = collectEditPayload();
      await apiFetch(`/api/guest/bookings/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      closeEdit();
      await loadBookings();
      showGuestNotice(t('bookingsPortal.saved'), { title: t('bookingsPortal.savedTitle') });
    } catch (error) {
      showEditError(error);
    } finally {
      setBookingBusy(false);
      if (editSaveBtn) editSaveBtn.disabled = false;
    }
  });

  root.querySelectorAll('[data-guest-booking-edit-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeEdit());
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && editDrawer && !editDrawer.hidden) closeEdit();
  });

  document.addEventListener('mori:langchange', () => {
    if (allBookings.length > 0) renderLists();
  });

  void loadBookings();
})();
