(() => {
  const page = document.getElementById('drPage');
  if (!page) return;

  const t = (key, params) => (window.MoriI18n?.t ? window.MoriI18n.t(key, params) : key);
  const money = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const reference = page.dataset.ref || '';
  const payToken = page.dataset.token || '';
  const result = page.dataset.result || '';
  const token = page.querySelector('input[name="__RequestVerificationToken"]')?.value || '';

  const states = {};
  page.querySelectorAll('[data-dr-state]').forEach((el) => { states[el.dataset.drState] = el; });
  const statusEl = page.querySelector('[data-dr-status]');
  const rowsEl = page.querySelector('[data-dr-rows]');
  const actionsEl = page.querySelector('[data-dr-actions]');
  const homeBtn = page.querySelector('[data-dr-home]');
  const retryBtn = page.querySelector('[data-dr-retry]');

  let intent = null;
  let stopped = false;
  const startedAt = Date.now();
  const MAX_MS = 60000;
  const POLL_MS = 2000;

  function show(name) {
    Object.entries(states).forEach(([key, el]) => { el.hidden = key !== name; });
    actionsEl.hidden = name === 'working';
  }

  function retryUrl() {
    const id = intent?.bookingId;
    return `/Booking/Accommodations?resume=${encodeURIComponent(reference)}&t=${encodeURIComponent(payToken)}${id ? `&id=${id}` : ''}`;
  }

  function showSuccess(current) {
    stopped = true;
    show('success');
    homeBtn.href = `/?booked=${encodeURIComponent(reference)}`;
    retryBtn.hidden = true;
    const rows = [
      [t('depositReturn.reference'), current.bookingReference || reference],
      current.receiptNumber ? [t('depositReturn.receipt'), current.receiptNumber] : null,
      [t('depositReturn.paidNow'), money(current.amount)],
      current.balanceDue != null ? [t('depositReturn.balanceAt'), money(current.balanceDue)] : null,
    ].filter(Boolean);
    rowsEl.innerHTML = rows
      .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
      .join('');
  }

  function showFailed() {
    stopped = true;
    show('failed');
    retryBtn.href = retryUrl();
    retryBtn.hidden = false;
    homeBtn.hidden = true;
  }

  function showPending() {
    stopped = true;
    show('pending');
    retryBtn.href = retryUrl();
    retryBtn.hidden = false;
    homeBtn.hidden = true;
  }

  async function poll() {
    if (stopped) return;
    if (Date.now() - startedAt > MAX_MS) {
      showPending();
      return;
    }
    try {
      const res = await fetch(
        `/api/guest/deposit/by-reference/${encodeURIComponent(reference)}/current?payToken=${encodeURIComponent(payToken)}`,
        { headers: { Accept: 'application/json' } });
      if (res.ok) {
        intent = await res.json();
        const status = String(intent.status || '');
        if (status === 'Paid' || intent.bookingStatus === 'Confirmed') {
          showSuccess(intent);
          return;
        }
        if (status === 'Failed' || status === 'Expired' || status === 'Cancelled') {
          showFailed();
          return;
        }
        // Pending — reconcile once we know the ids.
        if (intent.id && intent.bookingId) {
          fetch(
            `/api/guest/deposit/${intent.bookingId}/intent/${intent.id}?payToken=${encodeURIComponent(payToken)}&reconcile=true`,
            { headers: { Accept: 'application/json' } }).catch(() => {});
        }
      } else if (res.status === 404 && result === 'failed') {
        showFailed();
        return;
      }
    } catch {
      /* transient — keep polling */
    }
    if (statusEl) {
      statusEl.textContent = t('depositReturn.working');
    }
    setTimeout(() => void poll(), POLL_MS);
  }

  if (!reference || !payToken) {
    showFailed();
    return;
  }
  if (result === 'failed' && !intent) {
    // Still poll — webhook may land even after a failed redirect.
    if (statusEl) statusEl.textContent = t('depositReturn.working');
  }
  void poll();
})();
