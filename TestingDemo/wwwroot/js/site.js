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
  if (!menu) return;

  const toggle = menu.querySelector('[data-profile-toggle]');
  const panel = menu.querySelector('[data-profile-panel]');
  if (!toggle || !panel) return;

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
    if (event.key === 'Escape') setOpen(false);
  });
});
