/* Reading progress bar for the legal pages (Terms / Privacy).
   Fills a fixed bar pinned just under the sticky site nav via
   transform: scaleX() so updates stay on the compositor;
   rAF-throttled scroll + resize listeners. */
(() => {
    const track = document.querySelector('.guest-legal-progress');
    const bar = track?.querySelector('.guest-legal-progress-bar');
    if (!track || !bar) return;

    const nav = document.querySelector('.guest-nav');
    const root = document.documentElement;
    let ticking = false;

    const update = () => {
        ticking = false;
        if (nav) {
            track.style.top = `${Math.max(0, nav.getBoundingClientRect().bottom)}px`;
        }
        const max = root.scrollHeight - root.clientHeight;
        const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        bar.style.transform = `scaleX(${progress})`;
    };

    const requestUpdate = () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(update);
        }
    };

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    update();
})();
