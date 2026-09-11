(() => {
  const COOKIE_NAME = 'mori_cookie_consent';
  const STORAGE_KEY = 'mori.cookieConsent';
  const MAX_AGE = 60 * 60 * 24 * 180;
  const DRAFT_KEYS = ['mori.wizStayDraft', 'mori.guestBookDraft'];
  const banner = document.querySelector('[data-guest-cookies]');
  if (!banner) return;

  const inner = banner.querySelector('.guest-cookies-inner');
  let heightObserver = null;
  let pendingShow = false;

  function readConsent() {
    const match = document.cookie.match(/(?:^|;\s*)mori_cookie_consent=(all|necessary)(?:;|$)/);
    if (match) return match[1];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'all' || stored === 'necessary') return stored;
    } catch {
      /* private mode */
    }
    return '';
  }

  function clearOptionalDrafts() {
    DRAFT_KEYS.forEach((key) => {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* private mode */
      }
    });
  }

  function allowsOptionalStorage(value = window.moriCookieConsent) {
    return value === 'all';
  }

  function writeConsent(value) {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE_NAME}=${value}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* private mode */
    }
    window.moriCookieConsent = value;
    if (!allowsOptionalStorage(value)) {
      clearOptionalDrafts();
    }
    document.dispatchEvent(
      new CustomEvent('mori:cookieconsent', {
        detail: { consent: value, allowsOptionalStorage: allowsOptionalStorage(value) },
      })
    );
  }

  function syncPad(on) {
    const html = document.documentElement;
    if (!on) {
      html.classList.remove('guest-cookies-on');
      html.style.removeProperty('--guest-cookie-h');
      return;
    }
    const height = Math.ceil(banner.getBoundingClientRect().height);
    html.style.setProperty('--guest-cookie-h', `${height}px`);
    html.classList.add('guest-cookies-on');
  }

  function hideBanner() {
    pendingShow = false;
    banner.hidden = true;
    banner.setAttribute('aria-hidden', 'true');
    if (heightObserver) {
      heightObserver.disconnect();
      heightObserver = null;
    }
    syncPad(false);
  }

  function showBanner() {
    banner.hidden = false;
    banner.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      syncPad(true);
      if (typeof ResizeObserver === 'function' && !heightObserver) {
        heightObserver = new ResizeObserver(() => {
          if (!banner.hidden) syncPad(true);
        });
        heightObserver.observe(inner || banner);
      }
    });
  }

  function chromeReady() {
    const loader = document.getElementById('guestPageLoader');
    const loaderBusy = Boolean(loader && loader.isConnected && !loader.classList.contains('is-leaving'));
    return !loaderBusy && !document.body.classList.contains('guest-lang-popup-open');
  }

  function maybeShow(attempt = 0) {
    if (readConsent()) {
      hideBanner();
      return;
    }
    if (!chromeReady()) {
      pendingShow = true;
      if (attempt < 80) {
        window.setTimeout(() => maybeShow(attempt + 1), 200);
      }
      return;
    }
    pendingShow = false;
    showBanner();
  }

  banner.querySelector('[data-guest-cookies-accept]')?.addEventListener('click', () => {
    writeConsent('all');
    hideBanner();
  });
  banner.querySelector('[data-guest-cookies-reject]')?.addEventListener('click', () => {
    writeConsent('necessary');
    hideBanner();
  });

  document.querySelectorAll('[data-guest-cookies-open]').forEach((el) => {
    el.addEventListener('click', () => showBanner());
  });

  document.addEventListener('mori:guestchrome', () => {
    if (pendingShow || !readConsent()) maybeShow(0);
  });

  window.moriCookieConsent = readConsent() || '';
  window.moriAllowsOptionalStorage = () => allowsOptionalStorage();
  window.moriClearOptionalDrafts = clearOptionalDrafts;

  if (!allowsOptionalStorage(window.moriCookieConsent)) {
    clearOptionalDrafts();
  }

  maybeShow();
})();
