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
        // Flag the destination surface so it can cover its own first paint
        // and play the shared exit animation (guest → admin handoff). The
        // label travels too so the arrival loader keeps the same message.
        try {
            window.sessionStorage?.setItem('mori-surface-arrive', '1');
            window.sessionStorage?.setItem('mori-surface-label', label);
        } catch (e) { /* storage unavailable */ }
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

    // Arrival handoff: _Layout pre-renders #adminPageLoader and its inline head
    // script adds .mori-surface-arrival before first paint, so this surface is
    // already covered — play the shared exit animation instead of a hard cut.
    const arrival = document.getElementById('adminPageLoader');
    if (arrival && document.documentElement.classList.contains('mori-surface-arrival')) {
        const MIN_VISIBLE_MS = 500;
        const EXIT_MS = 780;
        const MAX_WAIT_MS = 6000;
        const startedAt = performance.now();
        // Keep the departing overlay's message so the text doesn't swap mid-handoff.
        const label = document.documentElement.getAttribute('data-surface-label');
        if (label) {
            const status = arrival.querySelector('.guest-page-loader-status span.is-active');
            if (status) status.textContent = label;
        }
        arrival.removeAttribute('hidden');
        document.documentElement.style.overflow = 'hidden';
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            arrival.remove();
            document.documentElement.style.overflow = '';
            document.documentElement.classList.remove('mori-surface-arrival');
            document.documentElement.removeAttribute('data-surface-label');
        };
        let dismissed = false;
        const dismiss = () => {
            if (dismissed) return;
            dismissed = true;
            const remain = Math.max(0, MIN_VISIBLE_MS - (performance.now() - startedAt));
            window.setTimeout(() => {
                arrival.classList.add('is-leaving');
                arrival.setAttribute('aria-busy', 'false');
                arrival.addEventListener('animationend', (event) => {
                    if (event.target === arrival) finish();
                }, { once: true });
                window.setTimeout(finish, EXIT_MS);
            }, remain);
        };
        if (document.readyState === 'complete') dismiss();
        else {
            window.addEventListener('load', dismiss, { once: true });
            window.setTimeout(dismiss, MAX_WAIT_MS);
        }
    }
})();
