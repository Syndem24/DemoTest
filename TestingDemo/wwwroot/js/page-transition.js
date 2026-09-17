/* Surface transition loader — shows the shared Mori page loader while the
   browser navigates between the admin and guest surfaces. Trigger by adding
   data-surface-exit (optionally data-loader-text="…") to a link or form. */
(() => {
    const SELECTOR = '[data-surface-exit]';
    let overlay = null;

    const logoUrl = document.querySelector('link[rel="icon"]')?.href || '/Images/Logo.png';

    const buildOverlay = (label) => {
        const el = document.createElement('div');
        el.className = 'guest-page-loader is-transition';
        el.id = 'pageTransitionLoader';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-busy', 'true');

        const inner = document.createElement('div');
        inner.className = 'guest-page-loader-inner';
        inner.innerHTML = `
            <div class="guest-page-loader-orbit" aria-hidden="true">
                <span class="guest-page-loader-ring"></span>
                <span class="guest-page-loader-mark">
                    <img src="${logoUrl}" alt="" class="guest-page-loader-logo" />
                </span>
            </div>
            <p class="guest-page-loader-brand">Mori International Hotel</p>
            <p class="guest-page-loader-status"><span class="is-active"></span></p>
            <div class="guest-page-loader-bar" aria-hidden="true">
                <span class="guest-page-loader-bar-fill"></span>
            </div>`;
        inner.querySelector('.guest-page-loader-status span').textContent = label;
        el.appendChild(inner);
        return el;
    };

    const show = (trigger) => {
        if (overlay) return;
        const label = trigger.getAttribute('data-loader-text') || 'Loading…';
        overlay = buildOverlay(label);
        document.body.appendChild(overlay);
        document.documentElement.style.overflow = 'hidden';
    };

    document.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0
            || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest?.(`a${SELECTOR}`);
        if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
        show(link);
    });

    document.addEventListener('submit', (event) => {
        if (event.defaultPrevented) return;
        const form = event.target.closest?.(`form${SELECTOR}`);
        if (form) show(form);
    });

    // If the page is restored from bfcache (Back button), drop the overlay
    window.addEventListener('pageshow', (event) => {
        if (event.persisted && overlay) {
            overlay.remove();
            overlay = null;
            document.documentElement.style.overflow = '';
        }
    });
})();
