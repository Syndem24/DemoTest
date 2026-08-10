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
  const paymentDetailModal = document.querySelector('[data-payment-detail-modal]');
  const paymentDetailBody = paymentDetailModal?.querySelector('[data-payment-detail-body]');
  const paymentVoidButton = paymentDetailModal?.querySelector('[data-payment-void]');

  let paymentsPage = 1;
  let paymentsTotalPages = 1;
  let paymentsSearch = '';
  let paymentsMethod = '';
  let paymentsSearchTimer = null;
  let selectedPayment = null;

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
    if (value === 'BankTransfer') return 'Bank transfer (InstaPay)';
    if (value === 'EWallet' || value === 'GCash' || value === 'Maya') return 'E-wallet';
    if (value === 'Card') return 'Card (legacy)';
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
      const payload = await apiFetch(`/api/admin/payments?${query}`);
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
        paymentsSummary.innerHTML = `
          <span>Collected: ${money(payload.totalCollected)}</span>
          <span>Refunded: ${money(payload.totalRefunded)}</span>
          <span>${Number(payload.total || 0)} record${Number(payload.total || 0) === 1 ? '' : 's'}</span>
        `;
      }
      paymentsList.replaceChildren();
      if (!payload.items?.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 10;
        cell.className = 'admin-bookings-loading';
        cell.textContent = 'No payments recorded yet.';
        row.appendChild(cell);
        paymentsList.appendChild(row);
        return;
      }
      payload.items.forEach((payment) => {
        const row = document.createElement('tr');
        if (payment.status === 'Voided') row.classList.add('is-voided');
        [
          formatDateTime(payment.paidAtUtc),
          payment.receiptNumber,
          payment.bookingReference,
          payment.guestName,
          formatPaymentEvent(payment.eventType),
          formatPaymentMethod(payment.method),
          money(payment.amount),
          money(payment.balanceAfter),
          payment.receivedBy,
        ].forEach((text) => {
          const td = document.createElement('td');
          td.textContent = text;
          row.appendChild(td);
        });
        const action = document.createElement('td');
        action.className = 'admin-booking-table-actions';
        const view = document.createElement('button');
        view.type = 'button';
        view.textContent = 'View';
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

  function openPaymentDetail(payment) {
    selectedPayment = payment;
    if (!paymentDetailModal || !paymentDetailBody) return;
    const receipt = paymentDetailModal.querySelector('[data-payment-detail-receipt]');
    if (receipt) receipt.textContent = payment.receiptNumber;
    const fields = [
      ['When (PH)', formatDateTime(payment.paidAtUtc)],
      ['Booking', payment.bookingReference],
      ['Guest', payment.guestName],
      ['Event', formatPaymentEvent(payment.eventType)],
      ['Method', formatPaymentMethod(payment.method)],
      ['Amount', money(payment.amount)],
      ['Stay total at posting', money(payment.stayTotalAtPosting)],
      ['Balance after', money(payment.balanceAfter)],
      ['Received by', payment.receivedBy],
      ['External ref', payment.externalReference || '—'],
      ['Bank transfer ref', payment.bankTransferReference || '—'],
      ['Notes', payment.notes || '—'],
      ['Status', payment.status],
    ];
    if (payment.status === 'Voided') {
      fields.push(
        ['Voided at', formatDateTime(payment.voidedAtUtc)],
        ['Voided by', payment.voidedBy || '—'],
        ['Void reason', payment.voidReason || '—']
      );
    }
    paymentDetailBody.replaceChildren();
    const grid = document.createElement('dl');
    grid.className = 'admin-flush-detail-grid';
    fields.forEach(([label, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      grid.append(dt, dd);
    });
    paymentDetailBody.appendChild(grid);

    const receiptDt = document.createElement('dt');
    receiptDt.textContent = 'Receipt photo';
    const receiptDd = document.createElement('dd');
    if (payment.receiptImagePath) {
      const link = document.createElement('a');
      link.href = payment.receiptImagePath;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open full size';
      const img = document.createElement('img');
      img.src = payment.receiptImagePath;
      img.alt = `Receipt for ${payment.receiptNumber}`;
      img.className = 'admin-payment-receipt-preview';
      receiptDd.append(link, img);
    } else {
      receiptDd.textContent = '—';
    }
    grid.append(receiptDt, receiptDd);

    if (paymentVoidButton) {
      paymentVoidButton.hidden = payment.status === 'Voided';
    }
    paymentDetailModal.hidden = false;
  }

  function closePaymentDetail() {
    if (paymentDetailModal) paymentDetailModal.hidden = true;
    selectedPayment = null;
  }

  async function voidSelectedPayment() {
    if (!selectedPayment) return;
    const voidedBy = window.prompt('Staff name voiding this payment:');
    if (!voidedBy || voidedBy.trim().length < 2) return;
    const reason = window.prompt('Void reason:');
    if (!reason || reason.trim().length < 2) return;
    try {
      await apiFetch(`/api/admin/payments/${selectedPayment.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voidedBy: voidedBy.trim(), reason: reason.trim() }),
      });
      closePaymentDetail();
      showPaymentsMessage('Payment voided.');
      await refreshPayments();
    } catch (error) {
      showPaymentsMessage(error instanceof Error ? error.message : 'Unable to void payment.', true);
    }
  }

  root.querySelector('[data-payments-refresh]')?.addEventListener('click', () => refreshPayments());
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
  paymentVoidButton?.addEventListener('click', voidSelectedPayment);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && paymentDetailModal && !paymentDetailModal.hidden) {
      closePaymentDetail();
    }
  });

  refreshPayments();
})();
