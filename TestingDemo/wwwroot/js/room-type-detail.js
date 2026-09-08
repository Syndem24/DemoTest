(() => {
  const root = document.querySelector('[data-room-detail-root]');
  const detail = document.querySelector('[data-wiz-detail-sheet]');
  const detailBack = document.querySelector('[data-wiz-detail-back]');
  if (!root || !detail) return;

  const INCLUSION_CATALOG = [
    { label: 'Video and audio', items: ['Smart TV'] },
    { label: 'Internet', items: ['Wi-Fi'] },
    { label: 'Electronic', items: ['air conditioning', 'electronic lock', 'heater', 'desk lamp'] },
    { label: 'Bathroom', items: ['toiletries', 'bath towels'] },
    { label: 'View', items: ['city view', 'no window'] },
  ];
  const DEFAULT_INCLUSION_SET = new Set(
    INCLUSION_CATALOG.flatMap((cat) => cat.items.map((item) => item.toLowerCase()))
  );

  let lastFocus = null;
  let galleryImages = [];
  let galleryIndex = 0;
  let galleryName = '';
  let openCard = null;

  function t(key, params) {
    const fn = window.MoriI18n?.t;
    return typeof fn === 'function' ? fn(key, params) : key;
  }
  function catLabel(name) {
    return window.MoriI18n?.translateInclusionCategory?.(name) || name;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function parseJsonList(card, attr) {
    try {
      const list = JSON.parse(card.getAttribute(attr) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function displayAmenity(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (lower === 'wifi' || lower === 'wi-fi') return 'Wi-Fi';
    if (lower === 'smart tv' || lower === 'tv set') return 'Smart TV';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function amenityIcon(name) {
    const text = String(name || '').toLowerCase();
    if (text.includes('wifi') || text.includes('wi-fi')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 6.5a9 9 0 0 1 12 0M4.7 9.1a5.5 5.5 0 0 1 6.6 0M7.1 11.8a2.1 2.1 0 0 1 1.8 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="13.2" r="0.9" fill="currentColor"/></svg>';
    if (text.includes('tv')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="3" width="12" height="8" rx="1.3" stroke="currentColor" stroke-width="1.3"/><path d="M6.2 13h3.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    if (text.includes('lock') || text.includes('safe')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5.3 7V5.9A2.7 2.7 0 0 1 8 3.2a2.7 2.7 0 0 1 2.7 2.7V7" stroke="currentColor" stroke-width="1.3"/></svg>';
    if (text.includes('air') || text.includes('heater') || text.includes('lamp')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="3" width="12" height="3.8" rx="1.2" stroke="currentColor" stroke-width="1.3"/><path d="M4 9.2v3m4-3v3m4-3v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    if (text.includes('towel') || text.includes('toiletr') || text.includes('bath') || text.includes('toilet')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10v1.6A2.4 2.4 0 0 1 10.6 12H5.4A2.4 2.4 0 0 1 3 9.6V8z" stroke="currentColor" stroke-width="1.3"/><path d="M5 8V5.4A1.6 1.6 0 0 1 6.6 3.8H8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    if (text.includes('view') || text.includes('window')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1.2" stroke="currentColor" stroke-width="1.3"/><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.3"/></svg>';
    if (text.includes('chair') || text.includes('furniture')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 8.2h7V12M4.5 12v1.5M11.5 12v1.5M5.2 8.2V4.8h5.6v3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    if (text.includes('mirror')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="4.5" y="2.5" width="7" height="11" rx="3.5" stroke="currentColor" stroke-width="1.3"/></svg>';
    if (text.includes('water') || text.includes('bottle')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.2 5.2h3.6L11 13.2H5L6.2 5.2zM6.8 5.2V3.6h2.4v1.6" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.8" stroke="currentColor" stroke-width="1.3"/><path d="M8 5.2v2.9l1.8 1.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  }

  function groupAmenities(items) {
    const list = (items || []).map((item) => String(item).trim()).filter(Boolean);
    const selected = new Set(list.map((item) => item.toLowerCase()));
    const used = new Set();
    const groups = [];
    function take(candidates) {
      return (candidates || [])
        .filter((item) => selected.has(item.toLowerCase()) && !used.has(item.toLowerCase()))
        .map((item) => {
          used.add(item.toLowerCase());
          return list.find((entry) => entry.toLowerCase() === item.toLowerCase()) || item;
        });
    }
    const custom = take(list.filter((item) => !DEFAULT_INCLUSION_SET.has(item.toLowerCase())));
    if (custom.length) groups.push({ label: catLabel('Custom'), items: custom });
    INCLUSION_CATALOG.forEach((cat) => {
      const matched = take(cat.items);
      if (matched.length) groups.push({ label: catLabel(cat.label), items: matched });
    });
    return groups;
  }

  function formatDescription(text) {
    const raw = String(text || '').trim();
    if (!raw) return `<p>${t('wiz.defaultDesc')}</p>`;
    const numbered = raw.split(/(?=\d+\.\s)/).map((part) => part.trim()).filter(Boolean);
    if (numbered.length > 1) {
      return `<ol class="wiz-desc-list">${numbered
        .map((part) => `<li>${escapeHtml(part.replace(/^\d+\.\s*/, ''))}</li>`)
        .join('')}</ol>`;
    }
    return raw
      .split(/\n+/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => `<p>${escapeHtml(para)}</p>`)
      .join('');
  }

  function cardImageList(card) {
    const images = parseJsonList(card, 'data-images');
    const fallback = card.querySelector('.wiz-card-media img')?.getAttribute('src') || '';
    return images.length ? images : fallback ? [fallback] : [];
  }

  function renderAmenities(card) {
    const host = detail.querySelector('[data-wiz-detail-inclusions]');
    if (!host) return;
    const items = parseJsonList(card, 'data-inclusions');
    const groups = groupAmenities(items.length ? items : ['air conditioning', 'Wi-Fi']);
    if (!groups.length) {
      host.innerHTML = `<p class="wiz-amenity-empty">${t('wiz.noAmenities')}</p>`;
      return;
    }
    host.innerHTML = groups
      .map((group) => `<section class="wiz-amenity-group">
        <h3>${escapeHtml(group.label)}</h3>
        <ul>${group.items.map((item) => `<li><span class="wiz-amenity-icon">${amenityIcon(item)}</span><span>${escapeHtml(displayAmenity(item))}</span></li>`).join('')}</ul>
      </section>`)
      .join('');
  }

  function renderGallery(card, host) {
    galleryImages = cardImageList(card);
    galleryName = card.getAttribute('data-room-type') || t('wiz.guestRoom');
    galleryIndex = 0;
    if (!host) return;
    if (!galleryImages.length) {
      host.hidden = true;
      host.innerHTML = '';
      host.removeAttribute('data-count');
      return;
    }
    host.hidden = false;
    const visible = galleryImages.slice(0, 5);
    const extra = galleryImages.length - visible.length;
    host.setAttribute('data-count', String(visible.length));
    host.innerHTML = visible
      .map((src, index) => {
        const more = extra > 0 && index === visible.length - 1;
        const label = more
          ? t('wiz.viewAllPhotos', { n: galleryImages.length })
          : t('wiz.zoomPhoto', { name: galleryName, i: index + 1, total: galleryImages.length });
        return `<button type="button" class="wiz-bento-tile${index === 0 ? ' is-hero' : ''}${more ? ' is-more' : ''}" data-wiz-bento-index="${index}" aria-label="${escapeHtml(label)}"${more ? ` data-more="+${extra}"` : ''}>
          <img src="${escapeHtml(src)}" alt="${escapeHtml(t('wiz.photoN', { name: galleryName, n: index + 1 }))}" loading="${index === 0 ? 'eager' : 'lazy'}">
        </button>`;
      })
      .join('');
  }

  function openGalleryZoom() {
    if (!galleryImages.length || typeof window.openPhotoZoom !== 'function') return;
    const items = galleryImages.map((src, i) => ({
      src,
      alt: t('wiz.photoOf', { name: galleryName, i: i + 1, total: galleryImages.length }),
    }));
    window.openPhotoZoom(items, galleryIndex);
  }

  function openDetail(card) {
    lastFocus = document.activeElement;
    openCard = card;
    const title = detail.querySelector('[data-wiz-detail-title]');
    if (title) title.textContent = card.getAttribute('data-room-type') || '';
    const copy = detail.querySelector('[data-wiz-detail-copy]');
    if (copy) copy.innerHTML = formatDescription(card.getAttribute('data-description'));
    renderAmenities(card);
    renderGallery(card, detail.querySelector('[data-wiz-bento]'));
    const amenities = detail.querySelector('[data-wiz-acc="amenities"]');
    const description = detail.querySelector('[data-wiz-acc="description"]');
    if (amenities) amenities.open = true;
    if (description) description.open = false;
    document.body.classList.add('wiz-lock');
    if (detailBack) detailBack.hidden = false;
    detail.hidden = false;
    detail.querySelector('[data-wiz-detail-close]')?.focus();
  }

  function closeDetail() {
    openCard = null;
    detail.hidden = true;
    if (detailBack) detailBack.hidden = true;
    document.body.classList.remove('wiz-lock');
    lastFocus?.focus?.();
  }

  if (detail.dataset.accBound !== 'true') {
    detail.dataset.accBound = 'true';
    detail.querySelectorAll('.wiz-acc[data-wiz-acc]').forEach((acc) => {
      acc.addEventListener('toggle', () => {
        if (!acc.open) return;
        detail.querySelectorAll('.wiz-acc[data-wiz-acc]').forEach((other) => {
          if (other !== acc) other.open = false;
        });
      });
    });
  }

  detail.querySelector('[data-wiz-bento]')?.addEventListener('click', (event) => {
    const tile = event.target.closest('[data-wiz-bento-index]');
    if (!tile) return;
    galleryIndex = Number(tile.getAttribute('data-wiz-bento-index')) || 0;
    openGalleryZoom();
  });

  root.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-wiz-detail], [data-wiz-open-detail]');
    if (!trigger) return;
    const card = trigger.closest('[data-wiz-card]');
    if (!card) return;
    event.preventDefault();
    openDetail(card);
  });

  detail.querySelector('[data-wiz-detail-close]')?.addEventListener('click', () => closeDetail());
  detailBack?.addEventListener('click', () => closeDetail());
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || detail.hidden) return;
    if (document.body.classList.contains('hotel-photo-zoom-open')) return;
    closeDetail();
  });

  document.addEventListener('mori:langchange', () => {
    if (openCard && detail && !detail.hidden) openDetail(openCard);
  });

  const hash = String(location.hash || '').replace(/^#/, '');
  const typeMatch = hash.match(/^type-(\d+)$/i);
  if (typeMatch) {
    const card = root.querySelector(`[data-wiz-card][data-room-type-id="${typeMatch[1]}"]`);
    if (card) {
      const tryOpen = (attempt) => {
        const loader = document.getElementById('guestPageLoader');
        const busy = loader && loader.getAttribute('aria-busy') === 'true';
        if (busy && attempt < 40) {
          window.setTimeout(() => tryOpen(attempt + 1), 150);
          return;
        }
        openDetail(card);
      };
      tryOpen(0);
    }
  }
})();
