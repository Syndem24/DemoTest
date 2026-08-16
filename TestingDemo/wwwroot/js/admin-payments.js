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
  const paymentSaveReceiptButton = paymentDetailModal?.querySelector('[data-payment-save-receipt]');

  let paymentsPage = 1;
  let paymentsTotalPages = 1;
  let paymentsSearch = '';
  let paymentsMethod = '';
  let paymentsSearchTimer = null;
  let selectedPayment = null;
  let flushLogsCache = [];

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

  function parseOcrNotes(notes) {
    const text = String(notes || '');
    const pick = (label) => {
      const match = text.match(new RegExp(`${label}:\\s*([^·\\n]+)`, 'i'));
      return match ? match[1].trim() : '';
    };
    const amountMatch = text.match(/Receipt amount:\s*₱?\s*([\d,]+(?:\.\d+)?)/i);
    return {
      channel: pick('Channel'),
      from: pick('From'),
      to: pick('To'),
      receiptAmount: amountMatch ? amountMatch[1].replace(/,/g, '') : '',
      stamp: /Digital OCR|E-wallet OCR/i.test(text) ? text : '',
    };
  }

  function appendDetailField(grid, label, value) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    grid.append(dt, dd);
  }

  function buildReceiptComparePanel(payment) {
    const ocr = parseOcrNotes(payment.notes);
    const amountDisplay = ocr.receiptAmount
      ? Number(ocr.receiptAmount).toFixed(2)
      : Number(payment.amount || 0).toFixed(2);
    const channelLabel = ocr.channel || formatPaymentMethod(payment.method) || 'Digital';
    const canEdit = payment.status !== 'Voided';

    const compare = document.createElement('div');
    compare.className = 'admin-payment-ocr-compare admin-payment-detail-compare';
    compare.innerHTML = `
      <div class="admin-payment-detail-compare-head">
        <p class="admin-payment-panel-title">Receipt proof</p>
        <span class="admin-payment-detail-channel" data-payment-detail-channel>${escapeHtml(channelLabel)}</span>
      </div>
      <div class="admin-payment-ocr-grid">
        <figure class="admin-payment-ocr-photo">
          <div class="admin-payment-ocr-photo-frame">
            <img
              alt="Payment receipt for ${escapeHtml(payment.receiptNumber || '')}"
              data-payment-detail-receipt-image
              data-photo-zoom
              data-photo-zoom-src="${escapeHtml(payment.receiptImagePath)}"
              data-photo-zoom-alt="Payment receipt"
              title="Click to zoom · Esc to exit"
              src="${escapeHtml(payment.receiptImagePath)}" />
          </div>
          <div class="admin-payment-ocr-photo-meta">
            <p class="admin-payment-ocr-caption">Click photo to zoom</p>
            <label class="admin-payment-ocr-filter-switch">
              <input type="checkbox" data-payment-detail-scanner-filter />
              <span class="admin-payment-ocr-filter-track" aria-hidden="true"></span>
              <span class="admin-payment-ocr-filter-text">Scanner filter</span>
            </label>
            <a class="admin-payment-receipt-link" href="${escapeHtml(payment.receiptImagePath)}" target="_blank" rel="noopener noreferrer">Open full size</a>
          </div>
        </figure>
        <div class="admin-payment-detail-facts admin-payment-detail-edit" role="group" aria-label="Receipt details">
          <label class="admin-payment-detail-amount">
            <span class="admin-payment-detail-fact-label">Amount on receipt (₱)</span>
            <input
              type="text"
              inputmode="decimal"
              data-payment-detail-amount
              value="${escapeHtml(amountDisplay)}"
              ${canEdit ? '' : 'readonly'}
              autocomplete="off" />
          </label>
          <div class="admin-payment-ocr-fields admin-payment-detail-edit-fields">
            <label>
              <span>Transfer from / sender</span>
              <input
                type="text"
                maxlength="160"
                data-payment-detail-from
                value="${escapeHtml(ocr.from)}"
                placeholder="Sender name or number"
                ${canEdit ? '' : 'readonly'} />
            </label>
            <label>
              <span>Transfer to / recipient</span>
              <input
                type="text"
                maxlength="160"
                data-payment-detail-to
                value="${escapeHtml(ocr.to)}"
                placeholder="Recipient name or number"
                ${canEdit ? '' : 'readonly'} />
            </label>
          </div>
          <p class="admin-payment-prices-hint">
            ${canEdit
              ? 'Edit fields to correct OCR, then Save receipt details. Posted payment amount is unchanged.'
              : 'Voided — receipt details are locked.'}
          </p>
        </div>
      </div>
    `;

    const filterToggle = compare.querySelector('[data-payment-detail-scanner-filter]');
    const image = compare.querySelector('[data-payment-detail-receipt-image]');
    filterToggle?.addEventListener('change', () => {
      image?.classList.toggle('is-scanner-preview', Boolean(filterToggle.checked));
    });

    if (typeof window.initPhotoZoom === 'function') {
      window.initPhotoZoom(compare);
    }
    return compare;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function openPaymentDetail(payment) {
    selectedPayment = payment;
    if (!paymentDetailModal || !paymentDetailBody) return;
    const receipt = paymentDetailModal.querySelector('[data-payment-detail-receipt]');
    if (receipt) receipt.textContent = payment.receiptNumber;

    const hasReceipt = Boolean(payment.receiptImagePath);
    paymentDetailModal.classList.toggle('has-receipt-proof', hasReceipt);

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
      ['Status', payment.status],
    ];
    if (!hasReceipt) {
      fields.splice(
        8,
        0,
        ['External ref', payment.externalReference || '—'],
        ['Bank transfer ref', payment.bankTransferReference || '—'],
        ['Notes', payment.notes || '—']
      );
    }
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
    fields.forEach(([label, value]) => appendDetailField(grid, label, value));
    paymentDetailBody.appendChild(grid);

    if (hasReceipt) {
      paymentDetailBody.appendChild(buildReceiptComparePanel(payment));
    }

    if (paymentVoidButton) {
      paymentVoidButton.hidden = payment.status === 'Voided';
    }
    if (paymentSaveReceiptButton) {
      paymentSaveReceiptButton.hidden = !hasReceipt || payment.status === 'Voided';
    }
    paymentDetailModal.hidden = false;
  }

  function closePaymentDetail() {
    if (paymentDetailModal) {
      paymentDetailModal.hidden = true;
      paymentDetailModal.classList.remove('has-receipt-proof');
    }
    selectedPayment = null;
  }

  async function saveReceiptDetails() {
    if (!selectedPayment || !paymentDetailBody) return;
    const amountRaw = paymentDetailBody.querySelector('[data-payment-detail-amount]')?.value?.trim() || '';
    const amountValue = Number(String(amountRaw).replace(/,/g, ''));
    const channel =
      paymentDetailBody.querySelector('[data-payment-detail-channel]')?.textContent?.trim() || '';
    const body = {
      externalReference: selectedPayment.externalReference || selectedPayment.bankTransferReference || null,
      transferFrom: paymentDetailBody.querySelector('[data-payment-detail-from]')?.value?.trim() || null,
      transferTo: paymentDetailBody.querySelector('[data-payment-detail-to]')?.value?.trim() || null,
      channel: channel || null,
      receiptAmount: Number.isFinite(amountValue) && amountValue > 0 ? amountValue : null,
    };

    if (paymentSaveReceiptButton) paymentSaveReceiptButton.disabled = true;
    try {
      const updated = await apiFetch(`/api/admin/payments/${selectedPayment.id}/receipt-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      selectedPayment = updated;
      openPaymentDetail(updated);
      showPaymentsMessage(`Saved receipt details for ${updated.receiptNumber}.`);
      await refreshPayments();
    } catch (error) {
      showPaymentsMessage(error.message || 'Could not save receipt details.', true);
    } finally {
      if (paymentSaveReceiptButton) paymentSaveReceiptButton.disabled = false;
    }
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
      showPaymentsMessage(error instanceof Error ? error.message : 'Unable to export payments.', true);
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

  root.querySelector('[data-payments-refresh]')?.addEventListener('click', () => refreshPayments());
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
  paymentVoidButton?.addEventListener('click', voidSelectedPayment);
  paymentSaveReceiptButton?.addEventListener('click', saveReceiptDetails);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (document.body.classList.contains('is-exporting')) {
      event.preventDefault();
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
})();
