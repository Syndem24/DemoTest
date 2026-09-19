     (() => {
  const html = document.documentElement;
  const loader = document.getElementById('guestPageLoader');
  if (!loader) {
    html.classList.remove('guest-is-loading');
    return;
  }

  const isSurfaceArrival = html.classList.contains('mori-surface-arrival');
  const MIN_VISIBLE_MS = isSurfaceArrival ? 450 : 900;
  const MAX_WAIT_MS = 8000;
  const EXIT_MS = 780;
  const LINE_MS = 2200;
  const startedAt = performance.now();
  let dismissed = false;
  let lineTimer = 0;

  const statusLines = Array.from(loader.querySelectorAll('.guest-page-loader-status span'));

  // Arriving from the staff side: keep the departing overlay's message so the
  // label doesn't swap mid-handoff. data-i18n is removed so the translator
  // doesn't overwrite it.
  const arrivalLabel = html.getAttribute('data-surface-label');
  if (arrivalLabel && statusLines.length) {
    const active = statusLines.find((line) => line.classList.contains('is-active')) || statusLines[0];
    active.textContent = arrivalLabel;
    active.removeAttribute('data-i18n');
    html.removeAttribute('data-surface-label');
  }
  const rotateWelcome = () => {
    if (statusLines.length < 2) return;
    let index = Math.max(0, statusLines.findIndex((line) => line.classList.contains('is-active')));
    lineTimer = window.setInterval(() => {
      statusLines[index].classList.remove('is-active');
      index = (index + 1) % statusLines.length;
      statusLines[index].classList.add('is-active');
    }, LINE_MS);
  };
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    rotateWelcome();
  }

  const finishRemove = () => {
    if (!loader.isConnected) return;
    loader.remove();
  };

  const playExit = () => {
    if (dismissed) return;
    dismissed = true;

    const remain = Math.max(0, MIN_VISIBLE_MS - (performance.now() - startedAt));
    window.setTimeout(() => {
      if (lineTimer) window.clearInterval(lineTimer);
      loader.classList.add('is-leaving');
      loader.setAttribute('aria-busy', 'false');
      html.classList.remove('guest-is-loading');
      html.classList.remove('mori-surface-arrival');
      document.body?.classList.remove('guest-is-loading');
      document.dispatchEvent(new CustomEvent('mori:guestchrome', { detail: { reason: 'page-loader-done' } }));

      const onEnd = (event) => {
        if (event.target !== loader) return;
        loader.removeEventListener('animationend', onEnd);
        finishRemove();
      };
      loader.addEventListener('animationend', onEnd);
      window.setTimeout(finishRemove, EXIT_MS);
    }, remain);
  };

  const pageReady = new Promise((resolve) => {
    if (document.readyState === 'complete') {
      resolve();
      return;
    }
    window.addEventListener('load', () => resolve(), { once: true });
  });

  const fontsReady = document.fonts?.ready ?? Promise.resolve();

  Promise.race([
    Promise.all([pageReady, fontsReady]),
    new Promise((resolve) => window.setTimeout(resolve, MAX_WAIT_MS)),
  ]).then(playExit);

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) playExit();
  });
})();
