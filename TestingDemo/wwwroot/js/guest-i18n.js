(() => {
  const STORAGE_KEY = 'moriGuestLang';
  /** Bump when locale JSON keys change so browsers fetch fresh files. */
  const LOCALES_VERSION = '2026-08-16-booking-i18n-2';
  const LOCALES = [
    { code: 'en', label: 'English', native: 'English' },
    { code: 'ja', label: '日本語', native: '日本語' },
    { code: 'ru', label: 'Русский', native: 'Русский' },
    { code: 'ko', label: '한국어', native: '한국어' },
    { code: 'zh-Hans', label: '中文 (简体)', native: '中文 (简体)' },
  ];

  /** @type {Record<string, any>} */
  const cache = {};
  /** @type {Record<string, string>} */
  const cacheVersion = {};
  let current = 'en';
  let dict = null;
  let applying = false;

  const popup = document.querySelector('[data-guest-lang-popup]');
  const navSlot = document.querySelector('[data-guest-lang-nav]');
  const html = document.documentElement;

  function getByPath(obj, path) {
    return String(path || '')
      .split('.')
      .reduce((acc, key) => (acc && acc[key] != null ? acc[key] : undefined), obj);
  }

  function format(template, params = {}) {
    return String(template ?? '').replace(/\{(\w+)\}/g, (_, key) =>
      params[key] != null ? String(params[key]) : `{${key}}`
    );
  }

  function t(key, params) {
    const value = getByPath(dict, key) ?? getByPath(cache.en, key) ?? key;
    return typeof value === 'string' ? format(value, params) : key;
  }

  async function loadLocale(code) {
    if (cache[code] && cacheVersion[code] === LOCALES_VERSION) return cache[code];
    // Bust HTTP cache so newly added translation keys are picked up after deploys.
    const url = `/locales/${encodeURIComponent(code)}.json?v=${encodeURIComponent(LOCALES_VERSION)}`;
    const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error(`Locale ${code} failed`);
    const json = await res.json();
    cache[code] = json;
    cacheVersion[code] = LOCALES_VERSION;
    return json;
  }

  function parseParams(el) {
    const raw = el.getAttribute('data-i18n-params');
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function applyElement(el) {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const params = parseParams(el);
    const text = t(key, params);
    const attr = el.getAttribute('data-i18n-attr');
    if (attr) {
      attr.split(',').forEach((name) => {
        const trimmed = name.trim();
        if (trimmed) el.setAttribute(trimmed, text);
      });
      if (!el.hasAttribute('data-i18n-attr-only')) {
        if (!el.children.length) el.textContent = text;
      }
      return;
    }
    if (el.children.length) {
      // Prefer updating first text node to keep nested markup.
      const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (node) node.textContent = text;
      else el.textContent = text;
    } else {
      el.textContent = text;
    }
  }

  function applyAvailabilityBadges() {
    document.querySelectorAll('[data-i18n-available]').forEach((el) => {
      const n = Number(el.getAttribute('data-i18n-available') || el.getAttribute('data-available') || 0);
      el.textContent = n > 0 ? t('rooms.nAvailable', { n }) : t('rooms.fullyBooked');
      el.classList.toggle('is-sold-out', n <= 0);
    });
  }

  function applyGuestMeta() {
    document.querySelectorAll('[data-i18n-up-to]').forEach((el) => {
      const n = Number(el.getAttribute('data-i18n-up-to') || 0);
      el.textContent = t('rooms.upToGuests', { n });
    });
    document.querySelectorAll('[data-i18n-beds]').forEach((el) => {
      const n = Number(el.getAttribute('data-i18n-beds') || 0);
      el.textContent = n === 1 ? t('rooms.bed', { n }) : t('rooms.beds', { n });
    });
    document.querySelectorAll('[data-i18n-more]').forEach((el) => {
      const n = Number(el.getAttribute('data-i18n-more') || 0);
      el.textContent = t('rooms.more', { n });
    });
    document.querySelectorAll('[data-i18n-types-meta]').forEach((el) => {
      const types = Number(el.getAttribute('data-types') || 0);
      const available = Number(el.getAttribute('data-available-types') || 0);
      const key = types === 1 ? 'rooms.metaTypesAvailable' : 'rooms.metaTypesAvailablePlural';
      el.textContent = t(key, { types, available });
    });
    document.querySelectorAll('[data-i18n-photo-count]').forEach((el) => {
      const n = Number(el.getAttribute('data-i18n-photo-count') || 0);
      el.textContent = `${n} ${n === 1 ? t('home.photo') : t('home.photos')}`;
    });
  }

  function applyPage() {
    if (!dict || applying) return;
    applying = true;
    try {
      html.lang = dict.meta?.code || current;
      html.dir = dict.meta?.dir || 'ltr';
      document.querySelectorAll('[data-i18n]').forEach(applyElement);
      applyAvailabilityBadges();
      applyGuestMeta();
      syncNavControl();
      document.dispatchEvent(
        new CustomEvent('mori:langchange', { detail: { lang: current, t } })
      );
    } finally {
      applying = false;
    }
  }

  function buildLangOptions(container, { name, selected, onPick }) {
    container.replaceChildren();
    LOCALES.forEach((locale) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `guest-lang-option${locale.code === selected ? ' is-active' : ''}`;
      btn.setAttribute('data-lang', locale.code);
      btn.setAttribute('aria-pressed', locale.code === selected ? 'true' : 'false');
      btn.innerHTML = `<span class="guest-lang-option-native">${locale.native}</span>`;
      btn.addEventListener('click', () => onPick(locale.code, btn));
      container.append(btn);
    });
    if (name) container.setAttribute('role', 'listbox');
  }

  function syncNavControl() {
    if (!navSlot) return;
    let control = navSlot.querySelector('[data-guest-lang-control]');
    if (!control) {
      control = document.createElement('div');
      control.className = 'guest-lang-control';
      control.setAttribute('data-guest-lang-control', '1');
      control.innerHTML = `
        <button type="button" class="guest-lang-control-btn" data-guest-lang-toggle aria-haspopup="listbox" aria-expanded="false">
          <span class="guest-lang-control-label" data-guest-lang-label></span>
          <span class="guest-lang-control-chevron" aria-hidden="true">▾</span>
        </button>
        <div class="guest-lang-control-menu" data-guest-lang-menu hidden></div>
      `;
      navSlot.append(control);

      const toggle = control.querySelector('[data-guest-lang-toggle]');
      const menu = control.querySelector('[data-guest-lang-menu]');
      toggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = menu?.hidden;
        if (menu) menu.hidden = !open;
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('click', (e) => {
        if (!control.contains(e.target)) {
          if (menu) menu.hidden = true;
          toggle?.setAttribute('aria-expanded', 'false');
        }
      });
    }

    const label = control.querySelector('[data-guest-lang-label]');
    const menu = control.querySelector('[data-guest-lang-menu]');
    const active = LOCALES.find((l) => l.code === current) || LOCALES[0];
    if (label) label.textContent = active.native;
    if (menu) {
      buildLangOptions(menu, {
        selected: current,
        onPick: async (code) => {
          menu.hidden = true;
          await setLanguage(code, { animateFrom: null });
        },
      });
    }
  }

  async function setLanguage(code, { animateFrom = null, persist = true } = {}) {
    const next = LOCALES.some((l) => l.code === code) ? code : 'en';
    if (persist) localStorage.setItem(STORAGE_KEY, next);
    current = next;
    if (next === 'en') {
      dict = cache.en || (await loadLocale('en'));
      cache.en = dict;
    } else {
      if (!cache.en) cache.en = await loadLocale('en');
      dict = await loadLocale(next);
    }
    applyPage();
    if (animateFrom && navSlot) {
      await animateToNav(animateFrom);
    }
  }

  function animateToNav(fromEl) {
    const target = navSlot?.querySelector('[data-guest-lang-control-btn], .guest-lang-control-btn');
    if (!fromEl || !target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return Promise.resolve();
    }
    const from = fromEl.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const clone = fromEl.cloneNode(true);
    clone.classList.add('guest-lang-fly');
    clone.style.cssText = `
      position: fixed; top: ${from.top}px; left: ${from.left}px;
      width: ${from.width}px; height: ${from.height}px; margin: 0; z-index: 2400;
      pointer-events: none; transition: transform 420ms cubic-bezier(.22,.8,.28,1), opacity 420ms ease;
    `;
    document.body.append(clone);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const sx = Math.max(0.35, to.width / from.width);
    const sy = Math.max(0.35, to.height / from.height);
    requestAnimationFrame(() => {
      clone.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      clone.style.opacity = '0.15';
    });
    return new Promise((resolve) => {
      window.setTimeout(() => {
        clone.remove();
        resolve();
      }, 440);
    });
  }

  function hidePopup() {
    if (!popup) return;
    popup.classList.add('is-leaving');
    window.setTimeout(() => {
      popup.hidden = true;
      popup.classList.remove('is-leaving');
      document.body.classList.remove('guest-lang-popup-open');
    }, 280);
  }

  function showPopup() {
    if (!popup) return;
    document.body.classList.add('guest-lang-popup-open');
    popup.hidden = false;
    const options = popup.querySelector('[data-guest-lang-options]');
    const continueBtn = popup.querySelector('[data-guest-lang-continue]');
    let pending = current || 'en';
    buildLangOptions(options, {
      selected: pending,
      onPick: (code, btn) => {
        pending = code;
        options?.querySelectorAll('.guest-lang-option').forEach((el) => {
          const active = el.getAttribute('data-lang') === code;
          el.classList.toggle('is-active', active);
          el.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        btn?.focus();
      },
    });
    continueBtn?.addEventListener(
      'click',
      async () => {
        const activeBtn = options?.querySelector(`.guest-lang-option[data-lang="${pending}"]`);
        continueBtn.disabled = true;
        await setLanguage(pending, { animateFrom: activeBtn });
        hidePopup();
        continueBtn.disabled = false;
      },
      { once: true }
    );
    continueBtn?.focus();
  }

  async function boot() {
    try {
      cache.en = await loadLocale('en');
    } catch {
      return;
    }
    dict = cache.en;
    const saved = localStorage.getItem(STORAGE_KEY);
    const known = LOCALES.some((l) => l.code === saved);

    syncNavControl();

    if (known && saved) {
      try {
        await setLanguage(saved, { persist: false });
      } catch {
        await setLanguage('en', { persist: true });
      }
      if (popup) popup.hidden = true;
      return;
    }

    applyPage();
    showPopup();
  }

  window.MoriI18n = {
    t: (key, params) => t(key, params),
    getLang: () => current,
    setLang: (code) => setLanguage(code),
    apply: () => applyPage(),
    translateInclusionCategory: (name) => {
      const mapped = getByPath(dict, `inclusionCategories.${name}`);
      return typeof mapped === 'string' ? mapped : name;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void boot());
  } else {
    void boot();
  }
})();
