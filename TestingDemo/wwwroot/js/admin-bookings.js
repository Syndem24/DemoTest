(() => {
  const root = document.querySelector('[data-admin-notification]');
  if (!root) return;

  const token = document.querySelector(
    '#adminAntiForgery input[name="__RequestVerificationToken"]'
  )?.value || '';
  const bell = root.querySelector('[data-notification-toggle]');
  const badge = root.querySelector('[data-notification-badge]');
  const panel = root.querySelector('[data-notification-panel]');
  const notificationItems = root.querySelector('[data-notification-items]');
  const soundButton = root.querySelector('[data-notification-sound]');
  const clearButton = root.querySelector('[data-notification-clear]');
  const bookingsRoot = document.querySelector('[data-admin-bookings]');
  const bookingList = bookingsRoot?.querySelector('[data-bookings-list]');
  const bookingMessage = bookingsRoot?.querySelector('[data-bookings-message]');
  const pageLabel = bookingsRoot?.querySelector('[data-bookings-page]');
  const prevButton = bookingsRoot?.querySelector('[data-bookings-prev]');
  const nextButton = bookingsRoot?.querySelector('[data-bookings-next]');
  const searchInput = bookingsRoot?.querySelector('[data-booking-search]');
  const tablePanel = bookingsRoot?.querySelector('[data-booking-table-panel]');
  const calendarPanel = bookingsRoot?.querySelector('[data-booking-calendar-panel]');
  const calendarElement = bookingsRoot?.querySelector('[data-reservation-calendar]');
  const calendarFallback = bookingsRoot?.querySelector('[data-calendar-fallback]');
  const detailModal = document.querySelector('[data-booking-modal]');
  const detailBody = detailModal?.querySelector('[data-booking-detail]');
  const detailActions = detailModal?.querySelector('[data-booking-detail-actions]');

  let filter = '';
  let search = '';
  let history = false;
  let page = 1;
  let totalPages = 1;
  let reservationCalendar = null;
  let selectedBooking = null;
  let searchTimer = null;
  let selectedFromUrlHandled = false;
  let pollTimer = null;
  let reconnectTimer = null;
  let audioContext = null;
  let audioUnlocked = false;
  let soundEnabled = localStorage.getItem('moriBookingSound') !== 'off';

  function setSoundLabel() {
    if (!soundButton) return;
    soundButton.textContent = soundEnabled ? 'Sound on' : 'Sound off';
    soundButton.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
  }

  function unlockAudio() {
    if (audioUnlocked || !soundEnabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioContext ||= new AudioContext();
    audioContext.resume().then(() => {
      audioUnlocked = audioContext.state === 'running';
    }).catch(() => {});
  }

  function playChime() {
    if (!soundEnabled || !audioUnlocked || !audioContext) return;
    const now = audioContext.currentTime;
    [660, 880].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.13, now + index * 0.09 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.09 + 0.22);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now + index * 0.09);
      oscillator.stop(now + index * 0.09 + 0.24);
    });
  }

  document.addEventListener('pointerdown', unlockAudio, { once: true });
  document.addEventListener('keydown', unlockAudio, { once: true });
  setSoundLabel();

  soundButton?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('moriBookingSound', soundEnabled ? 'on' : 'off');
    setSoundLabel();
    if (soundEnabled) unlockAudio();
  });

  clearButton?.addEventListener('click', async () => {
    try {
      await apiFetch('/api/admin/bookings/notifications/read-all', { method: 'POST' });
      await refreshNotifications();
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  });

  bell?.addEventListener('click', () => {
    const open = panel?.hidden ?? true;
    if (panel) panel.hidden = !open;
    bell.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.addEventListener('click', (event) => {
    if (!panel || panel.hidden || root.contains(event.target)) return;
    panel.hidden = true;
    bell?.setAttribute('aria-expanded', 'false');
  });

  async function apiFetch(url, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {}),
    };
    if (options.method && options.method !== 'GET') {
      headers.RequestVerificationToken = token;
    }
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const validationMessage = payload.errors
        ? Object.values(payload.errors).flat().join(' ')
        : '';
      throw new Error(payload.message || validationMessage || `Request failed (${response.status}).`);
    }
    return payload;
  }

  function displayEnum(value) {
    if (value === 'CheckedOut') return 'Checked out';
    if (typeof value === 'string') return value;
    return String(value ?? '');
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function money(value) {
    return `₱${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function setBadge(unread) {
    if (!badge) return;
    const count = Math.max(0, Number(unread || 0));
    badge.hidden = count === 0;
    badge.textContent = count > 99 ? '99+' : String(count);
    bell?.setAttribute(
      'aria-label',
      count ? `Open ${count} unread booking notifications` : 'Open booking notifications'
    );
  }

  function notificationNode(item) {
    const itemContainer = document.createElement('div');
    itemContainer.className = `admin-notification-item${item.isRead ? '' : ' is-unread'}`;

    const contentBtn = document.createElement('button');
    contentBtn.type = 'button';
    contentBtn.className = 'admin-notification-content';

    const title = document.createElement('strong');
    title.textContent = `${item.reference} · ${item.guestName}`;
    const meta = document.createElement('span');
    meta.textContent = `${displayEnum(item.kind)} · ${formatDate(item.checkIn)}`;
    const time = document.createElement('small');
    time.textContent = formatDateTime(item.createdAtUtc);
    contentBtn.append(title, meta, time);

    if (item.message) {
      const msg = document.createElement('div');
      msg.className = `admin-notification-msg ${item.message.includes('Warning') ? 'is-warning' : 'is-info'}`;
      msg.textContent = item.message;
      contentBtn.append(msg);
    }

    contentBtn.addEventListener('click', async () => {
      try {
        await apiFetch(`/api/admin/bookings/${item.id}/read`, { method: 'POST' });
      } finally {
        window.location.assign(`/AdminBookings?booking=${item.id}`);
      }
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'admin-notification-dismiss';
    dismissBtn.setAttribute('aria-label', 'Clear notification');
    dismissBtn.title = 'Clear notification';
    dismissBtn.innerHTML = '&times;';
    dismissBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await apiFetch(`/api/admin/bookings/${item.id}/read`, { method: 'POST' });
        await refreshNotifications();
      } catch (error) {
        console.error('Failed to clear notification:', error);
      }
    });

    itemContainer.append(contentBtn, dismissBtn);
    return itemContainer;
  }

  async function refreshNotifications() {
    try {
      const payload = await apiFetch('/api/admin/bookings/notifications?limit=10');
      setBadge(payload.unread);
      if (!notificationItems) return;
      notificationItems.replaceChildren();
      if (!payload.items?.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-notification-empty';
        empty.textContent = 'No new notifications.';
        notificationItems.append(empty);
        return;
      }
      payload.items.forEach((item) => notificationItems.append(notificationNode(item)));
    } catch (error) {
      if (notificationItems) {
        notificationItems.textContent = error instanceof Error ? error.message : 'Unable to load notifications.';
      }
    }
  }

  function showBookingMessage(message, isError = false) {
    if (!bookingMessage) return;
    bookingMessage.hidden = !message;
    bookingMessage.textContent = message || '';
    bookingMessage.classList.toggle('is-error', isError);
  }

  function bookingRow(booking) {
    const row = document.createElement('tr');
    const status = displayEnum(booking.status);
    row.dataset.bookingId = String(booking.id);
    row.className = `is-${status.toLowerCase()}`;

    const roomTotal = (booking.items || []).reduce(
      (sum, line) => sum + Number(line.quantity || 0),
      0
    );
    const roomLabel = booking.items?.length
      ? `${roomTotal} room${roomTotal === 1 ? '' : 's'} · ${booking.items[0].roomTypeName}`
      : 'No rooms';

    [
      ['Reference', booking.reference],
      ['Guest', booking.guestName],
      ['Stay', `${formatDate(booking.checkIn)} → ${formatDate(booking.checkOut)}`],
      ['Rooms', roomLabel],
      ['Type', displayEnum(booking.kind)],
      [
        'Payment',
        booking.paymentOption === 'Half' || booking.paymentOption === 1
          ? 'Half'
          : 'Full',
      ],
    ].forEach(([label, value], index) => {
      const cell = document.createElement('td');
      cell.dataset.label = label;
      cell.textContent = value;
      if (index === 0) cell.className = 'admin-booking-reference';
      row.append(cell);
    });

    const statusCell = document.createElement('td');
    statusCell.dataset.label = 'Status';
    const pill = document.createElement('span');
    pill.className = `admin-booking-status is-${String(booking.status || status).toLowerCase()}`;
    pill.textContent = status;
    statusCell.append(pill);

    const actionCell = document.createElement('td');
    actionCell.className = 'admin-booking-table-actions';
    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.textContent = 'View details';
    viewButton.addEventListener('click', () => openBookingDetails(booking.id, booking));
    actionCell.append(viewButton);

    row.append(statusCell, actionCell);
    return row;
  }

  function closeBookingDetails() {
    if (!detailModal) return;
    detailModal.hidden = true;
    selectedBooking = null;
    document.body.classList.remove('admin-booking-modal-open');
  }

  function detailField(label, value) {
    const wrapper = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    wrapper.append(term, detail);
    return wrapper;
  }

  function renderBookingDetails(booking) {
    if (!detailModal || !detailBody || !detailActions) return;
    selectedBooking = booking;
    detailModal.querySelector('[data-detail-reference]').textContent = booking.reference;
    detailModal.querySelector('[data-detail-guest]').textContent = booking.guestName;
    detailBody.replaceChildren();
    detailActions.replaceChildren();

    const status = displayEnum(booking.status);
    const summary = document.createElement('div');
    summary.className = 'admin-booking-detail-summary';
    const pill = document.createElement('span');
    pill.className = `admin-booking-status is-${String(booking.status || status).toLowerCase()}`;
    pill.textContent = status;
    const total = document.createElement('strong');
    total.textContent = money(booking.totalAmount);
    summary.append(pill, total);

    const fields = document.createElement('dl');
    fields.className = 'admin-booking-detail-grid';
    fields.append(
      detailField('Stay', `${formatDate(booking.checkIn)} → ${formatDate(booking.checkOut)}`),
      detailField('Request type', displayEnum(booking.kind)),
      detailField(
        'Payment option',
        booking.paymentOption === 'Half' || booking.paymentOption === 1
          ? 'Half payment'
          : 'Full payment (advance booking)'
      ),
      detailField('Amount due now', money(booking.amountDueNow ?? booking.totalAmount)),
      detailField('Stay total', money(booking.totalAmount)),
      detailField('Email', booking.guestEmail),
      detailField('Phone', booking.guestPhone),
      detailField('Submitted', formatDateTime(booking.createdAtUtc))
    );

    const heading = document.createElement('h3');
    heading.textContent = 'Rooms';
    const lines = document.createElement('ul');
    lines.className = 'admin-booking-lines';
    (booking.items || []).forEach((line) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      const assigned = (line.assignedRooms || [])
        .map((room) => room.roomNumber)
        .filter(Boolean);
      name.textContent = assigned.length
        ? `${line.quantity}× ${line.roomTypeName} → ${assigned.join(', ')}`
        : `${line.quantity}× ${line.roomTypeName}`;
      const rate = document.createElement('strong');
      rate.textContent = `${money(line.pricePerNight)} / night`;
      item.append(name, rate);
      lines.append(item);
    });
    detailBody.append(summary, fields, heading, lines);

    if (!booking.isArchived && status !== 'Confirmed') {
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.textContent = 'Edit booking';
      editButton.addEventListener('click', () => renderBookingEdit(booking));
      detailActions.append(editButton);
    }

    if (!booking.isArchived && status === 'Confirmed') {
      const checkoutButton = document.createElement('button');
      checkoutButton.type = 'button';
      checkoutButton.className = 'admin-booking-confirm';
      checkoutButton.textContent = 'Check out';
      checkoutButton.addEventListener('click', () => checkoutBooking(booking, checkoutButton));
      detailActions.append(checkoutButton);
    }

    if (!booking.isArchived) {
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'admin-booking-delete';
      cancelButton.textContent = 'Cancel to history';
      cancelButton.addEventListener('click', () => cancelBooking(booking, cancelButton));
      detailActions.append(cancelButton);
    }

    if (!booking.isArchived && status === 'Pending') {
      const confirmButton = document.createElement('button');
      confirmButton.type = 'button';
      confirmButton.className = 'admin-booking-confirm';
      confirmButton.textContent = 'Confirm & assign rooms';
      confirmButton.addEventListener('click', () => renderConfirmAssign(booking));
      detailActions.append(confirmButton);
    }
  }

  async function renderConfirmAssign(booking) {
    if (!detailBody || !detailActions) return;
    detailBody.replaceChildren();
    detailActions.replaceChildren();

    const intro = document.createElement('p');
    intro.className = 'admin-booking-assign-intro';
    intro.textContent =
      'Choose a free room number for each booked room. Multiple rooms of the same type need one pick each.';
    detailBody.append(intro);

    const form = document.createElement('form');
    form.className = 'admin-booking-assign-form';
    const groups = document.createElement('div');
    groups.className = 'admin-booking-assign-groups';

    try {
      const assignable = await apiFetch(`/api/admin/bookings/${booking.id}/assignable-rooms`);
      if (!assignable?.length) {
        groups.textContent = 'No room types found on this booking.';
      } else {
        assignable.forEach((group) => {
          const section = document.createElement('section');
          section.className = 'admin-booking-assign-group';
          section.dataset.roomTypeId = String(group.roomTypeId);

          const title = document.createElement('h3');
          title.textContent = `${group.roomTypeName} · pick ${group.quantityNeeded}`;
          section.append(title);

          if (!group.rooms?.length) {
            const empty = document.createElement('p');
            empty.className = 'admin-booking-assign-empty';
            empty.textContent = `No available ${group.roomTypeName} rooms right now.`;
            section.append(empty);
          } else {
            for (let index = 0; index < group.quantityNeeded; index += 1) {
              const field = document.createElement('label');
              const caption = document.createElement('span');
              caption.textContent =
                group.quantityNeeded > 1 ? `Room ${index + 1}` : 'Room number';
              const select = document.createElement('select');
              select.required = true;
              select.name = `room-${group.roomTypeId}-${index}`;
              select.dataset.roomTypeId = String(group.roomTypeId);
              const placeholder = document.createElement('option');
              placeholder.value = '';
              placeholder.textContent = 'Select room…';
              select.append(placeholder);
              group.rooms.forEach((room) => {
                const option = document.createElement('option');
                option.value = String(room.roomId);
                option.textContent = room.roomNumber;
                select.append(option);
              });
              select.addEventListener('change', () => syncAssignOptions(groups));
              field.append(caption, select);
              section.append(field);
            }
          }

          groups.append(section);
        });
      }
    } catch (error) {
      groups.textContent = error instanceof Error ? error.message : 'Unable to load rooms.';
    }

    form.append(groups);
    detailBody.append(form);

    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.textContent = 'Back';
    backButton.addEventListener('click', () => renderBookingDetails(booking));

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'admin-booking-confirm';
    confirmButton.textContent = 'Confirm booking';
    confirmButton.addEventListener('click', async () => {
      const payloadAssignments = [];
      const used = new Set();
      let valid = true;

      groups.querySelectorAll('.admin-booking-assign-group').forEach((section) => {
        const roomTypeId = Number(section.dataset.roomTypeId);
        const roomIds = [];
        section.querySelectorAll('select').forEach((select) => {
          const value = Number(select.value);
          if (!value) {
            valid = false;
            select.classList.add('is-invalid');
            return;
          }
          select.classList.remove('is-invalid');
          if (used.has(value)) {
            valid = false;
            select.classList.add('is-invalid');
            return;
          }
          used.add(value);
          roomIds.push(value);
        });
        if (roomIds.length) {
          payloadAssignments.push({ roomTypeId, roomIds });
        }
      });

      if (!valid) {
        showBookingMessage('Select a unique available room for each booking quantity.', true);
        return;
      }

      await updateStatus(booking, 'Confirmed', confirmButton, payloadAssignments);
    });

    detailActions.append(backButton, confirmButton);
    syncAssignOptions(groups);
  }

  function syncAssignOptions(groupsRoot) {
    if (!groupsRoot) return;
    const selected = new Set(
      Array.from(groupsRoot.querySelectorAll('select'))
        .map((select) => select.value)
        .filter(Boolean)
    );

    groupsRoot.querySelectorAll('select').forEach((select) => {
      const current = select.value;
      Array.from(select.options).forEach((option) => {
        if (!option.value) return;
        option.disabled = selected.has(option.value) && option.value !== current;
      });
    });
  }

  function editField(label, name, type, value) {
    const field = document.createElement('label');
    const caption = document.createElement('span');
    const input = document.createElement('input');
    caption.textContent = label;
    input.name = name;
    input.type = type;
    input.value = value || '';
    input.required = true;
    field.append(caption, input);
    return field;
  }

  function renderBookingEdit(booking) {
    if (!detailBody || !detailActions) return;
    detailBody.replaceChildren();
    detailActions.replaceChildren();

    const form = document.createElement('form');
    form.className = 'admin-booking-edit-form';
    const fields = document.createElement('div');
    fields.className = 'admin-booking-edit-grid';
    fields.append(
      editField('Guest name', 'guestName', 'text', booking.guestName),
      editField('Email', 'guestEmail', 'email', booking.guestEmail),
      editField('Phone', 'guestPhone', 'tel', booking.guestPhone),
      editField('Check-in', 'checkIn', 'date', String(booking.checkIn).slice(0, 10)),
      editField('Check-out', 'checkOut', 'date', String(booking.checkOut).slice(0, 10))
    );

    const roomHeading = document.createElement('h3');
    roomHeading.textContent = 'Room quantities';
    const roomFields = document.createElement('div');
    roomFields.className = 'admin-booking-edit-rooms';
    (booking.items || []).forEach((line) => {
      const field = editField(line.roomTypeName, `room-${line.roomTypeId}`, 'number', line.quantity);
      const input = field.querySelector('input');
      input.min = '0';
      input.max = '20';
      input.dataset.roomTypeId = String(line.roomTypeId);
      roomFields.append(field);
    });

    const hint = document.createElement('p');
    hint.className = 'admin-booking-edit-hint';
    hint.textContent = 'Set a room quantity to 0 to remove it. At least one room must remain.';
    const error = document.createElement('p');
    error.className = 'admin-booking-edit-error';
    error.hidden = true;
    form.append(fields, roomHeading, roomFields, hint, error);
    detailBody.append(form);

    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.textContent = 'Back';
    backButton.addEventListener('click', () => renderBookingDetails(booking));
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'admin-booking-confirm';
    saveButton.textContent = 'Save changes';
    detailActions.append(backButton, saveButton);
    saveButton.addEventListener('click', () => form.requestSubmit());
    form.addEventListener('submit', (event) => saveBookingEdit(event, booking, saveButton, error));
  }

  async function saveBookingEdit(event, booking, button, errorElement) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const items = Array.from(form.querySelectorAll('[data-room-type-id]')).map((input) => ({
      roomTypeId: Number(input.dataset.roomTypeId),
      quantity: Number(input.value || 0),
    }));

    button.disabled = true;
    errorElement.hidden = true;
    try {
      const updated = await apiFetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: String(data.get('guestName') || ''),
          guestEmail: String(data.get('guestEmail') || ''),
          guestPhone: String(data.get('guestPhone') || ''),
          checkIn: String(data.get('checkIn') || ''),
          checkOut: String(data.get('checkOut') || ''),
          rowVersion: booking.rowVersion,
          items,
        }),
      });
      renderBookingDetails(updated);
      await Promise.all([refreshBookings(), refreshNotifications()]);
      reservationCalendar?.refetchEvents();
    } catch (error) {
      errorElement.textContent = error instanceof Error ? error.message : 'Unable to save changes.';
      errorElement.hidden = false;
    } finally {
      button.disabled = false;
    }
  }

  async function openBookingDetails(id, cachedBooking = null) {
    if (!detailModal || !detailBody) return;
    detailModal.hidden = false;
    document.body.classList.add('admin-booking-modal-open');
    detailBody.innerHTML = '<p>Loading details…</p>';
    if (cachedBooking) renderBookingDetails(cachedBooking);

    try {
      const booking = await apiFetch(`/api/admin/bookings/${id}`);
      renderBookingDetails(booking);
      if (!booking.adminReadAtUtc) {
        apiFetch(`/api/admin/bookings/${id}/read`, { method: 'POST' })
          .then(refreshNotifications)
          .catch(() => {});
      }
    } catch (error) {
      detailBody.textContent = error instanceof Error ? error.message : 'Unable to load details.';
    }
  }

  async function updateStatus(booking, status, button, assignments) {
    button.disabled = true;
    showBookingMessage('');
    try {
      const body = { status, rowVersion: booking.rowVersion };
      if (status === 'Confirmed') {
        body.assignments = assignments || [];
      }
      await apiFetch(`/api/admin/bookings/${booking.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (status === 'Confirmed') {
        window.location.href = '/Rooms?view=list';
        return;
      }
      closeBookingDetails();
      await Promise.all([refreshBookings(), refreshNotifications()]);
      reservationCalendar?.refetchEvents();
      showBookingMessage('Booking updated.');
    } catch (error) {
      showBookingMessage(error instanceof Error ? error.message : 'Unable to update booking.', true);
      await refreshBookings();
    } finally {
      button.disabled = false;
    }
  }

  async function checkoutBooking(booking, button) {
    const rooms = (booking.items || [])
      .flatMap((line) => (line.assignedRooms || []).map((room) => room.roomNumber))
      .filter(Boolean);
    const roomLabel = rooms.length ? ` (${rooms.join(', ')})` : '';
    if (
      !window.confirm(
        `Check out ${booking.reference}${roomLabel}? Assigned rooms will become Available again.`
      )
    ) {
      return;
    }

    button.disabled = true;
    try {
      await apiFetch(`/api/admin/bookings/${booking.id}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowVersion: booking.rowVersion }),
      });
      window.location.href = '/Rooms?view=list';
    } catch (error) {
      showBookingMessage(error instanceof Error ? error.message : 'Unable to check out booking.', true);
      button.disabled = false;
    }
  }

  async function cancelBooking(booking, button) {
    if (!window.confirm(`Cancel booking ${booking.reference} and move it to history?`)) return;
    button.disabled = true;
    try {
      await apiFetch(`/api/admin/bookings/${booking.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowVersion: booking.rowVersion }),
      });
      closeBookingDetails();
      await Promise.all([refreshBookings(), refreshNotifications()]);
      reservationCalendar?.refetchEvents();
      showBookingMessage('Booking cancelled and moved to history.');
    } catch (error) {
      showBookingMessage(error instanceof Error ? error.message : 'Unable to cancel booking.', true);
    } finally {
      button.disabled = false;
    }
  }

  async function refreshBookings() {
    if (!bookingList) return;
      bookingList.innerHTML =
      '<tr><td colspan="8" class="admin-bookings-loading">Loading bookings…</td></tr>';
    showBookingMessage('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (filter) query.set('status', filter);
      if (search) query.set('search', search);
      if (history) query.set('history', 'true');
      const payload = await apiFetch(`/api/admin/bookings?${query}`);
      totalPages = Math.max(1, Math.ceil(Number(payload.total || 0) / Number(payload.pageSize || 25)));
      page = Math.min(Number(payload.page || 1), totalPages);
      bookingList.replaceChildren();
      if (!payload.items?.length) {
        const row = document.createElement('tr');
        const empty = document.createElement('td');
        empty.colSpan = 8;
        empty.className = 'admin-bookings-empty';
        empty.textContent = history
          ? 'No checked-out or cancelled bookings in history.'
          : 'No bookings match this filter.';
        row.append(empty);
        bookingList.append(row);
      } else {
        payload.items.forEach((booking) => bookingList.append(bookingRow(booking)));
      }
      if (pageLabel) pageLabel.textContent = `Page ${page} of ${totalPages}`;
      if (prevButton) prevButton.disabled = page <= 1;
      if (nextButton) nextButton.disabled = page >= totalPages;

      const selected = new URLSearchParams(window.location.search).get('booking');
      if (selected && !selectedFromUrlHandled) {
        selectedFromUrlHandled = true;
        bookingList.querySelector(`[data-booking-id="${CSS.escape(selected)}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        openBookingDetails(Number(selected));
      }
    } catch (error) {
      bookingList.replaceChildren();
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.className = 'admin-bookings-empty';
      cell.textContent = 'Unable to load bookings.';
      row.append(cell);
      bookingList.append(row);
      showBookingMessage(error instanceof Error ? error.message : 'Unable to load bookings.', true);
    }
  }

  function initReservationCalendar() {
    if (reservationCalendar || !calendarElement) return;
    if (!window.FullCalendar?.Calendar) {
      if (calendarFallback) calendarFallback.hidden = false;
      return;
    }

    reservationCalendar = new window.FullCalendar.Calendar(calendarElement, {
      initialView: window.innerWidth < 720 ? 'listMonth' : 'dayGridMonth',
      height: 'auto',
      dayMaxEvents: 3,
      displayEventTime: false,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,listMonth',
      },
      buttonText: {
        today: 'Today',
        month: 'Month',
        list: 'List',
      },
      events: async (info, success, failure) => {
        try {
          const query = new URLSearchParams({
            start: info.startStr.slice(0, 10),
            end: info.endStr.slice(0, 10),
          });
          const items = await apiFetch(`/api/admin/bookings/calendar?${query}`);
          success(items.map((item) => {
            const isHalf = item.paymentOption === 'Half' || item.paymentOption === 1;
            const confirmed = item.status === 'Confirmed';
            let backgroundColor = '#0b1f3a';
            let borderColor = '#0b1f3a';
            if (isHalf) {
              backgroundColor = confirmed ? '#147f7f' : '#1aa6a6';
              borderColor = '#0f6e6e';
            } else if (confirmed) {
              backgroundColor = '#1aa6a6';
              borderColor = '#1aa6a6';
            }
            return {
              id: String(item.id),
              title: item.title,
              start: item.start,
              end: item.end,
              allDay: true,
              backgroundColor,
              borderColor,
              classNames: [isHalf ? 'is-half-payment' : 'is-full-payment'],
              extendedProps: item,
            };
          }));
          if (calendarFallback) calendarFallback.hidden = true;
        } catch (error) {
          if (calendarFallback) calendarFallback.hidden = false;
          failure(error);
        }
      },
      eventClick: (info) => openBookingDetails(Number(info.event.id)),
    });
    reservationCalendar.render();
  }

  detailModal?.querySelectorAll('[data-booking-modal-close]').forEach((button) => {
    button.addEventListener('click', closeBookingDetails);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && detailModal && !detailModal.hidden) {
      closeBookingDetails();
    }
  });

  bookingsRoot?.querySelectorAll('[data-booking-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.bookingView || 'table';
      const showCalendar = view === 'calendar';
      history = view === 'history';
      if (tablePanel) tablePanel.hidden = showCalendar;
      if (calendarPanel) calendarPanel.hidden = !showCalendar;
      const filterGroup = bookingsRoot.querySelector('.admin-booking-filters');
      if (filterGroup) filterGroup.hidden = history;
      bookingsRoot.querySelectorAll('[data-booking-view]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      if (showCalendar) {
        initReservationCalendar();
        reservationCalendar?.updateSize();
      } else {
        if (history) {
          filter = '';
          bookingsRoot.querySelectorAll('[data-booking-filter]').forEach(
            (item) => item.classList.toggle('is-active', !item.dataset.bookingFilter)
          );
        }
        page = 1;
        refreshBookings();
      }
    });
  });

  searchInput?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      search = searchInput.value.trim();
      page = 1;
      refreshBookings();
    }, 300);
  });

  bookingsRoot?.querySelectorAll('[data-booking-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      filter = button.dataset.bookingFilter || '';
      page = 1;
      bookingsRoot.querySelectorAll('[data-booking-filter]').forEach(
        (item) => item.classList.toggle('is-active', item === button)
      );
      refreshBookings();
    });
  });
  bookingsRoot?.querySelector('[data-booking-refresh]')?.addEventListener('click', refreshBookings);
  prevButton?.addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      refreshBookings();
    }
  });
  nextButton?.addEventListener('click', () => {
    if (page < totalPages) {
      page += 1;
      refreshBookings();
    }
  });

  function beginPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(() => {
      refreshNotifications();
      refreshBookings();
      reservationCalendar?.refetchEvents();
    }, 30000);
  }

  function stopPolling() {
    if (!pollTimer) return;
    window.clearInterval(pollTimer);
    pollTimer = null;
  }

  async function startSignalR() {
    if (!window.signalR) {
      beginPolling();
      return;
    }

    const connection = new window.signalR.HubConnectionBuilder()
      .withUrl('/hubs/bookings')
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(window.signalR.LogLevel.Warning)
      .build();

    connection.on('BookingCreated', async () => {
      playChime();
      await Promise.all([refreshNotifications(), refreshBookings()]);
      reservationCalendar?.refetchEvents();
    });
    connection.on('BookingUpdated', async () => {
      await Promise.all([refreshNotifications(), refreshBookings()]);
      reservationCalendar?.refetchEvents();
    });
    connection.on('BookingArchived', async () => {
      closeBookingDetails();
      await Promise.all([refreshNotifications(), refreshBookings()]);
      reservationCalendar?.refetchEvents();
    });
    connection.onreconnecting(beginPolling);
    connection.onreconnected(async () => {
      stopPolling();
      await Promise.all([refreshNotifications(), refreshBookings()]);
      reservationCalendar?.refetchEvents();
    });
    connection.onclose(() => {
      beginPolling();
      reconnectTimer = window.setTimeout(connect, 10000);
    });

    async function connect() {
      try {
        await connection.start();
        stopPolling();
      } catch {
        beginPolling();
        reconnectTimer = window.setTimeout(connect, 10000);
      }
    }

    await connect();
  }

  window.addEventListener('beforeunload', () => {
    if (pollTimer) window.clearInterval(pollTimer);
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    if (searchTimer) window.clearTimeout(searchTimer);
  });

  refreshNotifications();
  refreshBookings();
  startSignalR();
})();
