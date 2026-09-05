// Please see documentation at https://learn.microsoft.com/aspnet/core/client-side/bundling-and-minification
// for details on configuring this project to bundle and minify static web assets.

/**
 * Full-screen feedback while PDF data export runs (history / payments).
 * Prevents the UI from looking frozen during long softcopy generation.
 */
window.setAdminExportLoading = function setAdminExportLoading(visible, options = {}) {
  const overlay = document.querySelector('[data-admin-export-loading]');
  if (!overlay) return;

  const titleEl = overlay.querySelector('[data-admin-export-loading-title]');
  const detailEl = overlay.querySelector('[data-admin-export-loading-detail]');
  const title = options.title || 'Exporting data…';
  const detail = options.detail || 'Building PDF softcopy — please wait.';

  if (titleEl) titleEl.textContent = title;
  if (detailEl) detailEl.textContent = detail;

  overlay.hidden = !visible;
  document.body.classList.toggle('is-exporting', Boolean(visible));
  document.body.setAttribute('aria-busy', visible ? 'true' : 'false');

  if (visible) {
    overlay.querySelector('.admin-export-loading-card')?.focus?.();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const menu = document.querySelector('[data-profile-menu]');
  if (menu) {
    const toggle = menu.querySelector('[data-profile-toggle]');
    const panel = menu.querySelector('[data-profile-panel]');
    if (toggle && panel) {
      const setOpen = (open) => {
        panel.hidden = !open;
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      };

      toggle.addEventListener('click', (event) => {
        event.preventDefault();
        setOpen(panel.hidden);
      });

      document.addEventListener('click', (event) => {
        if (menu.contains(event.target)) return;
        setOpen(false);
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape'
          && !document.querySelector('[data-logout-shift-confirm]:not([hidden])')
          && !document.querySelector('[data-shift-start-nudge]:not([hidden])')) {
          setOpen(false);
        }
      });
    }
  }

  initLogoutShiftConfirm();
  initShiftStartNudge();
});

/**
 * Soft desk reminder after login when nobody has an open shift.
 * Dismiss by clicking outside the card (backdrop).
 */
function initShiftStartNudge() {
  const root = document.querySelector('[data-shift-start-nudge]');
  if (!root) return;

  const dismiss = () => {
    root.hidden = true;
  };

  root.querySelectorAll('[data-shift-start-nudge-dismiss]').forEach((btn) => {
    btn.addEventListener('click', dismiss);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !root.hidden) {
      event.preventDefault();
      dismiss();
    }
  });

  void (async () => {
    try {
      const res = await fetch('/api/admin/shifts/desk', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.anyoneOnShift) return;
      root.hidden = false;
      root.querySelector('.admin-shift-btn-primary')?.focus?.();
    } catch {
      /* soft nudge — ignore network errors */
    }
  })();
}

/**
 * If staff still have an open desk shift, ask before logging out:
 * end shift, keep it open, or cancel.
 */
function initLogoutShiftConfirm() {
  const form = document.querySelector('[data-admin-logout-form]');
  const overlay = document.querySelector('[data-logout-shift-confirm]');
  if (!form || !overlay) return;

  const bodyEl = overlay.querySelector('[data-logout-shift-body]');
  const endBtn = overlay.querySelector('[data-logout-shift-end]');
  const keepBtn = overlay.querySelector('[data-logout-shift-keep]');
  const token =
    document.querySelector('#adminAntiForgery input[name="__RequestVerificationToken"]')?.value
    || form.querySelector('input[name="__RequestVerificationToken"]')?.value
    || '';

  /** @type {any} */
  let openShift = null;
  let bypassConfirm = false;
  let busy = false;

  const phTime = (iso) => {
    if (!iso) return '';
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

  const closeOverlay = () => {
    overlay.hidden = true;
    openShift = null;
    busy = false;
    if (endBtn) endBtn.disabled = false;
    if (keepBtn) keepBtn.disabled = false;
  };

  const submitLogout = () => {
    bypassConfirm = true;
    closeOverlay();
    form.requestSubmit();
  };

  const setBusy = (value) => {
    busy = value;
    if (endBtn) endBtn.disabled = value;
    if (keepBtn) keepBtn.disabled = value;
  };

  form.addEventListener('submit', async (event) => {
    if (bypassConfirm) return;
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/shifts/current', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!res.ok) {
        submitLogout();
        return;
      }
      openShift = await res.json();
      if (!openShift || !openShift.isOpen) {
        submitLogout();
        return;
      }
      if (bodyEl) {
        const started = phTime(openShift.startedAtUtc);
        bodyEl.textContent = started
          ? `You still have an open desk shift (started ${started}). End it now, or keep it open and log out?`
          : 'You still have an open desk shift. End it now, or keep it open and log out?';
      }
      overlay.hidden = false;
      endBtn?.focus();
    } catch {
      submitLogout();
    } finally {
      setBusy(false);
    }
  });

  endBtn?.addEventListener('click', async () => {
    if (!openShift?.id || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/shifts/${openShift.id}/end`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          RequestVerificationToken: token,
        },
        credentials: 'same-origin',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        let message = 'Unable to end shift.';
        try {
          const body = await res.json();
          message = body.message || body.title || message;
        } catch {
          /* ignore */
        }
        if (typeof window.showMoriNotice === 'function') {
          window.showMoriNotice(message, 'error');
        } else {
          window.alert(message);
        }
        setBusy(false);
        return;
      }
      submitLogout();
    } catch {
      if (typeof window.showMoriNotice === 'function') {
        window.showMoriNotice('Unable to end shift.', 'error');
      }
      setBusy(false);
    }
  });

  keepBtn?.addEventListener('click', () => {
    if (busy) return;
    submitLogout();
  });

  overlay.querySelectorAll('[data-logout-shift-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (busy) return;
      closeOverlay();
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.hidden) {
      event.preventDefault();
      if (!busy) closeOverlay();
    }
  });
}
