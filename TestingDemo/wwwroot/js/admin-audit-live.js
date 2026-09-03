(function () {
  'use strict';

  const panel = document.querySelector('[data-audit-live]');
  if (!panel) return;

  const apiUrl = panel.getAttribute('data-audit-api') || '/api/admin/audit/recent';
  const tbody = panel.querySelector('[data-audit-tbody]');
  const totalEl = document.querySelector('[data-audit-total]');
  const pageCountEl = document.querySelector('[data-audit-page-count]');
  const searchInput = panel.querySelector('[data-audit-search-input]');
  const PH_TZ = 'Asia/Manila';
  const PH_LOCALE = 'en-PH';
  const POLL_MS = 15000;
  const NEW_ROW_MS = 2600;

  let topAuditId = 0;
  let pollTimer = 0;
  let refreshing = false;

  function readPage() {
    const params = new URLSearchParams(window.location.search);
    const page = Number(params.get('page') || 1);
    return Number.isFinite(page) && page > 0 ? page : 1;
  }

  function readDomain() {
    const params = new URLSearchParams(window.location.search);
    const domain = params.get('domain');
    return domain && domain.trim() ? domain.trim() : '';
  }

  function rowId(row) {
    const id = row?.id ?? row?.Id;
    const n = Number(id);
    return Number.isFinite(n) ? n : 0;
  }

  function syncTopAuditIdFromDom() {
    if (!tbody) return;
    let max = 0;
    tbody.querySelectorAll('[data-audit-id]').forEach((tr) => {
      const n = Number(tr.getAttribute('data-audit-id'));
      if (Number.isFinite(n) && n > max) max = n;
    });
    topAuditId = max;
  }

  function formatStamp(value) {
    if (!value) return '—';
    const raw = String(value).trim();
    const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
    const iso = hasZone || !/T/.test(raw) ? raw : `${raw}Z`;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(PH_LOCALE, {
      timeZone: PH_TZ,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  function reasonText(row) {
    const reason = row.reason ?? row.Reason;
    if (reason && String(reason).trim()) return String(reason);
    return String(row.summary ?? row.Summary ?? '');
  }

  function buildRow(row) {
    const tr = document.createElement('tr');
    const id = rowId(row);
    if (id > 0) tr.setAttribute('data-audit-id', String(id));

    const atUtc = row.atUtc ?? row.AtUtc;
    const domainLabel = row.domainLabel ?? row.DomainLabel ?? '';
    const action = row.action ?? row.Action ?? '';
    const actor = row.actorDisplayName ?? row.ActorDisplayName ?? '';
    const targetLabel = row.targetLabel ?? row.TargetLabel ?? '';
    const targetType = row.targetType ?? row.TargetType ?? '';
    const reason = reasonText(row);

    const whenTd = document.createElement('td');
    whenTd.setAttribute('data-label', 'When (PH)');
    const time = document.createElement('time');
    if (atUtc) time.setAttribute('datetime', String(atUtc));
    time.textContent = formatStamp(atUtc);
    whenTd.append(time);

    const areaTd = document.createElement('td');
    areaTd.setAttribute('data-label', 'Area');
    areaTd.title = domainLabel;
    areaTd.textContent = domainLabel;

    const actionTd = document.createElement('td');
    actionTd.setAttribute('data-label', 'Action');
    actionTd.title = action;
    actionTd.textContent = action;

    const actorTd = document.createElement('td');
    actorTd.setAttribute('data-label', 'Actor');
    actorTd.title = actor;
    actorTd.textContent = actor;

    const targetTd = document.createElement('td');
    targetTd.setAttribute('data-label', 'Target');
    targetTd.title = targetLabel;
    const targetStrong = document.createElement('strong');
    targetStrong.textContent = targetLabel;
    const targetSmall = document.createElement('small');
    targetSmall.textContent = targetType;
    targetTd.append(targetStrong, targetSmall);

    const reasonTd = document.createElement('td');
    reasonTd.setAttribute('data-label', 'Reason / summary');
    reasonTd.title = reason;
    reasonTd.textContent = reason;

    tr.append(whenTd, areaTd, actionTd, actorTd, targetTd, reasonTd);
    return tr;
  }

  function flashRow(tr) {
    tr.classList.add('admin-audit-row-new');
    window.setTimeout(() => tr.classList.remove('admin-audit-row-new'), NEW_ROW_MS);
  }

  function updateCounts(total, visibleCount) {
    if (totalEl) totalEl.textContent = String(total);
    if (pageCountEl) pageCountEl.textContent = String(visibleCount);
  }

  function prependRows(rows) {
    if (!tbody || rows.length === 0) return 0;
    let added = 0;
    rows
      .slice()
      .reverse()
      .forEach((row) => {
        const id = rowId(row);
        if (id > 0 && tbody.querySelector(`[data-audit-id="${id}"]`)) return;
        const tr = buildRow(row);
        flashRow(tr);
        tbody.prepend(tr);
        added += 1;
      });
    return added;
  }

  async function refreshAudit(forceFull) {
    if (!tbody || readPage() !== 1) return;
    if (refreshing) return;
    refreshing = true;

    const q = (searchInput?.value || '').trim();
    const domain = readDomain();
    const url = new URL(apiUrl, window.location.origin);
    url.searchParams.set('page', '1');
    if (q) url.searchParams.set('q', q);
    if (domain) url.searchParams.set('domain', domain);

    try {
      const response = await fetch(url.toString(), {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const payload = await response.json();
      const items = payload.items ?? payload.Items ?? [];
      const total = Number(payload.total ?? payload.Total ?? 0);
      const pageSize = Number(payload.pageSize ?? payload.PageSize ?? 15);
      const newestId = items.length > 0 ? rowId(items[0]) : 0;

      if (
        !forceFull
        && topAuditId > 0
        && newestId > topAuditId
        && items.length > 0
      ) {
        const fresh = items.filter((row) => rowId(row) > topAuditId);
        const added = prependRows(fresh);
        if (added > 0) {
          topAuditId = newestId;
          updateCounts(total, tbody.children.length);
          return;
        }
      }

      tbody.replaceChildren();
      items.forEach((row) => tbody.append(buildRow(row)));
      topAuditId = newestId;
      updateCounts(total, items.length);
    } catch {
      /* keep current rows */
    } finally {
      refreshing = false;
    }
  }

  function scheduleRefresh(forceFull) {
    if (window.MoriAdminRealtime) {
      window.MoriAdminRealtime.scheduleRefresh(
        'audit',
        () => refreshAudit(forceFull),
        180,
      );
    } else {
      void refreshAudit(forceFull);
    }
  }

  function shouldRefresh(scopes) {
    return scopes.includes('all') || scopes.includes('audit');
  }

  window.addEventListener('mori:admin-refresh', (event) => {
    const scopes = event.detail?.scopes || [];
    if (!shouldRefresh(scopes)) return;
    scheduleRefresh(false);
  });

  syncTopAuditIdFromDom();
  pollTimer = window.setInterval(() => scheduleRefresh(false), POLL_MS);

  if (window.MoriAdminRealtime) {
    window.MoriAdminRealtime.start();
  }
})();
