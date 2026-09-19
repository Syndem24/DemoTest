(() => {
  const root = document.querySelector('[data-admin-payments]');
  if (!root) return;

  const token = document.querySelector(
    '#adminAntiForgery input[name="__RequestVerificationToken"]'
  )?.value || root.querySelector('input[name="__RequestVerificationToken"]')?.value || '';

  const paymentsList = root.querySelector('[data-payments-list]');
  const paymentsSummary = root.querySelector('[data-payments-summary]');
  const paymentsMessage = root.querySelector('[data-payments-message]');
  const paymentsSearchInput = root.querySelector('[data-payments-search]');
  const paymentsMethodSelect = root.querySelector('[data-payments-method]');
  const paymentsPageLabel = root.querySelector('[data-payments-page]');
  const flushButton = root.querySelector('[data-payments-flush]');
  const flushLogToggle = root.querySelector('[data-payments-flush-toggle]');
  const flushLogBody = root.querySelector('[data-payments-flush-body]');
  const flushLogCount = root.querySelector('[data-payments-flush-count]');
  const flushLogList = root.querySelector('[data-payments-flush-log-list]');
  const flushModal = document.querySelector('[data-payments-flush-modal]');
  const flushByInput = flushModal?.querySelector('[data-payments-flush-by]');
  const flushConfirmButton = flushModal?.querySelector('[data-payments-flush-confirm]');
  const flushDetailModal = document.querySelector('[data-payments-flush-detail-modal]');
  const flushDetailBody = flushDetailModal?.querySelector('[data-payments-flush-detail-body]');
  const flushDetailFile = flushDetailModal?.querySelector('[data-payments-flush-detail-file]');
  const paymentDetailModal = document.querySelector('[data-payment-detail-modal]');
  const paymentDetailBody = paymentDetailModal?.querySelector('[data-payment-detail-body]');
  const paymentVoidButton = paymentDetailModal?.querySelector('[data-payment-void]');
  const paymentVerifyButton = paymentDetailModal?.querySelector('[data-payment-verify]');
  const paymentVerifiedChip = paymentDetailModal?.querySelector('[data-payment-detail-verified]');
  const paymentRefundModal = document.querySelector('[data-payment-refund-modal]');
  const paymentRefundReason = paymentRefundModal?.querySelector('[data-payment-refund-reason]');
  const paymentRefundError = paymentRefundModal?.querySelector('[data-payment-refund-error]');
  const paymentRefundGuest = paymentRefundModal?.querySelector('[data-payment-refund-guest]');
  const paymentRefundReceipt = paymentRefundModal?.querySelector('[data-payment-refund-receipt]');
  const paymentRefundAmount = paymentRefundModal?.querySelector('[data-payment-refund-amount]');
  const paymentRefundCopy = paymentRefundModal?.querySelector('[data-payment-refund-copy]');

  let paymentsPage = 1;
  let paymentsTotalPages = 1;
  let paymentsSearch = '';
  let paymentsMethod = '';
  let paymentsPaidOn = '';
  let paymentsReceivedBy = '';
  let paymentsSearchTimer = null;
  let selectedPayment = null;
  let flushLogsCache = [];

  const dayFilterModal = document.querySelector('[data-payments-day-filter-modal]');
  const dayFilterDayInput = dayFilterModal?.querySelector('[data-payments-filter-day]');
  const dayFilterStaffSelect = dayFilterModal?.querySelector('[data-payments-filter-staff]');
  const dayFilterError = dayFilterModal?.querySelector('[data-payments-day-filter-error]');
  const filterChip = root.querySelector('[data-payments-filter-chip]');
  const PH_TZ = 'Asia/Manila';
  const PH_LOCALE = 'en-PH';

  function parseUtc(value) {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const raw = String(value).trim();
    if (!raw) return null;
    const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
    const iso = hasZone || !/T/.test(raw) ? raw : `${raw}Z`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDateTime(value) {
    const date = parseUtc(value);
    return date
      ? date.toLocaleString(PH_LOCALE, {
          timeZone: PH_TZ,
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '—';
  }

  function money(value) {
    return `₱${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

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

  async function apiFetchBlob(url, options = {}) {
    const headers = {
      ...(options.headers || {}),
    };
    if (options.method && options.method !== 'GET') {
      headers.RequestVerificationToken = token;
    }
    if (!headers.Accept) headers.Accept = 'application/pdf';
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const validationMessage = payload.errors
        ? Object.values(payload.errors).flat().join(' ')
        : '';
      throw new Error(payload.message || validationMessage || `Request failed (${response.status}).`);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(disposition);
    const fileName = match
      ? decodeURIComponent(match[1].replace(/"/g, '').trim())
      : 'Mori-Payment-Export.pdf';
    const recordCount = Number(response.headers.get('X-Flush-Record-Count') || 0);
    return { blob, fileName, recordCount };
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function showPaymentsMessage(text, isError = false) {
    if (!paymentsMessage) return;
    if (!text) {
      paymentsMessage.hidden = true;
      paymentsMessage.textContent = '';
      return;
    }
    paymentsMessage.hidden = false;
    paymentsMessage.textContent = text;
    paymentsMessage.classList.toggle('is-error', isError);
  }

  function isRefunded(payment) {
    return payment?.status === 'Voided' || payment?.status === 1;
  }

  function formatPaymentStatus(status) {
    return status === 'Voided' ? 'Refunded' : (status || 'Posted');
  }

  function formatPaymentEvent(value) {
    const map = {
      Deposit: 'Deposit',
      ArrivalPayment: 'Arrival',
      BalanceSettlement: 'Balance',
      Refund: 'Refund',
      Adjustment: 'Adjustment',
    };
    return map[value] || String(value || '');
  }

  function formatPaymentMethod(value) {
    if (
      value === 'BankTransfer'
      || value === 'EWallet'
      || value === 'GCash'
      || value === 'Maya'
    ) {
      return 'E-wallet (InstaPay QR)';
    }
    if (value === 'Card') return 'Card (legacy)';
    if (value === 'Cash') return 'Cash';
    return String(value || '');
  }

  async function refreshPayments() {
    if (!paymentsList) return;
    paymentsList.innerHTML =
      '<tr><td colspan="10" class="admin-bookings-loading">Loading payments…</td></tr>';
    showPaymentsMessage('');
    try {
      const query = new URLSearchParams({
        page: String(paymentsPage),
        pageSize: '25',
      });
      if (paymentsSearch) query.set('search', paymentsSearch);
      if (paymentsMethod) query.set('method', paymentsMethod);
      if (paymentsPaidOn) query.set('paidOn', paymentsPaidOn);
      if (paymentsReceivedBy) query.set('receivedBy', paymentsReceivedBy);
      const payload = await apiFetch(`/api/admin/payments?${query}`);
      syncFilterChip();
      paymentsTotalPages = Math.max(
        1,
        Math.ceil(Number(payload.total || 0) / Number(payload.pageSize || 25))
      );
      paymentsPage = Math.min(Number(payload.page || 1), paymentsTotalPages);
      if (paymentsPageLabel) {
        paymentsPageLabel.textContent = `Page ${paymentsPage} of ${paymentsTotalPages}`;
      }
      root.querySelector('[data-payments-prev]')?.toggleAttribute('disabled', paymentsPage <= 1);
      root.querySelector('[data-payments-next]')?.toggleAttribute(
        'disabled',
        paymentsPage >= paymentsTotalPages
      );
      if (paymentsSummary) {
        const total = Number(payload.total || 0);
        paymentsSummary.innerHTML = `
          <li>
            <span>Collected</span>
            <strong>${money(payload.totalCollected)}</strong>
          </li>
          <li>
            <span>Refunded</span>
            <strong>${money(payload.totalRefunded)}</strong>
          </li>
          <li>
            <span>Records</span>
            <strong>${total}</strong>
            <em>${total === 1 ? 'payment' : 'payments'}</em>
          </li>
        `;
      }
      paymentsList.replaceChildren();
      if (!payload.items?.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 10;
        cell.className = 'admin-bookings-loading';
        cell.textContent =
          paymentsPaidOn || paymentsReceivedBy
            ? 'No payments match this day / staff filter.'
            : 'No payments recorded yet.';
        row.appendChild(cell);
        paymentsList.appendChild(row);
        return;
      }
      payload.items.forEach((payment) => {
        const row = document.createElement('tr');
        if (isRefunded(payment)) row.classList.add('is-voided');
        const cells = [
          { label: 'When (PH)', text: formatDateTime(payment.paidAtUtc) },
          { label: 'Receipt', text: payment.receiptNumber },
          { label: 'Booking', text: payment.bookingReference },
          { label: 'Guest', text: payment.guestName },
          { label: 'Event', text: formatPaymentEvent(payment.eventType), refunded: isRefunded(payment) },
          { label: 'Method', text: formatPaymentMethod(payment.method) },
          { label: 'Amount', text: money(payment.amount) },
          { label: 'Balance', text: money(payment.balanceAfter) },
          { label: 'Staff', text: payment.receivedBy },
        ];
        cells.forEach((cell) => {
          const td = document.createElement('td');
          td.dataset.label = cell.label;
          td.textContent = cell.text;
          if (cell.refunded) {
            td.textContent = '';
            const event = document.createElement('span');
            event.textContent = cell.text;
            const badge = document.createElement('span');
            badge.className = 'admin-payments-status-badge';
            badge.textContent = 'Refunded';
            td.append(event, badge);
          }
          row.appendChild(td);
        });
        const action = document.createElement('td');
        action.className = 'admin-booking-table-actions';
        action.dataset.label = 'Actions';
        const view = document.createElement('button');
        view.type = 'button';
        view.textContent = 'View';
        if (isDigitalPayment(payment) && !payment.verifiedAtUtc && !isRefunded(payment)) {
          view.classList.add('needs-verify');
          const badge = document.createElement('span');
          badge.className = 'admin-payment-view-badge';
          badge.textContent = '1';
          badge.setAttribute('aria-hidden', 'true');
          view.appendChild(badge);
          view.title = 'E-wallet payment not yet verified — open to verify';
        }
        view.addEventListener('click', () => openPaymentDetail(payment));
        action.appendChild(view);
        row.appendChild(action);
        paymentsList.appendChild(row);
      });
    } catch (error) {
      paymentsList.innerHTML = '';
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 10;
      cell.className = 'admin-bookings-loading';
      cell.textContent = error instanceof Error ? error.message : 'Unable to load payments.';
      row.appendChild(cell);
      paymentsList.appendChild(row);
    }
  }

  function appendDetailField(grid, label, value) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    grid.append(dt, dd);
  }

  function isDigitalPayment(payment) {
    return ['EWallet', 'BankTransfer', 'Maya', 'Card', 'GCash'].includes(payment?.method);
  }

  function openPaymentDetail(payment) {
    selectedPayment = payment;
    if (!paymentDetailModal || !paymentDetailBody) return;
    const guestTitle = paymentDetailModal.querySelector('[data-payment-detail-guest]');
    if (guestTitle) guestTitle.textContent = payment.guestName || 'Payment details';
    const receipt = paymentDetailModal.querySelector('[data-payment-detail-receipt]');
    if (receipt) receipt.textContent = payment.receiptNumber || '—';
    const amountChip = paymentDetailModal.querySelector('[data-payment-detail-amount-chip]');
    if (amountChip) amountChip.textContent = money(payment.amount);
    const statusChip = paymentDetailModal.querySelector('[data-payment-detail-status]');
    if (statusChip) {
      statusChip.textContent = formatPaymentStatus(payment.status);
      statusChip.classList.toggle('is-voided', isRefunded(payment));
    }

    const verified = Boolean(payment.verifiedAtUtc);

    const fields = [
      ['When (PH)', formatDateTime(payment.paidAtUtc)],
      ['Booking', payment.bookingReference],
      ['Guest', payment.guestName],
      ['Event', formatPaymentEvent(payment.eventType)],
      ['Method', formatPaymentMethod(payment.method)],
      ['Amount', money(payment.amount)],
      ['Stay total at posting', money(payment.stayTotalAtPosting)],
      ['Balance after', money(payment.balanceAfter)],
      ['Payment reference', payment.externalReference || payment.bankTransferReference || '—'],
      ['Notes', payment.notes || '—'],
      ['Received by', payment.receivedBy],
      ['Status', formatPaymentStatus(payment.status)],
    ];
    if (isDigitalPayment(payment)) {
      fields.push(
        ['Verification', verified ? 'Verified' : 'Not verified'],
        ['Verified by', payment.verifiedBy || '—'],
        ['Verified at (PH)', verified ? formatDateTime(payment.verifiedAtUtc) : '—']
      );
    }
    if (isRefunded(payment)) {
      fields.push(
        ['Refunded at', formatDateTime(payment.voidedAtUtc)],
        ['Refunded by', payment.voidedBy || '—'],
        ['Refund reason', payment.voidReason || '—']
      );
    }

    paymentDetailBody.replaceChildren();
    const grid = document.createElement('dl');
    grid.className = 'admin-flush-detail-grid';
    fields.forEach(([label, value]) => appendDetailField(grid, label, value));
    paymentDetailBody.appendChild(grid);

    if (paymentVoidButton) {
      paymentVoidButton.hidden = isRefunded(payment);
    }
    if (paymentVerifiedChip) {
      paymentVerifiedChip.hidden = !verified;
    }
    if (paymentVerifyButton) {
      paymentVerifyButton.hidden = verified || isRefunded(payment) || !isDigitalPayment(payment);
    }
    paymentDetailModal.hidden = false;
  }

  function closePaymentDetail() {
    if (paymentDetailModal) {
      paymentDetailModal.hidden = true;
    }
    if (paymentVerifiedChip) {
      paymentVerifiedChip.hidden = true;
    }
    selectedPayment = null;
  }

  async function verifySelectedPayment() {
    if (!selectedPayment) return;
    if (paymentVerifyButton) paymentVerifyButton.disabled = true;
    try {
      const updated = await apiFetch(`/api/admin/payments/${selectedPayment.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      selectedPayment = updated;
      openPaymentDetail(updated);
      showPaymentsMessage(`Payment ${updated.receiptNumber} marked as verified.`);
      await refreshPayments();
    } catch (error) {
      showPaymentsMessage(error.message || 'Could not verify this payment.', true);
    } finally {
      if (paymentVerifyButton) paymentVerifyButton.disabled = false;
    }
  }

  function refundFocusables() {
    if (!paymentRefundModal) return [];
    return [...paymentRefundModal.querySelectorAll(
      'button:not(.admin-payment-refund-backdrop), textarea'
    )].filter((el) => !el.disabled && !el.hidden);
  }

  function setPaymentDetailInert(inert) {
    if (!paymentDetailModal) return;
    paymentDetailModal.toggleAttribute('inert', inert);
    paymentDetailModal.setAttribute('aria-hidden', inert ? 'true' : 'false');
  }

  function closeRefundModal() {
    if (!paymentRefundModal) return;
    paymentRefundModal.hidden = true;
    setPaymentDetailInert(false);
    if (paymentRefundReason) paymentRefundReason.value = '';
    if (paymentRefundError) {
      paymentRefundError.hidden = true;
      paymentRefundError.textContent = '';
    }
    paymentVoidButton?.focus();
  }

  function openRefundModal() {
    if (!selectedPayment || !paymentRefundModal) return;
    if (paymentRefundModal.parentElement !== document.body) {
      document.body.appendChild(paymentRefundModal);
    }
    if (paymentRefundGuest) {
      paymentRefundGuest.textContent = selectedPayment.guestName || 'Refund this payment?';
    }
    if (paymentRefundReceipt) {
      paymentRefundReceipt.textContent = selectedPayment.receiptNumber || '—';
    }
    if (paymentRefundAmount) {
      paymentRefundAmount.textContent = money(selectedPayment.amount);
    }
    if (paymentRefundCopy) {
      paymentRefundCopy.textContent =
        `This reverses ${money(selectedPayment.amount)} on ${selectedPayment.bookingReference || 'the stay'} and restores the balance. The reason is stored in the system audit log.`;
    }
    if (paymentRefundReason) paymentRefundReason.value = '';
    if (paymentRefundError) {
      paymentRefundError.hidden = true;
      paymentRefundError.textContent = '';
    }
    setPaymentDetailInert(true);
    paymentRefundModal.hidden = false;
    paymentRefundReason?.focus();
  }

  async function confirmRefundPayment() {
    if (!selectedPayment) return;
    const reason = paymentRefundReason?.value?.trim() || '';
    if (reason.length < 8) {
      if (paymentRefundError) {
        paymentRefundError.hidden = false;
        paymentRefundError.textContent = 'Enter reason notes (at least 8 characters).';
      }
      paymentRefundReason?.focus();
      return;
    }
    const confirmButton = paymentRefundModal?.querySelector('[data-payment-refund-confirm]');
    if (confirmButton) confirmButton.disabled = true;
    try {
      await apiFetch(`/api/admin/payments/${selectedPayment.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      closeRefundModal();
      closePaymentDetail();
      showPaymentsMessage('Payment refunded.');
      await refreshPayments();
    } catch (error) {
      if (paymentRefundError) {
        paymentRefundError.hidden = false;
        paymentRefundError.textContent = error instanceof Error ? error.message : 'Unable to refund payment.';
      }
    } finally {
      if (confirmButton) confirmButton.disabled = false;
    }
  }

  function setFlushLogExpanded(expanded) {
    if (!flushLogToggle || !flushLogBody) return;
    flushLogToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    flushLogBody.hidden = !expanded;
    flushLogToggle.classList.toggle('is-open', expanded);
    updateFlushLogCountLabel(flushLogsCache.length, expanded);
  }

  function updateFlushLogCountLabel(count, expanded) {
    if (!flushLogCount) return;
    const state = expanded ? 'Open' : 'Closed';
    if (!count) {
      flushLogCount.textContent = `${state} · no export actions yet · kept 7 days`;
      return;
    }
    flushLogCount.textContent = `${state} · ${count} export action${count === 1 ? '' : 's'} · kept 7 days`;
  }

  function openFlushDetail(log) {
    if (!flushDetailModal || !flushDetailBody) return;
    if (flushDetailFile) flushDetailFile.textContent = log.fileName || 'Export record';
    const lines = String(log.summary || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const fields = [
      ['When (PH)', formatDateTime(log.flushedAtUtc)],
      ['Performed by', log.performedBy || '—'],
      ['Records deleted', String(log.recordCount ?? 0)],
      ['PDF softcopy', log.fileName || '—'],
      ['Expires (PH)', formatDateTime(log.expiresAtUtc)],
    ];
    flushDetailBody.replaceChildren();
    const grid = document.createElement('dl');
    grid.className = 'admin-flush-detail-grid';
    fields.forEach(([label, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      grid.append(dt, dd);
    });
    flushDetailBody.appendChild(grid);
    if (lines.length) {
      const title = document.createElement('h3');
      title.className = 'admin-flush-detail-subtitle';
      title.textContent = 'Important details';
      flushDetailBody.appendChild(title);
      const list = document.createElement('ul');
      list.className = 'admin-flush-detail-points';
      lines.forEach((line) => {
        const item = document.createElement('li');
        item.textContent = line;
        list.appendChild(item);
      });
      flushDetailBody.appendChild(list);
    } else {
      const empty = document.createElement('p');
      empty.textContent = 'No extra summary was stored for this data export.';
      flushDetailBody.appendChild(empty);
    }
    flushDetailModal.hidden = false;
  }

  function closeFlushDetail() {
    if (flushDetailModal) flushDetailModal.hidden = true;
  }

  async function refreshFlushLogs() {
    if (!flushLogList) return;
    flushLogList.innerHTML =
      '<tr><td colspan="6" class="admin-bookings-loading">Loading export log…</td></tr>';
    try {
      const logs = await apiFetch('/api/admin/payments/flush-logs');
      flushLogsCache = Array.isArray(logs) ? logs : [];
      const isOpen = flushLogToggle?.getAttribute('aria-expanded') === 'true';
      updateFlushLogCountLabel(flushLogsCache.length, isOpen);
      flushLogList.replaceChildren();
      if (!flushLogsCache.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.className = 'admin-bookings-loading';
        cell.textContent = 'No export actions yet.';
        row.appendChild(cell);
        flushLogList.appendChild(row);
        return;
      }
      flushLogsCache.forEach((log) => {
        const row = document.createElement('tr');
        [
          formatDateTime(log.flushedAtUtc),
          log.performedBy || '—',
          String(log.recordCount ?? 0),
          log.fileName || '—',
          formatDateTime(log.expiresAtUtc),
        ].forEach((text, index) => {
          const td = document.createElement('td');
          if (index === 3) {
            td.className = 'admin-export-file-cell';
            const file = document.createElement('span');
            file.className = 'admin-export-file-name';
            file.textContent = text;
            td.appendChild(file);
          } else {
            td.textContent = text;
          }
          row.appendChild(td);
        });
        const action = document.createElement('td');
        action.className = 'admin-booking-table-actions';
        const view = document.createElement('button');
        view.type = 'button';
        view.textContent = 'View';
        view.addEventListener('click', () => openFlushDetail(log));
        action.appendChild(view);
        row.appendChild(action);
        flushLogList.appendChild(row);
      });
    } catch (error) {
      flushLogsCache = [];
      updateFlushLogCountLabel(0, flushLogToggle?.getAttribute('aria-expanded') === 'true');
      flushLogList.innerHTML = '';
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'admin-bookings-loading';
      cell.textContent = error instanceof Error ? error.message : 'Unable to load export log.';
      row.appendChild(cell);
      flushLogList.appendChild(row);
    }
  }

  function openFlushModal() {
    if (!flushModal) return;
    if (flushByInput) {
      flushByInput.value = localStorage.getItem('moriPaymentFlushBy') || '';
      flushByInput.focus();
    }
    flushModal.hidden = false;
  }

  function closeFlushModal() {
    if (flushModal) flushModal.hidden = true;
  }

  async function confirmFlushPayments() {
    const performedBy = (flushByInput?.value || '').trim();
    if (performedBy.length < 2) {
      showPaymentsMessage('Enter the staff name who is exporting payments.', true);
      flushByInput?.focus();
      return;
    }
    if (
      !window.confirm(
        'Export completed-stay payments to a branded PDF, save it to this device, then permanently delete those payment records?'
      )
    ) {
      return;
    }

    if (flushConfirmButton) {
      flushConfirmButton.disabled = true;
      flushConfirmButton.dataset.exportLabel = flushConfirmButton.textContent || '';
      flushConfirmButton.textContent = 'Exporting…';
    }
    window.setAdminExportLoading?.(true, {
      title: 'Exporting payments…',
      detail: 'Building branded PDF softcopy and clearing completed-stay records. Please wait.',
    });
    try {
      const result = await apiFetchBlob('/api/admin/payments/flush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/pdf, application/json' },
        body: JSON.stringify({ performedBy }),
      });
      localStorage.setItem('moriPaymentFlushBy', performedBy);
      downloadBlob(result.blob, result.fileName);
      closeFlushModal();
      paymentsPage = 1;
      await Promise.all([refreshPayments(), refreshFlushLogs()]);
      setFlushLogExpanded(true);
      showPaymentsMessage(
        `Payments exported (${result.recordCount || 'all'} records). PDF saved as ${result.fileName}.`
      );
    } catch (error) {
      showPaymentsMessage(
        window.friendlyAdminExportError?.(error, 'Unable to export payments.')
          || (error instanceof Error ? error.message : 'Unable to export payments.'),
        true
      );
    } finally {
      window.setAdminExportLoading?.(false);
      if (flushConfirmButton) {
        flushConfirmButton.disabled = false;
        flushConfirmButton.textContent =
          flushConfirmButton.dataset.exportLabel || 'Export PDF & delete payments';
        delete flushConfirmButton.dataset.exportLabel;
      }
    }
  }

  function syncFilterChip() {
    if (!filterChip) return;
    const parts = [];
    if (paymentsPaidOn) parts.push(`Day ${paymentsPaidOn}`);
    if (paymentsReceivedBy) parts.push(paymentsReceivedBy);
    if (!parts.length) {
      filterChip.hidden = true;
      filterChip.textContent = '';
      return;
    }
    filterChip.hidden = false;
    filterChip.textContent = `Filtered · ${parts.join(' · ')}`;
  }

  function manilaTodayIso() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: PH_TZ }).format(new Date());
  }

  async function loadCollectorsIntoSelect() {
    if (!dayFilterStaffSelect) return;
    const current = paymentsReceivedBy || dayFilterStaffSelect.value || '';
    try {
      const names = await apiFetch('/api/admin/payments/collectors');
      dayFilterStaffSelect.innerHTML = '<option value="">All staff</option>';
      (Array.isArray(names) ? names : []).forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        dayFilterStaffSelect.appendChild(option);
      });
      dayFilterStaffSelect.value = current;
    } catch {
      dayFilterStaffSelect.innerHTML = '<option value="">All staff</option>';
    }
  }

  function setDayFilterError(message) {
    if (!dayFilterError) return;
    if (!message) {
      dayFilterError.hidden = true;
      dayFilterError.textContent = '';
      return;
    }
    dayFilterError.hidden = false;
    dayFilterError.textContent = message;
  }

  async function openDayFilterModal() {
    if (!dayFilterModal) return;
    setDayFilterError('');
    if (dayFilterDayInput) dayFilterDayInput.value = paymentsPaidOn || manilaTodayIso();
    await loadCollectorsIntoSelect();
    if (dayFilterStaffSelect) dayFilterStaffSelect.value = paymentsReceivedBy || '';
    dayFilterModal.hidden = false;
    dayFilterDayInput?.focus();
  }

  function closeDayFilterModal() {
    if (!dayFilterModal) return;
    dayFilterModal.hidden = true;
    setDayFilterError('');
  }

  function applyDayFilter() {
    const day = dayFilterDayInput?.value?.trim() || '';
    const staff = dayFilterStaffSelect?.value?.trim() || '';
    if (!day && !staff) {
      setDayFilterError('Choose a day and/or a staff collector.');
      return;
    }
    paymentsPaidOn = day;
    paymentsReceivedBy = staff;
    paymentsPage = 1;
    closeDayFilterModal();
    refreshPayments();
  }

  function clearDayFilter() {
    paymentsPaidOn = '';
    paymentsReceivedBy = '';
    if (dayFilterDayInput) dayFilterDayInput.value = '';
    if (dayFilterStaffSelect) dayFilterStaffSelect.value = '';
    paymentsPage = 1;
    closeDayFilterModal();
    refreshPayments();
  }

  root.querySelector('[data-payments-refresh]')?.addEventListener('click', () => refreshPayments());
  root.querySelector('[data-payments-day-filter]')?.addEventListener('click', () => {
    void openDayFilterModal();
  });
  dayFilterModal?.querySelectorAll('[data-payments-day-filter-close]').forEach((button) => {
    button.addEventListener('click', closeDayFilterModal);
  });
  dayFilterModal?.querySelector('[data-payments-day-filter-apply]')?.addEventListener('click', applyDayFilter);
  dayFilterModal?.querySelector('[data-payments-day-filter-clear]')?.addEventListener('click', clearDayFilter);
  flushButton?.addEventListener('click', openFlushModal);
  flushLogToggle?.addEventListener('click', () => {
    const open = flushLogToggle.getAttribute('aria-expanded') === 'true';
    setFlushLogExpanded(!open);
  });
  flushModal?.querySelectorAll('[data-payments-flush-close]').forEach((button) => {
    button.addEventListener('click', () => {
      if (document.body.classList.contains('is-exporting')) return;
      closeFlushModal();
    });
  });
  flushDetailModal?.querySelectorAll('[data-payments-flush-detail-close]').forEach((button) => {
    button.addEventListener('click', closeFlushDetail);
  });
  flushConfirmButton?.addEventListener('click', confirmFlushPayments);
  flushByInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmFlushPayments();
    }
  });
  root.querySelector('[data-payments-prev]')?.addEventListener('click', () => {
    if (paymentsPage <= 1) return;
    paymentsPage -= 1;
    refreshPayments();
  });
  root.querySelector('[data-payments-next]')?.addEventListener('click', () => {
    if (paymentsPage >= paymentsTotalPages) return;
    paymentsPage += 1;
    refreshPayments();
  });
  paymentsSearchInput?.addEventListener('input', () => {
    window.clearTimeout(paymentsSearchTimer);
    paymentsSearchTimer = window.setTimeout(() => {
      paymentsSearch = paymentsSearchInput.value.trim();
      paymentsPage = 1;
      refreshPayments();
    }, 300);
  });
  paymentsMethodSelect?.addEventListener('change', () => {
    paymentsMethod = paymentsMethodSelect.value || '';
    paymentsPage = 1;
    refreshPayments();
  });
  paymentDetailModal?.querySelectorAll('[data-payment-detail-close]').forEach((button) => {
    button.addEventListener('click', closePaymentDetail);
  });
  paymentVoidButton?.addEventListener('click', openRefundModal);
  paymentVerifyButton?.addEventListener('click', verifySelectedPayment);
  paymentRefundModal?.querySelectorAll('[data-payment-refund-cancel]').forEach((button) => {
    button.addEventListener('click', closeRefundModal);
  });
  paymentRefundModal?.querySelector('[data-payment-refund-confirm]')?.addEventListener('click', confirmRefundPayment);
  paymentRefundModal?.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || paymentRefundModal.hidden) return;
    const items = refundFocusables();
    if (items.length < 2) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (document.body.classList.contains('is-exporting')) {
      event.preventDefault();
      return;
    }
    if (paymentRefundModal && !paymentRefundModal.hidden) {
      closeRefundModal();
      return;
    }
    if (dayFilterModal && !dayFilterModal.hidden) {
      closeDayFilterModal();
      return;
    }
    if (flushDetailModal && !flushDetailModal.hidden) {
      closeFlushDetail();
      return;
    }
    if (flushModal && !flushModal.hidden) {
      closeFlushModal();
      return;
    }
    if (paymentDetailModal && !paymentDetailModal.hidden) {
      closePaymentDetail();
    }
  });

  refreshPayments();
  refreshFlushLogs();

  function shouldRefreshPayments(scopes) {
    return scopes.includes('all') || scopes.includes('payments') || scopes.includes('dashboard');
  }

  function schedulePaymentsRefresh() {
    if (window.MoriAdminRealtime) {
      window.MoriAdminRealtime.scheduleRefresh('payments', () => refreshPayments());
    } else {
      void refreshPayments();
    }
  }

  window.addEventListener('mori:admin-refresh', (event) => {
    const scopes = event.detail?.scopes || [];
    if (!shouldRefreshPayments(scopes)) return;
    schedulePaymentsRefresh();
    if (scopes.includes('all') || scopes.includes('audit')) {
      window.MoriAdminRealtime?.scheduleRefresh('payments-flush', () => refreshFlushLogs());
    }
  });
})();
