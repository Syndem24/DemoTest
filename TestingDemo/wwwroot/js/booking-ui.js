(() => {
  const MIN_LEAD_HOURS_DEFAULT = 24;
  const toastEl = document.getElementById('guestToast');
  const detailsModal = document.getElementById('detailsModal');
  const guestsModal = document.getElementById('guestsModal');
  const offerSelectModal = document.getElementById('offerSelectModal');
  const bookModal = document.getElementById('bookModal');
  const successModal = document.getElementById('successModal');
  const guestNav = document.getElementById('guestNav');
  const guestNavToggle = document.getElementById('guestNavToggle');
  const allModals = [detailsModal, guestsModal, offerSelectModal, bookModal, successModal];
  let toastTimer = null;
  let lastFocusedElement = null;

  function tx(key, params, fallback) {
    const value = window.MoriI18n?.t?.(key, params);
    if (value && value !== key) return value;
    return fallback ?? key;
  }

  const BASE_GUESTS_PER_ROOM = 2;
  const MAX_GUESTS_PER_ROOM = 3;
  const MAX_EXTRA_PERSONS_PER_ROOM = 1;
  const EXTRA_PERSON_FEE_PER_NIGHT = 200;
  const MAX_CHILD_AGE = 12;
  const MAX_GUEST_ROOMS = 8;
  const EARLY_CHECKIN_TIME = '11:30';
  const EARLY_CHECKIN_FEE_PER_ROOM = 500;
  const LATE_CHECKOUT_FEE_PER_ROOM_PER_HOUR = 100;
  const MAX_LATE_CHECKOUT_HOURS = 3;
  const DEFAULT_CHECKIN_TIME = '14:00';
  const DEFAULT_CHECKOUT_TIME = '12:00';
  const PH_OFFSET = '+08:00';

  /** Build ISO datetime for Philippines local wall time (Asia/Manila). */
  function toManilaDateTimeIso(dateStr, timeStr) {
    const date = String(dateStr || '').slice(0, 10);
    const time = String(timeStr || '00:00').slice(0, 5);
    return `${date}T${time}:00${PH_OFFSET}`;
  }

  /** @type {{ adults: number, children: number, childAges: (number|null)[] }[]} */
  let guestRooms = [{ adults: 2, children: 0, childAges: [] }];
  let preferredRoomType = '';
  /** Room to auto-add (qty 1) when entering the offer step after Book on a card/details. */
  let pendingSeedRoomType = '';
  let guestsHintTimer = null;
  const BOOK_WIZARD_STEPS = ['guest', 'dates', 'rooms', 'confirm'];
  let bookWizardStep = 'guest';
  /** @type {'initial' | 'change'} */
  let offerSelectMode = 'initial';
  /** Guests flow: pick stay dates before the room & offer step. */
  let datesBeforeOfferFlow = false;
  const OFFER_SPECIAL_PREVIEW_COUNT = 3;
  const offerMoreOffersOpen = new Set();
  const offerIncludesOpen = new Set();
  let offerBookTagObserver = null;
  let bookingCartTotalsOpen = false;
  /** Room type marked for replacement (kept in cart, blurred until a new room is added). */
  let pendingChangeRoomType = '';
  /** How many rooms of that type are being replaced (usually 1). */
  let pendingChangeQty = 0;

  function setNavOpen(open) {
    if (!guestNav || !guestNavToggle) return;
    guestNav.classList.toggle('is-open', open);
    guestNavToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    guestNavToggle.setAttribute(
      'aria-label',
      open ? tx('lang.closeMenu', null, 'Close menu') : tx('lang.openMenu', null, 'Open menu')
    );
  }

  guestNavToggle?.addEventListener('click', () => {
    setNavOpen(!guestNav.classList.contains('is-open'));
  });

  guestNav?.querySelectorAll('.guest-nav-links a, .guest-nav-cta').forEach((link) => {
    link.addEventListener('click', () => setNavOpen(false));
  });

  const profileRoot = document.querySelector('[data-guest-profile]');
  const profileToggle = document.getElementById('guestProfileToggle');
  const profileMenu = document.getElementById('guestProfileMenu');

  function setProfileOpen(open) {
    if (!profileRoot || !profileToggle || !profileMenu) return;
    profileRoot.classList.toggle('is-open', open);
    profileToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    profileMenu.hidden = !open;
  }

  profileToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    setProfileOpen(profileMenu?.hidden !== false);
  });

  profileMenu?.querySelectorAll('a, button').forEach((item) => {
    item.addEventListener('click', () => {
      setProfileOpen(false);
      setNavOpen(false);
    });
  });

  document.addEventListener('click', (event) => {
    if (!profileRoot?.contains(event.target)) setProfileOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setProfileOpen(false);
  });

  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width: 720px)').matches) {
      setNavOpen(false);
    }
  });

  // Immersive hero: solid nav after scrolling past the night image.
  const immersiveShell = document.body.classList.contains('guest-shell--immersive');
  const heroSentinel = document.getElementById('guestHeroSentinel');

  function setNavScrolled(scrolled) {
    if (!guestNav) return;
    guestNav.classList.toggle('is-scrolled', scrolled);
  }

  if (immersiveShell && heroSentinel && 'IntersectionObserver' in window) {
    const navObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setNavScrolled(!entry.isIntersecting);
      },
      { root: null, threshold: 0 }
    );
    navObserver.observe(heroSentinel);
  } else if (immersiveShell) {
    // Fallback without IntersectionObserver: solid after leaving top.
    const onScroll = () => {
      const hero = document.getElementById('guestHero');
      const limit = hero ? hero.offsetHeight - 8 : 80;
      setNavScrolled(window.scrollY > limit);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function typeText(el, text, msPerChar) {
    return new Promise((resolve) => {
      if (!el) {
        resolve();
        return;
      }
      el.textContent = '';
      el.classList.add('is-typing');
      let i = 0;
      const tick = () => {
        el.textContent = text.slice(0, i);
        i += 1;
        if (i <= text.length) {
          window.setTimeout(tick, msPerChar);
        } else {
          el.classList.remove('is-typing');
          el.classList.add('is-typed');
          resolve();
        }
      };
      tick();
    });
  }

  function revealHeroScroll() {
    const scrollCue = document.getElementById('guestHeroScroll');
    if (!scrollCue) return;
    scrollCue.hidden = false;
    // Next frame so the opacity transition can run after unhiding.
    requestAnimationFrame(() => {
      scrollCue.classList.add('is-visible');
    });
  }

  async function runHeroTypewriter() {
    const brand = document.getElementById('heroBrandType');
    const title = document.getElementById('heroTitleType');
    const copy = document.getElementById('guestHeroCopy');
    if (!brand && !title) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const brandText = brand?.getAttribute('aria-label') || brand?.textContent?.trim() || '';
    const titleText = title?.getAttribute('aria-label') || title?.textContent?.trim() || '';

    if (reduceMotion) {
      if (brand) {
        brand.textContent = brandText;
        brand.classList.add('is-typed');
      }
      if (title) {
        title.textContent = titleText;
        title.classList.add('is-typed');
      }
      copy?.classList.add('is-revealed');
      revealHeroScroll();
      return;
    }

    if (brand) brand.textContent = '';
    if (title) title.textContent = '';

    await typeText(brand, brandText, 42);
    await new Promise((r) => window.setTimeout(r, 220));
    await typeText(title, titleText, 36);
    copy?.classList.add('is-revealed');
    revealHeroScroll();
  }

  runHeroTypewriter();

  function revealNode(el) {
    if (!el) return;
    el.classList.add('is-inview');
  }

  function scheduleRevealCascade(elements, options = {}) {
    const { startDelay = 0, step = 85, maxDelay = 960 } = options;
    elements.forEach((el, index) => {
      if (!el) return;
      const delay = startDelay + Math.min(index * step, maxDelay);
      window.setTimeout(() => revealNode(el), delay);
    });
  }

  function isInRevealViewport(el, marginRatio = 0.12) {
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const margin = vh * marginRatio;
    return rect.top < vh - margin && rect.bottom > margin * 0.35;
  }

  function initAccommodationsHeroEntrance() {
    const hero = document.querySelector('.guest-hero-rooms');
    if (!hero) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      hero.classList.add('is-hero-ready');
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => hero.classList.add('is-hero-ready'));
    });
  }

  function initScrollReveals() {
    const nodes = Array.from(document.querySelectorAll('[data-reveal]'));
    if (!nodes.length) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      nodes.forEach(revealNode);
      return;
    }

    const roomsPage = document.querySelector('.guest-rooms-page');

    if (roomsPage) {
      initAccommodationsHeroEntrance();

      const intro = roomsPage.querySelector('.guest-rooms-intro[data-reveal]');
      const cards = Array.from(
        roomsPage.querySelectorAll('.guest-room-track .guest-reveal[data-reveal]')
      );
      const bookCtas = Array.from(
        roomsPage.querySelectorAll('.guest-rooms-book-cta[data-reveal]')
      );
      const loadCascade = [intro, ...cards, ...bookCtas].filter(Boolean);
      const loadSet = new Set(loadCascade);
      const scrollNodes = nodes.filter((n) => !loadSet.has(n));

      scheduleRevealCascade(loadCascade, { startDelay: 280, step: 88, maxDelay: 1100 });

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            revealNode(entry.target);
            observer.unobserve(entry.target);
          });
        },
        { root: null, threshold: 0.06, rootMargin: '14% 0px -4% 0px' }
      );

      scrollNodes.forEach((el) => {
        if (isInRevealViewport(el, 0.1)) {
          revealNode(el);
        } else {
          observer.observe(el);
        }
      });
      return;
    }

    nodes.forEach((el, index) => {
      if (!el.style.getPropertyValue('--reveal-delay')) {
        el.style.setProperty('--reveal-delay', `${Math.min(index % 5, 4) * 90}ms`);
      }
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          revealNode(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { root: null, threshold: 0.1, rootMargin: '12% 0px -6% 0px' }
    );

    nodes.forEach((el) => {
      if (isInRevealViewport(el, 0.12)) {
        revealNode(el);
      } else {
        observer.observe(el);
      }
    });
  }

  initScrollReveals();

  function initGuestHeroTour() {
    const media = document.querySelector('[data-hero-tour]');
    if (!media) return;

    const slides = Array.from(media.querySelectorAll('[data-hero-tour-slide]'));
    if (slides.length < 2) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      slides.forEach((slide, index) => {
        slide.classList.toggle('is-active', index === 0);
        slide.classList.remove('is-drifting', 'is-leaving');
      });
      return;
    }

    const driftMs = Number(media.getAttribute('data-hero-tour-duration')) || 12000;
    const fadeMs = 500;
    let index = slides.findIndex((slide) => slide.classList.contains('is-active'));
    if (index < 0) index = 0;
    let timerId = null;
    let running = false;
    let inView = true;

    function clearTimer() {
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
    }

    function startDrift(slide) {
      slide.classList.remove('is-drifting');
      void slide.offsetWidth;
      slide.classList.add('is-drifting');
    }

    function showSlide(nextIndex) {
      const current = slides[index];
      const next = slides[nextIndex];
      if (!current || !next || current === next) return;

      next.classList.add('is-active');
      startDrift(next);
      current.classList.add('is-leaving');
      current.classList.remove('is-active', 'is-drifting');

      window.setTimeout(() => {
        current.classList.remove('is-leaving');
      }, fadeMs);

      index = nextIndex;
    }

    function scheduleNext() {
      clearTimer();
      if (!running || !inView || document.hidden) return;
      timerId = window.setTimeout(() => {
        showSlide((index + 1) % slides.length);
        scheduleNext();
      }, driftMs);
    }

    function setRunning(active) {
      if (active === running) {
        if (active) scheduleNext();
        return;
      }
      running = active;
      if (!running) {
        clearTimer();
        return;
      }
      const activeSlide = slides[index];
      if (activeSlide && !activeSlide.classList.contains('is-drifting')) {
        startDrift(activeSlide);
      }
      scheduleNext();
    }

    document.addEventListener('visibilitychange', () => {
      setRunning(!document.hidden && inView);
    });

    if ('IntersectionObserver' in window) {
      const hero = media.closest('.guest-hero') || media;
      const observer = new IntersectionObserver(
        (entries) => {
          inView = entries[0]?.isIntersecting ?? true;
          setRunning(inView && !document.hidden);
        },
        { root: null, threshold: 0.2 }
      );
      observer.observe(hero);
    } else {
      setRunning(true);
    }

    setRunning(true);
  }

  initGuestHeroTour();

  function showToast(message, ok = false) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastEl.classList.toggle('is-ok', ok);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 2800);
  }

  function openModal(modal) {
    if (!modal) return;
    const hasOpenModal = allModals.some((item) => item && !item.hidden);
    if (!hasOpenModal && document.activeElement instanceof HTMLElement) {
      lastFocusedElement = document.activeElement;
    }
    closeAllModals(false);
    modal.hidden = false;
    document.body.classList.add('guest-modal-open');
    // Re-apply translations for static data-i18n nodes (and after locale cache updates).
    window.MoriI18n?.apply?.();
    requestAnimationFrame(() => {
      const firstControl = modal.querySelector(
        '.guest-modal-close, input:not([disabled]), select:not([disabled]), button:not([disabled]), a[href]'
      );
      firstControl?.focus();
    });
  }

  function closeAllModals(restoreFocus = true) {
    allModals.forEach((modal) => {
      if (modal) modal.hidden = true;
    });
    document.body.classList.remove('guest-modal-open');
    if (restoreFocus && lastFocusedElement?.isConnected) {
      lastFocusedElement.focus();
      lastFocusedElement = null;
    }
  }

  function findRoomCard(roomName) {
    if (!roomName) return null;
    return document.querySelector(`.guest-room[data-room-type="${CSS.escape(roomName)}"]`);
  }

  let detailsPhotos = [];
  let detailsPhotoIndex = 0;
  /** When set to 'offers', closing room details returns to the offer select step. */
  let detailsReturnTarget = null;

  function parseJsonArray(raw) {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  // Mirrors InclusionCatalog categories for guest display.
  const INCLUSION_CATALOG = [
    { name: 'Video and audio', items: ['Smart TV'] },
    { name: 'Internet and telephony', items: ['Wi-Fi'] },
    { name: 'Electronic devices', items: ['air conditioning', 'electronic lock', 'heater', 'desk lamp'] },
    { name: 'Bathroom', items: ['toiletries', 'bath towels'] },
    { name: 'Outdoor area and window view', items: ['city view', 'no window'] },
  ];
  const DEFAULT_INCLUSION_ITEMS = INCLUSION_CATALOG.flatMap((cat) => cat.items);
  const DEFAULT_INCLUSION_SET = new Set(DEFAULT_INCLUSION_ITEMS.map((i) => i.toLowerCase()));

  function orderInclusionsCustomFirst(items) {
    const list = (items || [])
      .map((i) => String(i).trim())
      .filter(Boolean);
    const seen = new Set();
    const deduped = [];
    list.forEach((item) => {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(item);
      }
    });
    const custom = deduped
      .filter((i) => !DEFAULT_INCLUSION_SET.has(i.toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const catalog = DEFAULT_INCLUSION_ITEMS
      .map((def) => deduped.find((i) => i.toLowerCase() === def.toLowerCase()))
      .filter(Boolean);
    return custom.concat(catalog);
  }

  const CATEGORY_ICONS = {
    'video and audio': 'tv',
    'internet and telephony': 'wifi',
    'electronic devices': 'bolt',
    bathroom: 'bath',
    'outdoor area and window view': 'view',
    custom: 'star',
  };

  function iconSvg(kind) {
    const paths = {
      tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
      wifi: '<path d="M5 12.5a9 9 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1.2"/>',
      bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
      bath: '<path d="M4 12h16v2a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-2z"/><path d="M6 12V7a2 2 0 0 1 2-2h1"/><path d="M7 19h10"/>',
      view: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',
      star: '<path d="m12 3 2.4 5.4L20 9.3l-4 4.2 1 6.5L12 17l-5 2.9 1-6.5-4-4.2 5.6-.9L12 3z"/>',
      check: '<path d="M20 6 9 17l-5-5"/>',
    };
    const d = paths[kind] || paths.check;
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</g></svg>`;
  }

  function iconForCategory(name) {
    return CATEGORY_ICONS[(name || '').toLowerCase()] || 'star';
  }

  function buildInclusionGroups(selectedItems) {
    const selected = orderInclusionsCustomFirst(selectedItems);
    const selectedSet = new Set(selected.map((i) => i.toLowerCase()));
    const used = new Set();
    const groups = [];

    function takeItems(candidates) {
      return (candidates || [])
        .map((i) => String(i).trim())
        .filter((i) => i && selectedSet.has(i.toLowerCase()) && !used.has(i.toLowerCase()))
        .map((i) => {
          used.add(i.toLowerCase());
          const match = selected.find((s) => s.toLowerCase() === i.toLowerCase());
          return match || i;
        });
    }

    const customItems = takeItems(
      selected.filter((i) => !DEFAULT_INCLUSION_SET.has(i.toLowerCase()))
    );
    if (customItems.length) {
      groups.push({ name: 'Custom', items: customItems });
    }

    for (const cat of INCLUSION_CATALOG) {
      const items = takeItems(cat.items);
      if (items.length) groups.push({ name: cat.name, items });
    }

    return groups;
  }

  function renderInclusionGroups(container, selectedItems) {
    if (!container) return;
    container.innerHTML = '';
    const groups = buildInclusionGroups(selectedItems);

    if (!groups.length) {
      const empty = document.createElement('p');
      empty.className = 'guest-inclusion-empty';
      empty.textContent = tx('details.noInclusions', null, 'No listed inclusions');
      container.appendChild(empty);
      return;
    }

    groups.forEach((group) => {
      const section = document.createElement('section');
      section.className = 'guest-inclusion-group';
      const groupLabel =
        window.MoriI18n?.translateInclusionCategory?.(group.name) || group.name;

      const heading = document.createElement('h3');
      heading.className = 'guest-inclusion-group-title';
      heading.innerHTML = `<span class="guest-inclusion-icon">${iconSvg(iconForCategory(group.name))}</span><span>${groupLabel}</span>`;
      section.appendChild(heading);

      const list = document.createElement('ul');
      list.className = 'guest-inclusion-items';
      group.items.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      });
      section.appendChild(list);
      container.appendChild(section);
    });
  }

  function showDetailsPhoto(index) {
    const mainImage = document.getElementById('detailsMainImage');
    const empty = document.getElementById('detailsImageEmpty');
    const count = document.getElementById('detailsPhotoCount');
    const prev = document.getElementById('detailsPrevPhoto');
    const next = document.getElementById('detailsNextPhoto');
    const thumbs = document.getElementById('detailsThumbs');
    const zoomHint = document.getElementById('detailsZoomHint');

    if (!detailsPhotos.length) {
      if (mainImage) {
        mainImage.hidden = true;
        mainImage.removeAttribute('src');
      }
      if (empty) empty.hidden = false;
      if (count) count.hidden = true;
      if (prev) prev.hidden = true;
      if (next) next.hidden = true;
      if (zoomHint) zoomHint.hidden = true;
      if (thumbs) {
        thumbs.hidden = true;
        thumbs.innerHTML = '';
      }
      return;
    }

    detailsPhotoIndex = ((index % detailsPhotos.length) + detailsPhotos.length) % detailsPhotos.length;
    const src = detailsPhotos[detailsPhotoIndex];
    const roomName = document.getElementById('detailsTitle')?.textContent || 'Room';

    if (mainImage) {
      mainImage.hidden = false;
      mainImage.src = src;
      mainImage.alt = `${roomName} photo ${detailsPhotoIndex + 1}`;
    }
    if (empty) empty.hidden = true;
    if (zoomHint) zoomHint.hidden = false;

    if (count) {
      count.hidden = false;
      count.textContent = `${detailsPhotoIndex + 1} / ${detailsPhotos.length}`;
    }
    if (prev) prev.hidden = detailsPhotos.length < 2;
    if (next) next.hidden = detailsPhotos.length < 2;

    if (thumbs) {
      thumbs.hidden = detailsPhotos.length < 2;
      thumbs.innerHTML = '';
      detailsPhotos.forEach((photo, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = i === detailsPhotoIndex;
        btn.className = `guest-details-thumb${isActive ? ' is-active' : ''}`;
        btn.setAttribute('aria-label', `View photo ${i + 1}`);
        const img = document.createElement('img');
        img.src = photo;
        img.alt = '';
        btn.appendChild(img);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          showDetailsPhoto(i);
        });
        thumbs.appendChild(btn);
        if (isActive) {
          setTimeout(() => btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 50);
        }
      });
    }
  }

  function fillDetails(roomName) {
    const card = findRoomCard(roomName);
    if (!card || !detailsModal) return;

    const title = detailsModal.querySelector('#detailsTitle');
    const price = detailsModal.querySelector('#detailsPrice');
    const occupancy = detailsModal.querySelector('#detailsOccupancy');
    const beds = detailsModal.querySelector('#detailsBeds');
    const description = detailsModal.querySelector('#detailsDescription');
    const inclusionsEl = detailsModal.querySelector('#detailsInclusions');
    const bookBtn = detailsModal.querySelector('#detailsBookBtn');
    const statusPill = detailsModal.querySelector('#detailsStatusPill');
    const fullDesc = card.querySelector('.guest-room-desc-full')?.textContent?.trim() || '';

    detailsModal.dataset.currentRoom = card.dataset.roomType || roomName;

    const roomTypeStr = card.dataset.roomType || roomName || 'Room';
    const rawPrice = Number(card.dataset.price || 0);
    const formattedPrice = `₱${rawPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    const isAvailable = Number(card.dataset.available || 0) > 0;

    if (title) title.textContent = roomTypeStr;
    if (price) price.textContent = formattedPrice;
    if (occupancy) {
      occupancy.textContent = tx(
        'rooms.upToGuests',
        { n: card.dataset.occupancy || '—' },
        `Up to ${card.dataset.occupancy || '—'} guests`
      );
    }
    if (beds) {
      const bedCount = Number(card.dataset.beds || 0);
      beds.textContent =
        bedCount === 1
          ? tx('rooms.bed', { n: bedCount || card.dataset.beds || '—' }, `${card.dataset.beds || '—'} bed`)
          : tx('rooms.beds', { n: bedCount || card.dataset.beds || '—' }, `${card.dataset.beds || '—'} beds`);
    }
    if (description) {
      description.textContent =
        fullDesc || tx('details.noDescription', null, 'No description provided.');
    }
    if (bookBtn) {
      bookBtn.dataset.fillRoom = roomTypeStr;
      bookBtn.disabled = !isAvailable;
      bookBtn.textContent = isAvailable
        ? tx('details.bookThisRoom', null, 'Book this room')
        : tx('details.unavailable', null, 'Unavailable for these dates');
    }

    if (statusPill) {
      statusPill.textContent = isAvailable
        ? tx('details.available', null, 'Available')
        : tx('details.reserved', null, 'Reserved');
      statusPill.className = `guest-pill ${isAvailable ? 'is-available' : 'is-unavailable'}`;
    }

    // Reset accordions: all closed by default.
    detailsModal.querySelectorAll('.guest-acc').forEach((panel) => {
      panel.removeAttribute('open');
    });

    const inclusions = parseJsonArray(card.dataset.inclusions);
    renderInclusionGroups(inclusionsEl, inclusions);

    detailsPhotos = parseJsonArray(card.dataset.images);
    showDetailsPhoto(0);
  }

  // Stage photo zoom & touch swipe support
  const stageEl = document.getElementById('detailsPhotoStage');
  if (stageEl) {
    let touchStartX = 0;
    let touchEndX = 0;

    stageEl.addEventListener('click', (e) => {
      if (e.target.closest('#detailsPrevPhoto') || e.target.closest('#detailsNextPhoto')) return;
      if (detailsPhotos.length && typeof window.openPhotoZoom === 'function') {
        window.openPhotoZoom(detailsPhotos, detailsPhotoIndex);
      }
    });

    stageEl.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    stageEl.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const diff = touchEndX - touchStartX;
      if (Math.abs(diff) > 40 && detailsPhotos.length > 1) {
        if (diff < 0) showDetailsPhoto(detailsPhotoIndex + 1);
        else showDetailsPhoto(detailsPhotoIndex - 1);
      }
    }, { passive: true });
  }

  // Only one details accordion open at a time.
  detailsModal?.querySelectorAll('.guest-acc').forEach((panel) => {
    panel.addEventListener('toggle', () => {
      if (!panel.open) return;
      detailsModal.querySelectorAll('.guest-acc').forEach((other) => {
        if (other !== panel) other.removeAttribute('open');
      });
    });
  });

  document.getElementById('detailsPrevPhoto')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showDetailsPhoto(detailsPhotoIndex - 1);
  });

  document.getElementById('detailsNextPhoto')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showDetailsPhoto(detailsPhotoIndex + 1);
  });

  /** @type {{ roomTypeId: number, roomType: string, qty: number, price: number, regularPrice?: number, available: number, specialOfferId?: number|null, forcedStayLongerOfferId?: number|null, stayLongerMinNights?: number|null }[]} */
  let bookingCart = [];
  /** @type {{ id: number, roomTypeId: number, title: string, promoPrice: number, regularPrice: number, cashOnly: boolean }|null} */
  let selectedSpecialOffer = null;
  let cachedSpecialOffers = null;
  let selectedPayMethod = 'Cash';

  function getRoomMeta(roomType) {
    if (!roomType) return null;
    const card = findRoomCard(roomType);
    if (!card) return null;
    return {
      roomTypeId: Number(card.dataset.roomTypeId || 0),
      roomType: card.dataset.roomType || roomType,
      available: Number(card.dataset.available || 0),
      price: Number(card.dataset.price || 0),
      occupancy: Number(card.dataset.occupancy || 0),
    };
  }

  function getRoomMetaByTypeId(roomTypeId) {
    const id = Number(roomTypeId || 0);
    if (!id) return null;
    const card = document.querySelector(`.guest-room-card[data-room-type-id="${id}"]`);
    if (!card) return null;
    return getRoomMeta(card.dataset.roomType || '');
  }

  function formatMoney(amount) {
    return `₱${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  }

  function isValidPhone(phone) {
    const trimmed = (phone || '').trim();
    if (!trimmed) return false;
    const digits = trimmed.replace(/\D/g, '');
    return digits.length >= 7 && /^[+\d][\d\s\-().]*$/.test(trimmed);
  }

  function cartLineKey(roomType) {
    return (roomType || '').toLowerCase();
  }

  /** @param {{ forcedStayLongerOfferId?: number|null, specialOfferId?: number|null }|null|undefined} line */
  function lineRateKind(line) {
    if (!line) return 'standard';
    if (Number(line.forcedStayLongerOfferId || 0) > 0) return 'stayLonger';
    if (Number(line.specialOfferId || 0) > 0) return 'limited';
    return 'standard';
  }

  function cartEntryKey(roomType, rateKind = 'standard') {
    return `${cartLineKey(roomType)}::${rateKind || 'standard'}`;
  }

  function lineEntryKey(line) {
    return cartEntryKey(line?.roomType, lineRateKind(line));
  }

  function findCartLine(roomType, rateKind) {
    const key = cartEntryKey(roomType, rateKind);
    return bookingCart.find((l) => lineEntryKey(l) === key) || null;
  }

  function qtyForRoomType(roomType) {
    return bookingCart
      .filter((l) => cartLineKey(l.roomType) === cartLineKey(roomType))
      .reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
  }

  function remainingCapacity(roomType, available) {
    const used = qtyForRoomType(roomType);
    return Math.max(0, Number(available || 0) - used);
  }

  function cartRoomCount() {
    return bookingCart.reduce((sum, line) => sum + line.qty, 0);
  }

  function cartNightlyTotal() {
    return bookingCart.reduce((sum, line) => sum + line.qty * line.price, 0);
  }

  function cartLoyaltyDeduct(nights) {
    const n = Math.max(1, Number(nights) || 1);
    return bookingCart.reduce((sum, line) => {
      const stay = Number(line.qty || 0) * Number(line.price || 0) * n;
      const raw = lineLoyaltyDeduct(line, n);
      return sum + Math.min(Math.max(0, raw), stay);
    }, 0);
  }

  function selectedCheckInTime() {
    return document.getElementById('modalCheckInTime')?.value || DEFAULT_CHECKIN_TIME;
  }

  function selectedCheckOutTime() {
    return document.getElementById('modalCheckOutTime')?.value || DEFAULT_CHECKOUT_TIME;
  }

  function earlyCheckInFee(rooms = cartRoomCount()) {
    if (rooms < 1) return 0;
    return selectedCheckInTime() === EARLY_CHECKIN_TIME
      ? EARLY_CHECKIN_FEE_PER_ROOM * rooms
      : 0;
  }

  function lateCheckOutHours() {
    const time = selectedCheckOutTime();
    if (!time || time <= DEFAULT_CHECKOUT_TIME) return 0;
    const [h, m] = time.split(':').map(Number);
    const [baseH, baseM] = DEFAULT_CHECKOUT_TIME.split(':').map(Number);
    const minutes = h * 60 + m - (baseH * 60 + baseM);
    if (minutes <= 0) return 0;
    return Math.min(MAX_LATE_CHECKOUT_HOURS, Math.round(minutes / 60));
  }

  function lateCheckOutFee(rooms = cartRoomCount()) {
    if (rooms < 1) return 0;
    return lateCheckOutHours() * LATE_CHECKOUT_FEE_PER_ROOM_PER_HOUR * rooms;
  }

  function timeFeesTotal(rooms = cartRoomCount()) {
    return earlyCheckInFee(rooms) + lateCheckOutFee(rooms);
  }

  /** Extra persons beyond 2 included guests, one extra allowed per room. */
  function extraPersonsSelected() {
    return guestRooms.reduce((sum, room) => {
      const total = (Number(room.adults) || 0) + (Number(room.children) || 0);
      return sum + Math.min(MAX_EXTRA_PERSONS_PER_ROOM, Math.max(0, total - BASE_GUESTS_PER_ROOM));
    }, 0);
  }

  function extraPersonFee(nights = nightCount(modalCheckIn?.value || '', modalCheckOut?.value || '')) {
    const extras = extraPersonsSelected();
    if (extras < 1 || nights < 1) return 0;
    return extras * EXTRA_PERSON_FEE_PER_NIGHT * nights;
  }

  function stayFeesTotal(rooms = cartRoomCount()) {
    return timeFeesTotal(rooms) + extraPersonFee();
  }

  function roomHasExtraGuest(room) {
    const total = (Number(room?.adults) || 0) + (Number(room?.children) || 0);
    return total > BASE_GUESTS_PER_ROOM;
  }

  /** Max guests this booking can hold for a given room count (2 included + 1 extra per room). */
  function maxPartyForRoomCount(roomCount) {
    return Math.max(0, roomCount) * MAX_GUESTS_PER_ROOM;
  }

  function effectiveGuestsPerRoom() {
    return MAX_GUESTS_PER_ROOM;
  }

  let lastTimeFeeRoomCount = -1;

  function refreshStayTimeOptions(force = false) {
    const checkInSelect = document.getElementById('modalCheckInTime');
    const checkOutSelect = document.getElementById('modalCheckOutTime');
    const rooms = Math.max(1, cartRoomCount() || guestRooms.length || 1);
    if (!force && rooms === lastTimeFeeRoomCount && checkInSelect?.options.length > 1) {
      updateStayTimeFeesHint();
      return;
    }
    lastTimeFeeRoomCount = rooms;
    const earlyFee = EARLY_CHECKIN_FEE_PER_ROOM * rooms;
    const prevIn = checkInSelect?.value || DEFAULT_CHECKIN_TIME;
    const prevOut = checkOutSelect?.value || DEFAULT_CHECKOUT_TIME;

    if (checkInSelect) {
      const freeTimes = [];
      for (let hour = 14; hour <= 23; hour += 1) {
        freeTimes.push(`${String(hour).padStart(2, '0')}:00`);
        freeTimes.push(`${String(hour).padStart(2, '0')}:30`);
      }
      checkInSelect.innerHTML = [
        `<option value="${EARLY_CHECKIN_TIME}">${tx('booking.earlyCheckInOption', { time: EARLY_CHECKIN_TIME, fee: earlyFee }, `${EARLY_CHECKIN_TIME} — early check-in ${formatMoney(earlyFee)}`)}</option>`,
        ...freeTimes.map((t) => `<option value="${t}">${tx('booking.timeFreeOption', { time: t }, `${t} — free of charge`)}</option>`),
      ].join('');
      checkInSelect.value = [...checkInSelect.options].some((o) => o.value === prevIn)
        ? prevIn
        : DEFAULT_CHECKIN_TIME;
    }

    if (checkOutSelect) {
      const options = [
        `<option value="${DEFAULT_CHECKOUT_TIME}">${tx('booking.timeFreeOption', { time: DEFAULT_CHECKOUT_TIME }, `${DEFAULT_CHECKOUT_TIME} — free of charge`)}</option>`,
      ];
      for (let hour = 1; hour <= MAX_LATE_CHECKOUT_HOURS; hour += 1) {
        const [baseH, baseM] = DEFAULT_CHECKOUT_TIME.split(':').map(Number);
        const totalMinutes = baseH * 60 + baseM + hour * 60;
        const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
        const mm = String(totalMinutes % 60).padStart(2, '0');
        const time = `${hh}:${mm}`;
        const fee = LATE_CHECKOUT_FEE_PER_ROOM_PER_HOUR * hour * rooms;
        options.push(
          `<option value="${time}">${tx('booking.lateCheckOutOption', { time: time, fee: fee }, `${time} — late checkout ${formatMoney(fee)}/hr`)}</option>`
        );
      }
      checkOutSelect.innerHTML = options.join('');
      checkOutSelect.value = [...checkOutSelect.options].some((o) => o.value === prevOut)
        ? prevOut
        : DEFAULT_CHECKOUT_TIME;
    }

    updateStayTimeFeesHint();
  }

  function updateStayTimeFeesHint() {
    const hint = document.getElementById('stayTimeFeesHint');
    if (!hint) return;
    const rooms = cartRoomCount();
    const early = earlyCheckInFee(rooms);
    const late = lateCheckOutFee(rooms);
    const hours = lateCheckOutHours();
    const nights = nightCount(modalCheckIn?.value || '', modalCheckOut?.value || '');
    const extra = extraPersonFee(nights);
    const parts = [];
    if (early > 0) {
      parts.push(
        `${tx('booking.feeEarlyCheckIn', null, 'Early check-in')} (${EARLY_CHECKIN_TIME}): ${formatMoney(early)}`
      );
    }
    if (late > 0) {
      parts.push(
        `${tx('booking.feeLateCheckOut', null, 'Late checkout')} (+${hours}h): ${formatMoney(late)}`
      );
    }
    const extras = extraPersonsSelected();
    if (extra > 0) {
      const extraLabel =
        extras > 1
          ? `${tx('booking.feeExtraPerson', null, 'Extra person')} (${extras})`
          : tx('booking.feeExtraPerson', null, 'Extra person');
      parts.push(`${extraLabel}: ${formatMoney(extra)}`);
    } else if (extras > 0 && nights < 1) {
      const unit = `${formatMoney(EXTRA_PERSON_FEE_PER_NIGHT)} ${tx('booking.perNightShort', null, '/ night')}`;
      parts.push(
        extras > 1
          ? `${tx('booking.feeExtraPerson', null, 'Extra person')} (${extras}): ${unit}`
          : `${tx('booking.feeExtraPerson', null, 'Extra person')}: ${unit}`
      );
    }
    hint.hidden = parts.length === 0;
    hint.textContent = parts.length
      ? tx('booking.feesAddedHint', { detail: parts.join(' · ') }, `${parts.join(' · ')}. Added to your stay total.`)
      : '';
  }

  function cartGuestHoldCapacity() {
    if (!bookingCart.length) return 0;
    return maxPartyForRoomCount(cartRoomCount());
  }

  function guestPartyCount() {
    const totals = guestTotals();
    return totals.adults + totals.children;
  }

  function isGuestCapacityExceeded() {
    if (!bookingCart.length) return false;
    return guestPartyCount() > cartGuestHoldCapacity();
  }

  function guestRoomsOverCapacity() {
    return guestRooms.some((room) => {
      const total = (Number(room.adults) || 0) + (Number(room.children) || 0);
      return total > MAX_GUESTS_PER_ROOM;
    });
  }

  function updateBookRoomsCapacityWarning() {
    const section = document.getElementById('bookRoomsSection');
    const msg = document.getElementById('bookRoomsCapacityMsg');
    if (!section || !msg) return;

    const guestCount = guestPartyCount();
    const hold = cartGuestHoldCapacity();
    const over = isGuestCapacityExceeded();

    section.classList.toggle('is-over-capacity', over);
    msg.hidden = !over;
    msg.textContent = over
      ? `Guests (${guestCount}) exceed this room’s capacity (${hold}). Add more rooms or reduce guests to continue.`
      : '';
  }

  function buildPriceBreakdownLines() {
    const nights = nightCount(modalCheckIn?.value || '', modalCheckOut?.value || '');
    const rooms = cartRoomCount();
    const lines = [];

    bookingCart.forEach((line) => {
      const perNight = line.qty * line.price;
      const amount = nights > 0 ? perNight * nights : perNight;
      lines.push({
        label: formatOfferCompareBreakdown(line),
        amount: formatMoney(amount),
      });
      if (nights > 0) {
        const deduct = Math.min(lineLoyaltyDeduct(line, nights), amount);
        if (deduct > 0) {
          const coupon = loyaltyCouponForRoomType(line.roomTypeId);
          lines.push({
            label: `Loyalty Coupon · ${line.roomType} · ${loyaltyApplyLabel(coupon?.loyaltyApplyMode)}`,
            amount: `−${formatMoney(deduct)}`,
            deduct: true,
          });
        }
      }
    });

    const early = earlyCheckInFee(rooms);
    if (early > 0) {
      lines.push({ label: `Early check-in (${EARLY_CHECKIN_TIME})`, amount: formatMoney(early) });
    }
    const late = lateCheckOutFee(rooms);
    const lateHours = lateCheckOutHours();
    if (late > 0) {
      lines.push({
        label: `Late check-out (+${lateHours}h)`,
        amount: formatMoney(late),
      });
    }
    const extras = extraPersonsSelected();
    const extra = extraPersonFee(nights);
    if (extra > 0) {
      lines.push({
        label:
          extras > 1
            ? `Extra person · ${extras} × ${nights} night${nights === 1 ? '' : 's'}`
            : `Extra person · ${nights} night${nights === 1 ? '' : 's'}`,
        amount: formatMoney(extra),
      });
    } else if (extras > 0 && nights < 1) {
      lines.push({
        label: extras > 1 ? `Extra person · ${extras}` : 'Extra person',
        amount: `${formatMoney(EXTRA_PERSON_FEE_PER_NIGHT)} / night`,
      });
    }

    return lines;
  }

  function syncTotalsDisclosureUi() {
    const toggle = document.getElementById('bookingCartTotalsToggle');
    const panel = document.getElementById('bookingCartTotalsPanel');
    if (toggle) toggle.setAttribute('aria-expanded', bookingCartTotalsOpen ? 'true' : 'false');
    if (panel) panel.hidden = !bookingCartTotalsOpen;
    document.getElementById('bookingCartSummary')?.classList.toggle('is-open', bookingCartTotalsOpen);
  }

  function setBookingCartTotalsOpen(open) {
    bookingCartTotalsOpen = Boolean(open);
    syncTotalsDisclosureUi();
  }

  function syncCartSubmitState() {
    const submitBtn = document.getElementById('bookModalSubmit');
    const status = document.getElementById('bookingCartStatus');
    const summary = document.getElementById('bookingCartSummary');
    const summaryLabel = document.getElementById('bookingCartSummaryLabel');
    const summaryTotal = document.getElementById('bookingCartSummaryTotal');
    const totalsLines = document.getElementById('bookingCartTotalsLines');
    const totalRooms = cartRoomCount();
    const nightTotal = cartNightlyTotal();
    const nights = nightCount(modalCheckIn?.value || '', modalCheckOut?.value || '');
    const stayTotal = nights > 0 ? nightTotal * nights : 0;
    const loyalty = nights > 0 ? cartLoyaltyDeduct(nights) : 0;
    const stayAfter = Math.max(0, stayTotal - loyalty);
    const fees = stayFeesTotal(totalRooms);
    const grandTotal = nights > 0 ? stayAfter + fees : nightTotal;
    const hasRooms = bookingCart.length > 0;
    const acceptedTerms = document.getElementById('acceptStayTerms')?.checked === true;
    const overCapacity = isGuestCapacityExceeded();
    const onConfirmStep = bookWizardStep === 'confirm';

    refreshStayTimeOptions();
    updateBookRoomsCapacityWarning();
    syncOfferContinueState();

    if (submitBtn) {
      submitBtn.disabled = !onConfirmStep || !hasRooms || !acceptedTerms || overCapacity;
      submitBtn.title = overCapacity
        ? tx('booking.capacityHint', null, 'Guests exceed room capacity. Add more rooms or reduce guests.')
        : '';
    }

    if (status) {
      status.classList.toggle('is-empty', !hasRooms);
      status.classList.toggle('is-ready', hasRooms && !overCapacity);
      status.classList.toggle('is-over-capacity', overCapacity);
      if (!hasRooms) {
        status.textContent = tx('booking.cartEmpty', null, 'Cart empty');
      } else if (overCapacity) {
        status.textContent = tx('booking.capacityExceeded', null, 'Capacity exceeded');
      } else {
        status.textContent =
          totalRooms === 1
            ? tx('booking.roomsReady', { n: totalRooms }, `${totalRooms} room ready`)
            : tx('booking.roomsReadyPlural', { n: totalRooms }, `${totalRooms} rooms ready`);
      }
    }

    if (summary) summary.hidden = !hasRooms;
    if (!hasRooms) {
      setBookingCartTotalsOpen(false);
    }

    if (summaryLabel) {
      if (nights > 0) {
        summaryLabel.textContent =
          fees > 0
            ? tx(
                'booking.roomsNightsFeesSummary',
                {
                  rooms: totalRooms,
                  roomsSuffix: '',
                  nights,
                  nightsSuffix: '',
                  fees: formatMoney(fees),
                },
                `${totalRooms} room${totalRooms === 1 ? '' : 's'} · ${nights} night${nights === 1 ? '' : 's'} · fees ${formatMoney(fees)}`
              )
            : tx(
                'booking.roomsNightsSummary',
                {
                  rooms: totalRooms,
                  roomsSuffix: '',
                  nights,
                  nightsSuffix: '',
                },
                `${totalRooms} room${totalRooms === 1 ? '' : 's'} · ${nights} night${nights === 1 ? '' : 's'}`
              );
      } else {
        summaryLabel.textContent = `${
          totalRooms === 1
            ? tx('booking.roomsCount', { n: totalRooms }, `${totalRooms} room`)
            : tx('booking.roomsCountPlural', { n: totalRooms }, `${totalRooms} rooms`)
        } · ${tx('booking.perNight', null, 'per night')}`;
      }
    }
    if (summaryTotal) {
      summaryTotal.textContent = nights > 0
        ? formatMoney(grandTotal)
        : `${formatMoney(nightTotal)} ${tx('booking.perNightShort', null, '/ night')}`;
    }
    if (totalsLines) {
      const lines = buildPriceBreakdownLines();
      totalsLines.innerHTML = lines
        .map(
          (line) =>
            `<li${line.deduct ? ' class="is-deduct"' : ''}><span>${escapeHtml(line.label)}</span><strong>${escapeHtml(line.amount)}</strong></li>`
        )
        .join('');
      if (nights > 0 && lines.length) {
        totalsLines.innerHTML += `<li class="is-grand"><span>${tx('booking.stayTotal', null, 'Stay total')}</span><strong>${formatMoney(grandTotal)}</strong></li>`;
      }
    }
    syncTotalsDisclosureUi();
    updatePaymentPreview();
  }

  function renderOfferCart() {
    const list = document.getElementById('offerCartList');
    const empty = document.getElementById('offerCartEmpty');
    const summary = document.getElementById('offerCartSummary');
    const roomCountEl = document.getElementById('offerCartRoomCount');
    const nightlyEl = document.getElementById('offerCartNightlyTotal');
    if (!list || !empty) {
      syncOfferContinueState();
      return;
    }

    list.innerHTML = '';
    if (!bookingCart.length) {
      list.hidden = true;
      empty.hidden = false;
      if (summary) summary.hidden = true;
      syncOfferContinueState();
      return;
    }

    empty.hidden = true;
    list.hidden = false;
    if (summary) summary.hidden = false;

    bookingCart.forEach((line) => {
      const otherRooms = cartRoomCount() - line.qty;
      const maxByIntent = Math.max(0, intendedRoomCount() - otherRooms);
      const pendingUnits = isPendingChangeRoom(line.roomType) ? pendingChangeLineQty() : 0;
      const keepQty = Math.max(0, (Number(line.qty) || 0) - pendingUnits);

      const appendOfferCartRow = (qty, { pending = false } = {}) => {
        if (qty < 1) return;
        const lineTotal = qty * line.price;
        const rateKind = lineRateKind(line);
        const otherSameType = qtyForRoomType(line.roomType) - line.qty;
        const maxByAvail = Math.max(0, Number(line.available || 0) - otherSameType);
        const canInc =
          !pending
          && line.qty < maxByAvail
          && line.qty < maxByIntent;
        const rateMeta = cartLineRateKind(line);
        const li = document.createElement('li');
        li.className = `guest-offer-cart-item is-rate-${rateMeta.kind}${pending ? ' is-pending-change' : ''}`;
        const offerTag = cartLineOfferTagHtml(line);
        li.innerHTML = `
          <div class="guest-offer-cart-item-main">
            <strong>${escapeHtml(line.roomType)}</strong>
            ${offerTag}
            <span class="guest-offer-cart-item-meta">${formatOfferCompareRate({ ...line, qty })}</span>
          </div>
          <span class="guest-offer-cart-item-total">
            <span class="guest-offer-cart-item-total-label">${tx('booking.perNight', null, 'Per night')}</span>
            <strong>${formatMoney(lineTotal)}</strong>
          </span>
          ${pending ? `<span class="guest-offer-cart-pending-label">${tx('booking.replacingRoom', { n: '1' }, 'Replacing 1…')}</span>` : ''}
          <div class="guest-offer-cart-item-actions">
            <div class="guest-offer-cart-qty">
              <button type="button" data-offer-cart-delta="-1" data-offer-cart-room="${escapeHtml(line.roomType)}" data-offer-cart-rate="${rateKind}" aria-label="${tx('booking.fewerRoomAria', { room: escapeHtml(line.roomType) }, `Fewer ${escapeHtml(line.roomType)}`)}" ${pending ? 'disabled' : ''}>−</button>
              <span>${qty}</span>
              <button type="button" data-offer-cart-delta="1" data-offer-cart-room="${escapeHtml(line.roomType)}" data-offer-cart-rate="${rateKind}" aria-label="${tx('booking.moreRoomAria', { room: escapeHtml(line.roomType) }, `More ${escapeHtml(line.roomType)}`)}" ${canInc ? '' : 'disabled'}>+</button>
            </div>
            <button type="button" class="guest-offer-cart-remove" data-offer-cart-remove="${escapeHtml(line.roomType)}" data-offer-cart-rate="${rateKind}" ${pending ? 'data-offer-cart-cancel-change="1"' : ''}>${pending ? tx('booking.cancel', null, 'Cancel') : tx('booking.remove', null, 'Remove')}</button>
          </div>
        `;
        list.appendChild(li);
      };

      // Split same room type so only one unit looks pending when qty > 1.
      appendOfferCartRow(keepQty, { pending: false });
      appendOfferCartRow(pendingUnits, { pending: true });
    });

    if (roomCountEl) roomCountEl.textContent = String(cartRoomCount());
    if (nightlyEl) nightlyEl.textContent = formatMoney(cartNightlyTotal());
    const loyaltyRow = document.getElementById('offerCartLoyaltyRow');
    const loyaltyLabel = document.getElementById('offerCartLoyaltyLabel');
    const loyaltyTotal = document.getElementById('offerCartLoyaltyTotal');
    const stayNights = currentStayNights();
    const loyaltyAmount = isGoogleGuestSignedIn()
      ? cartLoyaltyDeduct(stayNights > 0 ? stayNights : 1)
      : 0;
    if (loyaltyRow) loyaltyRow.hidden = !(loyaltyAmount > 0);
    if (loyaltyTotal) loyaltyTotal.textContent = `−${formatMoney(loyaltyAmount)}`;
    if (loyaltyLabel) {
      const coupon = bookingCart.map((line) => loyaltyCouponForRoomType(line.roomTypeId)).find(Boolean);
      loyaltyLabel.textContent = coupon
        ? `${tx('booking.offerKindLoyalty', null, 'Loyalty Coupon')} · ${loyaltyApplyLabel(coupon.loyaltyApplyMode)}`
        : tx('booking.offerKindLoyalty', null, 'Loyalty Coupon');
    }
    const noteEl = document.getElementById('offerCartNote');
    if (noteEl) {
      const extras = extraPersonsSelected();
      if (extras > 0) {
        noteEl.textContent =
          extras > 1
            ? tx(
                'booking.extraPersonNotePlural',
                { fee: EXTRA_PERSON_FEE_PER_NIGHT.toFixed(0), count: extras },
                `${extras} extra persons · ₱${EXTRA_PERSON_FEE_PER_NIGHT.toFixed(0)} / night each will be added to your stay total.`
              )
            : tx(
                'booking.extraPersonNote',
                null,
                `Extra person · ₱${EXTRA_PERSON_FEE_PER_NIGHT.toFixed(0)} / night will be added to your stay total.`
              );
      } else {
        noteEl.textContent = tx('booking.stayTotalAfterDates', null, 'Stay total is calculated after you choose dates.');
      }
    }
    syncOfferContinueState();
  }

  function syncOfferCardSelectionState() {
    const slotsLeft = remainingSlotsForOfferAdd();
    document.querySelectorAll('.guest-offer-card').forEach((card) => {
      const roomType =
        card.getAttribute('data-offer-room-type') ||
        card.querySelector('[data-offer-add]')?.getAttribute('data-offer-add') ||
        '';
      if (!roomType) return;

      const qty = qtyForRoomType(roomType);
      const selected = qty > 0;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('data-offer-selected-qty', String(qty));

      const media = card.querySelector('.guest-offer-media');
      let badge = card.querySelector('[data-offer-selected-badge]');
      if (selected && media) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'guest-offer-selected-badge';
          badge.setAttribute('data-offer-selected-badge', '');
          media.appendChild(badge);
        }
        badge.hidden = false;
        badge.textContent =
          qty === 1
            ? tx('booking.addedToStay', null, 'Added to stay')
            : tx('booking.addedQty', { n: qty }, `Added · ${qty}`);
      } else if (badge) {
        badge.remove();
      }

      card.querySelectorAll('[data-offer-add]').forEach((btn) => {
        if (selected && slotsLeft < 1) {
          btn.textContent = tx('booking.inYourStay', null, 'In your stay');
          btn.classList.add('is-selected-room');
        } else if (selected) {
          btn.textContent = tx('booking.addAnother', null, 'Add another');
          btn.classList.add('is-selected-room');
        } else {
          btn.textContent = tx('booking.addRoom', null, 'Add room');
          btn.classList.remove('is-selected-room');
        }
      });
    });
  }

  function syncOfferSelectionStatus() {
    const status = document.getElementById('offerSelectionStatus');
    if (!status) return;
    if (!bookingCart.length) {
      status.textContent = tx('booking.noRoomSelected', null, 'No room selected yet');
      status.classList.add('is-empty');
      status.disabled = true;
      status.removeAttribute('aria-label');
      return;
    }
    const names = bookingCart
      .map((line) => `${line.roomType} × ${line.qty}`)
      .join(' · ');
    status.textContent = names;
    status.classList.remove('is-empty');
    status.disabled = false;
    status.setAttribute(
      'aria-label',
      tx('booking.viewSelectedRooms', { names }, `View selected rooms in cart: ${names}`)
    );
  }

  function scrollOfferCartIntoView() {
    const cart = document.getElementById('offerCartPanel');
    const layout = document.querySelector('#offerSelectModal .guest-offers-layout');
    if (!cart || !offerSelectModal || offerSelectModal.hidden) return;
    if (!bookingCart.length) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior = reduceMotion ? 'auto' : 'smooth';

    // Prefer scrolling the modal layout track on mobile; fall back to element scroll.
    if (layout && layout.scrollHeight > layout.clientHeight + 8) {
      const layoutTop = layout.getBoundingClientRect().top;
      const cartTop = cart.getBoundingClientRect().top;
      const nextTop = layout.scrollTop + (cartTop - layoutTop) - offerBookTagsScrollOffset();
      layout.scrollTo({ top: Math.max(0, nextTop), behavior });
    } else {
      cart.scrollIntoView({ behavior, block: 'start' });
    }

    cart.classList.add('is-flash');
    window.setTimeout(() => cart.classList.remove('is-flash'), reduceMotion ? 0 : 900);
  }

  function syncOfferContinueState() {
    const continueBtn = document.getElementById('offerContinueBtn');
    const hint = document.getElementById('offerCartHint');
    const hasRooms = bookingCart.length > 0;
    const overCapacity = isGuestCapacityExceeded();
    const overIntended = cartRoomCount() > intendedRoomCount();
    const soldOutConflict = hasSoldOutConflict();
    const intended = intendedRoomCount();
    const slotsLeft = remainingSlotsForOfferAdd();
    const ok = hasRooms && !overCapacity && !overIntended && !soldOutConflict;

    document.querySelectorAll('[data-offer-add], [data-stay-longer-book]').forEach((btn) => {
      const card = btn.closest('.guest-offer-card');
      const soldOut = card?.classList.contains('is-sold-out');
      btn.disabled = slotsLeft < 1 || soldOut;
      btn.title = slotsLeft < 1
        ? tx(
            'booking.alreadyAddedRooms',
            { n: intended, suffix: intended === 1 ? '' : 's' },
            `You already added ${intended} room${intended === 1 ? '' : 's'} for this stay.`
          )
        : pendingChangeRoomType
          ? tx('booking.addsReplacement', null, 'Adds a replacement for the blurred room.')
          : '';
    });

    syncOfferCardSelectionState();
    syncOfferSelectionStatus();

    if (continueBtn) {
      continueBtn.disabled = !ok;
      continueBtn.title = !hasRooms
        ? tx('booking.addRoomHint', null, 'Add at least one room to continue.')
        : overIntended
          ? tx(
              'booking.choseRoomsHint',
              { n: intended, suffix: intended === 1 ? '' : 's' },
              `You chose ${intended} room${intended === 1 ? '' : 's'} in Guests. Remove extras before continuing.`
            )
          : overCapacity
            ? tx('booking.capacityHint', null, 'Guests exceed room capacity. Add more rooms or reduce guests.')
            : soldOutConflict
              ? buildSoldOutMessages(lastAvailabilitySnapshot).join(' ')
              : '';
    }

    if (hint) {
      if (!hasRooms) {
        hint.hidden = true;
        hint.textContent = '';
      } else if (overIntended) {
        hint.hidden = false;
        hint.textContent = tx(
          'booking.choseRoomsHint',
          { n: intended, suffix: intended === 1 ? '' : 's' },
          `You chose ${intended} room${intended === 1 ? '' : 's'} in Guests. Remove extras before continuing.`
        );
      } else if (overCapacity) {
        const guestCount = guestPartyCount();
        const hold = cartGuestHoldCapacity();
        hint.hidden = false;
        hint.textContent = tx(
          'booking.capacityExceedHint',
          { guests: guestCount, hold },
          `Guests (${guestCount}) exceed selected room capacity (${hold}). Add more rooms or go back to adjust guests.`
        );
      } else if (soldOutConflict) {
        hint.hidden = false;
        hint.textContent = buildSoldOutMessages(lastAvailabilitySnapshot).join(' ');
      } else {
        hint.hidden = false;
        const extras = extraPersonsSelected();
        const count = cartRoomCount();
        const total = formatMoney(cartNightlyTotal());
        const base =
          slotsLeft > 0
            ? tx(
                'booking.roomsOfAvailable',
                { bookQty: count, roomCount: intended },
                `${count} of ${intended} rooms available now`
              ) + ` · ${total} ${tx('booking.perNight', null, 'per night')}`
            : tx(
                count === 1 ? 'booking.selectionStatus' : 'booking.selectionStatusPlural',
                { count, total },
                `${count} room${count === 1 ? '' : 's'} selected · ${total} per night`
              );
        hint.textContent = extras > 0
          ? `${base} · ${tx(
              extras > 1 ? 'booking.extraPersonFeeNotePlural' : 'booking.extraPersonFeeNote',
              { fee: EXTRA_PERSON_FEE_PER_NIGHT.toFixed(0), count: extras },
              extras > 1
                ? `+${formatMoney(EXTRA_PERSON_FEE_PER_NIGHT)}/night × ${extras} extra persons`
                : `+${formatMoney(EXTRA_PERSON_FEE_PER_NIGHT)}/night extra person`
            )}`
          : base;
      }
    }
  }

  function setCartLineQty(roomType, qty, rateKind = 'standard') {
    const line = findCartLine(roomType, rateKind);
    if (!line) return;
    const otherRooms = cartRoomCount() - line.qty;
    const maxByIntent = Math.max(0, intendedRoomCount() - otherRooms);
    const otherSameType = qtyForRoomType(roomType) - line.qty;
    const maxByAvail = Math.max(0, Number(line.available || 0) - otherSameType);
    const next = Math.max(0, Math.min(maxByAvail, maxByIntent, Number(qty) || 0));
    if (next < 1) {
      removeFromCart(roomType, rateKind);
      return;
    }
    if (next === line.qty && Number(qty) > line.qty) {
      showToast(
        `You chose ${intendedRoomCount()} room${intendedRoomCount() === 1 ? '' : 's'} in Guests. That is the maximum for this stay.`,
        false
      );
      return;
    }
    line.qty = next;
    renderCart();
  }

  function renderCart() {
    syncLoyaltyBanner();
    const list = document.getElementById('bookingCartList');
    const empty = document.getElementById('bookingCartEmpty');
    if (!list || !empty) {
      renderOfferCart();
      return;
    }

    list.innerHTML = '';
    if (!bookingCart.length) {
      list.hidden = true;
      empty.hidden = false;
      syncCartSubmitState();
      syncStayLongerSuggestionHint();
      renderOfferCart();
      return;
    }

    empty.hidden = true;
    list.hidden = false;
    const nights = nightCount(modalCheckIn?.value || '', modalCheckOut?.value || '');

    bookingCart.forEach((line) => {
      const atCap = line.qty >= line.available;
      const perNight = line.qty * line.price;
      const stayLine = nights > 0 ? perNight * nights : perNight;
      const couponOff = nights > 0 ? Math.min(lineLoyaltyDeduct(line, nights), stayLine) : 0;
      const shownTotal = stayLine - couponOff;
      const rateMeta = cartLineRateKind(line);
      const offerTag = cartLineOfferTagHtml(line);
      const li = document.createElement('li');
      li.className = `guest-cart-item is-rate-${rateMeta.kind}${atCap ? ' is-at-cap' : ''}${
        rateMeta.kind !== 'standard' ? ' is-special-offer' : ''
      }`;
      li.innerHTML = `
        <div class="guest-cart-item-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/></svg>
        </div>
        <div class="guest-cart-item-main">
          <div class="guest-cart-item-title">
            <strong>${line.roomType}</strong>
            <span class="guest-cart-qty-badge">${line.qty}</span>
            ${offerTag}
          </div>
          <div class="guest-cart-item-meta">
            <div class="guest-cart-rate">${formatOfferCompareRate(line)}</div>
            <div class="guest-cart-line-total">
              <span class="guest-cart-line-total-label">${formatCartLineTotalLabel(nights)}</span>
              <strong class="guest-cart-line-total-amount">${formatMoney(shownTotal)}</strong>
            </div>
            ${atCap ? `<span class="guest-cart-avail is-max">${tx('booking.limitReached', null, 'Limit reached')}</span>` : ''}
          </div>
        </div>
        <button type="button" class="guest-cart-change" data-change-room="${line.roomType}" aria-label="${tx('booking.changeOneAria', { room: line.roomType }, `Change one ${line.roomType}`)}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
          ${tx('booking.change', null, 'Change')}
        </button>
      `;
      list.appendChild(li);
    });

    syncCartSubmitState();
    syncStayLongerSuggestionHint();
    renderOfferCart();
  }

  function intendedRoomCount() {
    return Math.max(1, guestRooms.length || 1);
  }

  function remainingIntendedRoomSlots() {
    return Math.max(0, intendedRoomCount() - cartRoomCount());
  }

  function pendingChangeLineQty() {
    if (!pendingChangeRoomType || pendingChangeQty < 1) return 0;
    const line = bookingCart.find(
      (l) => cartLineKey(l.roomType) === cartLineKey(pendingChangeRoomType)
    );
    if (!line) return 0;
    return Math.min(pendingChangeQty, Number(line.qty) || 0);
  }

  function remainingSlotsForOfferAdd() {
    return remainingIntendedRoomSlots() + pendingChangeLineQty();
  }

  function clearPendingChangeRoom() {
    pendingChangeRoomType = '';
    pendingChangeQty = 0;
  }

  function isPendingChangeRoom(roomType) {
    return Boolean(
      pendingChangeRoomType &&
        pendingChangeQty > 0 &&
        cartLineKey(roomType) === cartLineKey(pendingChangeRoomType)
    );
  }

  /** Remove only `by` units of a room type from the cart (not the whole line). */
  function reduceCartLineQty(roomType, by = 1, rateKind = null) {
    const amount = Math.max(1, Number(by) || 1);
    const line = rateKind
      ? findCartLine(roomType, rateKind)
      : bookingCart.find((l) => cartLineKey(l.roomType) === cartLineKey(roomType));
    if (!line) return false;
    const kind = lineRateKind(line);
    line.qty = Math.max(0, Number(line.qty) || 0) - amount;
    if (line.qty < 1) {
      removeFromCart(roomType, kind);
    }
    return true;
  }

  function cartLineUsesSpecialOffer(line) {
    return Boolean(line && Number(line.specialOfferId || 0) > 0);
  }

  /** @returns {{ kind: 'stayLonger'|'limited'|'standard', label: string, pct: number, minNights: number }} */
  function cartLineRateKind(line) {
    const regular = resolveDisplayedRegularPrice(line);
    const promo = Number(line?.price || 0);
    const pct =
      cartLineUsesSpecialOffer(line) && regular > promo
        ? discountPercent(regular, promo)
        : 0;
    const offerId = Number(line?.forcedStayLongerOfferId || line?.specialOfferId || 0);
    const offer =
      offerId > 0
        ? (cachedSpecialOffers || []).find((o) => Number(o.id) === offerId)
        : null;
    const isStayLonger =
      Number(line?.forcedStayLongerOfferId || 0) > 0
      || offer?.kind === 'StayLongerSaveMore';
    if (isStayLonger) {
      const minNights = Number(offer?.minNights || line?.stayLongerMinNights || 0);
      const pctPart = pct > 0 ? ` · −${pct}%` : '';
      const minPart = minNights >= 2 ? ` · ${minNights}+ nights` : '';
      return {
        kind: 'stayLonger',
        label: tx(
          'booking.rateLabelStayLonger',
          { pct: pct || '—', n: minNights || '—' },
          `Stay longer, save more${pctPart}${minPart}`
        ),
        pct,
        minNights,
      };
    }
    if (offer?.kind === 'GoogleLoyalty') {
      const regular = resolveDisplayedRegularPrice(line) || Number(offer.regularPricePerNight || 0);
      const off = regular > promo ? regular - promo : 0;
      const offPart = off > 0 ? ` · −${formatMoney(off)}` : '';
      return {
        kind: 'loyalty',
        label: tx(
          'booking.rateLabelLoyalty',
          { amount: off > 0 ? formatMoney(off) : '—' },
          `Loyalty Coupon${offPart}`
        ),
        pct,
        minNights: 0,
      };
    }
    if (offer?.kind === 'LimitedTime' || cartLineUsesSpecialOffer(line)) {
      const pctPart = pct > 0 ? ` · −${pct}%` : '';
      return {
        kind: 'limited',
        label: tx(
          'booking.rateLabelLimited',
          { pct: pct || '—' },
          `Limited time${pctPart}`
        ),
        pct,
        minNights: 0,
      };
    }
    return {
      kind: 'standard',
      label: tx('booking.rateLabelStandard', null, 'Standard rate'),
      pct: 0,
      minNights: 0,
    };
  }

  function cartLineOfferTagHtml(line) {
    const meta = cartLineRateKind(line);
    const cls =
      meta.kind === 'stayLonger'
        ? 'guest-cart-offer-tag is-stay-longer'
        : meta.kind === 'limited'
          ? 'guest-cart-offer-tag is-limited'
          : meta.kind === 'loyalty'
            ? 'guest-cart-offer-tag is-loyalty'
            : 'guest-cart-offer-tag is-standard';
    const rateTag = `<span class="${cls}">${escapeHtml(meta.label)}</span>`;
    const coupon = loyaltyCouponForRoomType(line.roomTypeId);
    if (!coupon) return `<span class="guest-cart-offer-tags">${rateTag}</span>`;
    const unit = loyaltyCouponAmount(coupon);
    if (!(unit > 0)) return `<span class="guest-cart-offer-tags">${rateTag}</span>`;
    const nights = currentStayNights() || 1;
    const units = loyaltyCouponUnits(coupon.loyaltyApplyMode, nights);
    const total = unit * units * Number(line.qty || 1);
    const extra =
      units * Number(line.qty || 1) > 1 ? ` · −${formatMoney(total)}` : '';
    const couponTag = `<span class="guest-cart-offer-tag is-loyalty">${escapeHtml(
      `Loyalty Coupon · −${formatMoney(unit)} · ${loyaltyApplyLabel(coupon.loyaltyApplyMode)}${extra}`
    )}</span>`;
    return `<span class="guest-cart-offer-tags">${rateTag}${couponTag}</span>`;
  }

  function cartHasSpecialOffer() {
    return bookingCart.some((line) => cartLineUsesSpecialOffer(line));
  }

  /** Active rate offer (Limited Time, or Stay Longer when nights meet minimum). Lowest promo wins. */
  function currentStayNights() {
    return nightCount(modalCheckIn?.value || '', modalCheckOut?.value || '');
  }

  function offerEligibleForNights(offer, nights) {
    if (!offer || offer.promoPricePerNight == null || !(Number(offer.promoPricePerNight) > 0)) {
      return false;
    }
    if (offer.kind === 'LimitedTime') return true;
    if (offer.kind === 'StayLongerSaveMore') {
      const min = Number(offer.minNights || 0);
      return min >= 2 && nights >= min;
    }
    return false;
  }

  function isGoogleGuestSignedIn() {
    return document.getElementById('rooms')?.getAttribute('data-google-guest') === 'true';
  }

  function isGoogleLoginEnabled() {
    return document.getElementById('rooms')?.getAttribute('data-google-login') === 'true';
  }

  /** Limited Time only. Loyalty Coupon is a peso deduct, not a nightly rate. */
  function activeRateOfferForRoomType(roomTypeId) {
    const kinds = ['LimitedTime'];
    const offers = (cachedSpecialOffers || []).filter(
      (o) =>
        Number(o.roomTypeId) === Number(roomTypeId)
        && kinds.includes(o.kind)
        && o.promoPricePerNight != null
        && Number(o.promoPricePerNight) > 0
    );
    if (!offers.length) return null;
    return offers
      .slice()
      .sort((a, b) => Number(a.promoPricePerNight) - Number(b.promoPricePerNight))[0];
  }

  /** @deprecated use activeRateOfferForRoomType */
  function activeLimitedOfferForRoomType(roomTypeId) {
    return activeRateOfferForRoomType(roomTypeId);
  }

  function stayLongerOffersForRoomType(roomTypeId) {
    return (cachedSpecialOffers || [])
      .filter(
        (o) =>
          Number(o.roomTypeId) === Number(roomTypeId)
          && o.kind === 'StayLongerSaveMore'
          && o.promoPricePerNight != null
          && Number(o.promoPricePerNight) > 0
          && Number(o.minNights || 0) >= 2
      )
      .slice()
      .sort((a, b) => Number(a.promoPricePerNight) - Number(b.promoPricePerNight));
  }

  function stayLongerOfferForRoomType(roomTypeId) {
    return stayLongerOffersForRoomType(roomTypeId)[0] || null;
  }

  function cartRequiredMinNights() {
    let min = 1;
    bookingCart.forEach((line) => {
      if (lineRateKind(line) !== 'stayLonger') return;
      const forcedId = Number(line.forcedStayLongerOfferId || line.specialOfferId || 0);
      const offer =
        forcedId > 0
          ? (cachedSpecialOffers || []).find((o) => Number(o.id) === forcedId)
          : null;
      const n = Number(offer?.minNights || line.stayLongerMinNights || 0);
      if (n > min) min = n;
    });
    return min;
  }

  function syncStayLongerDateHint() {
    const banner = document.getElementById('stayLongerMinBanner');
    if (!banner) return;
    const minNights = cartRequiredMinNights();
    if (minNights <= 1) {
      banner.hidden = true;
      banner.textContent = '';
      return;
    }
    banner.hidden = false;
    banner.textContent = tx(
      'booking.stayLongerDateBanner',
      { n: minNights },
      `Stay longer offer selected: check-out must be at least ${minNights} nights after check-in. Shorter stays are not allowed.`
    );
  }

  /**
   * Suggest Stay Longer (optional, not forced) when:
   * - user currently has Limited Time in cart
   * - stay nights meet Stay Longer minimum
   * - Stay Longer promo is cheaper than current limited promo
   */
  function stayLongerSuggestionCandidates() {
    const nights = currentStayNights();
    if (nights < 1) return [];

    const seenRoomTypeIds = new Set();
    const rows = [];

    bookingCart.forEach((line) => {
      if (lineRateKind(line) !== 'limited') return;
      const roomTypeId = Number(line.roomTypeId || 0);
      if (!(roomTypeId > 0) || seenRoomTypeIds.has(roomTypeId)) return;

      const stayOffer = stayLongerOfferForRoomType(roomTypeId);
      if (!offerEligibleForNights(stayOffer, nights)) return;

      const limitedPromo = Number(line.price || 0);
      const stayPromo = Number(stayOffer?.promoPricePerNight || 0);
      if (!(limitedPromo > 0) || !(stayPromo > 0) || !(stayPromo < limitedPromo)) return;

      seenRoomTypeIds.add(roomTypeId);
      rows.push({
        roomTypeId,
        roomType: line.roomType || stayOffer?.roomTypeName || '',
        qty: Number(line.qty || 1),
        offerId: Number(stayOffer.id),
        offer: stayOffer,
        minNights: Number(stayOffer.minNights || 0),
        limitedPromo,
        stayPromo,
        savingsPerNight: limitedPromo - stayPromo,
      });
    });

    return rows;
  }

  function syncStayLongerSuggestionHint() {
    const wrap = document.getElementById('stayLongerSuggestBanner');
    const textEl = document.getElementById('stayLongerSuggestText');
    const switchBtn = document.getElementById('stayLongerSuggestSwitchBtn');
    if (!wrap || !textEl || !switchBtn) return;

    const rows = stayLongerSuggestionCandidates();
    if (!rows.length) {
      wrap.hidden = true;
      textEl.textContent = '';
      return;
    }

    const roomNames = rows.map((r) => r.roomType).filter(Boolean);
    const totalPerNightSavings = rows.reduce((sum, r) => sum + r.savingsPerNight * r.qty, 0);
    const minNights = Math.max(...rows.map((r) => Number(r.minNights || 0)));

    textEl.textContent = tx(
      'booking.stayLongerSuggestHint',
      {
        rooms: roomNames.join(', '),
        amount: formatMoney(totalPerNightSavings),
        n: minNights,
      },
      `You qualify for Stay longer, save more in ${roomNames.join(', ')}. You can save about ${formatMoney(totalPerNightSavings)} per night (minimum ${minNights}+ nights).`
    );
    switchBtn.textContent = tx(
      'booking.switchToStayLonger',
      null,
      'Switch to stay longer offer'
    );
    wrap.hidden = false;
  }

  function applyStayLongerSuggestion() {
    const rows = stayLongerSuggestionCandidates();
    if (!rows.length) {
      showToast(tx('booking.noStayLongerSuggestion', null, 'No better stay-longer suggestion is available.'), false);
      return;
    }

    rows.forEach((row) => {
      const line = bookingCart.find(
        (l) => Number(l.roomTypeId) === Number(row.roomTypeId) && lineRateKind(l) === 'limited'
      );
      if (!line) return;

      const meta = getRoomMeta(line.roomType);
      line.forcedStayLongerOfferId = row.offerId;
      line.stayLongerMinNights = row.minNights;
      line.specialOfferId = row.offerId;
      line.price = row.stayPromo;
      line.regularPrice = regularComparePrice(
        line.roomTypeId,
        Number(meta?.price || line.regularPrice || line.price || 0),
        row.offer
      );
    });

    syncSelectedOfferFromCart();
    applyDateLimits(modalCheckIn, modalCheckOut);
    refreshLiveAvailability(modalCheckIn?.value || '', modalCheckOut?.value || '');
    renderCart();
    showToast(
      tx(
        'booking.stayLongerSuggestionApplied',
        null,
        'Switched to Stay longer, save more. You can still change this anytime.'
      ),
      true
    );
  }

  /** Prefill empty dates (or extend short stays) for Stay Longer minimum nights. */
  function ensureStayDatesForOffer() {
    const checkInEl = modalCheckIn || document.getElementById('modalCheckIn');
    const checkOutEl = modalCheckOut || document.getElementById('modalCheckOut');
    if (!checkInEl || !checkOutEl) return;

    const today = todayIso();
    const minNights = Math.max(1, cartRequiredMinNights());

    if (!checkInEl.value || checkInEl.value < today) {
      checkInEl.value = today;
    }

    const requiredOut = addDaysIso(checkInEl.value, minNights);
    if (!checkOutEl.value || checkOutEl.value < requiredOut) {
      checkOutEl.value = requiredOut;
    }

    applyDateLimits(checkInEl, checkOutEl);
    syncStayLongerDateHint();
  }

  function specialOfferPriceForRoomType(roomTypeId) {
    const offer = activeRateOfferForRoomType(roomTypeId);
    if (!offer) return null;
    const promo = Number(offer.promoPricePerNight);
    return promo > 0 ? promo : null;
  }

  function regularComparePrice(roomTypeId, listPrice, offer) {
    const list = Number(listPrice || 0);
    const offerReg = Number(offer?.regularPricePerNight || 0);
    return Math.max(list, offerReg);
  }

  function discountPercent(regular, promo) {
    const r = Number(regular || 0);
    const p = Number(promo || 0);
    if (!(r > p) || !(p > 0)) return 0;
    return Math.max(1, Math.round((1 - p / r) * 100));
  }

  function syncSelectedOfferFromCart() {
    // Prefer Stay Longer when mixed so min-nights + cash-only stay attached to the booking.
    const stayLine = bookingCart.find((l) => lineRateKind(l) === 'stayLonger');
    const line = stayLine || bookingCart.find((l) => cartLineUsesSpecialOffer(l));
    if (!line) {
      selectedSpecialOffer = null;
      syncGuestPayMethodUi();
      return;
    }
    const offer =
      (cachedSpecialOffers || []).find((o) => Number(o.id) === Number(line.specialOfferId))
      || (lineRateKind(line) === 'limited'
        ? activeLimitedOfferForRoomType(line.roomTypeId)
        : null);
    selectedSpecialOffer = {
      id: Number(offer?.id || line.specialOfferId),
      roomTypeId: Number(line.roomTypeId),
      title: String(offer?.title || cartLineRateKind(line).label || ''),
      promoPrice: Number(offer?.promoPricePerNight || line.price || 0),
      regularPrice: Number(
        offer?.regularPricePerNight || line.regularPrice || line.price || 0
      ),
      cashOnly: offerForcesCash(offer, line),
    };
    syncGuestPayMethodUi();
  }

  function reapplySpecialOfferPrices() {
    bookingCart.forEach((line) => {
      const meta = getRoomMeta(line.roomType);
      const listPrice = Number(meta?.price || line.regularPrice || line.price || 0);
      const forcedId = Number(line.forcedStayLongerOfferId || 0);
      if (forcedId > 0) {
        const stayOffer =
          (cachedSpecialOffers || []).find((o) => Number(o.id) === forcedId)
          || null;
        const promo = Number(stayOffer?.promoPricePerNight || 0);
        const minNights = Number(stayOffer?.minNights || line.stayLongerMinNights || 0);
        if (stayOffer && promo > 0) {
          line.price = promo;
          line.specialOfferId = forcedId;
          line.stayLongerMinNights = minNights;
          line.regularPrice = regularComparePrice(line.roomTypeId, listPrice, stayOffer);
          if (line.regularPrice <= promo && listPrice > promo) {
            line.regularPrice = listPrice;
          }
          return;
        }
      }

      const limited = activeRateOfferForRoomType(line.roomTypeId);
      if (limited && Number(limited.promoPricePerNight) > 0) {
        const promo = Number(limited.promoPricePerNight);
        line.price = promo;
        line.specialOfferId = Number(limited.id);
        line.forcedStayLongerOfferId = null;
        line.stayLongerMinNights = null;
        line.regularPrice = regularComparePrice(line.roomTypeId, listPrice, limited);
        if (line.regularPrice <= promo && listPrice > promo) {
          line.regularPrice = listPrice;
        }
      } else {
        line.price = listPrice;
        line.specialOfferId = null;
        line.forcedStayLongerOfferId = null;
        line.stayLongerMinNights = null;
        line.regularPrice = listPrice;
      }
    });
    syncSelectedOfferFromCart();
    syncLoyaltyBanner();
  }

  function resolveDisplayedRegularPrice(line) {
    const promo = Number(line?.price || 0);
    const meta = getRoomMeta(line?.roomType || '');
    const cardPrice = Number(meta?.price || 0);
    const stored = Number(line?.regularPrice || 0);
    const offer = activeLimitedOfferForRoomType(line?.roomTypeId);
    const offerReg = Number(offer?.regularPricePerNight || 0);
    const best = Math.max(stored, offerReg, cardPrice);
    return best > promo ? best : 0;
  }

  function paintRoomCardPrices() {
    document.querySelectorAll('.guest-room[data-room-type-id]').forEach((card) => {
      const roomTypeId = Number(card.getAttribute('data-room-type-id') || 0);
      const listPrice = Number(card.getAttribute('data-price') || 0);
      const priceEl = card.querySelector('.guest-room-feature-price');
      if (!priceEl || !(listPrice > 0)) return;

      const offer = activeLimitedOfferForRoomType(roomTypeId);
      const promo = offer ? Number(offer.promoPricePerNight) : 0;
      if (offer && promo > 0 && promo < listPrice) {
        const regular = regularComparePrice(roomTypeId, listPrice, offer);
        const pct = discountPercent(regular, promo);
        const badge = pct > 0 ? `-${pct}%` : '';
        const occupancy = Number(card.getAttribute('data-occupancy') || 0);
        const basis =
          occupancy > 0
            ? tx(
                'rooms.priceBasisNightGuests',
                { nights: 1, guests: occupancy },
                `1 night / ${occupancy} guests`
              )
            : tx('rooms.perNight', null, 'per night');
        priceEl.classList.add('is-promo');
        priceEl.innerHTML = `
          <span class="guest-room-price-compare">
            ${badge ? `<span class="guest-room-discount-badge">${badge}</span>` : ''}
            <s class="guest-room-price-was">${formatMoney(regular)}</s>
          </span>
          <span class="guest-room-price-now">
            <small>${tx('rooms.from', null, 'From')}</small>
            <strong>${formatMoney(promo)}</strong>
          </span>
          <small class="guest-room-price-basis">${basis}</small>
        `;
      } else {
        priceEl.classList.remove('is-promo');
        priceEl.innerHTML = `
          <small>${tx('rooms.from', null, 'From')}</small>
          <span>${formatMoney(listPrice)}</span>
          <small>${tx('rooms.perNight', null, 'per night')}</small>
        `;
      }
    });
  }

  function formatCartLineTotalLabel(nights) {
    if (nights > 1) {
      return tx(
        'booking.nightsCountPlural',
        { n: nights },
        `${nights} nights`
      );
    }
    if (nights === 1) {
      return tx('booking.stayTotal', null, 'Stay total');
    }
    return tx('booking.perNight', null, 'Per night');
  }

  function formatOfferCompareRate(line) {
    const promo = Number(line.price || 0);
    const regular = resolveDisplayedRegularPrice(line);
    const rateMeta = cartLineRateKind(line);
    const showCompare = cartLineUsesSpecialOffer(line) && regular > promo;
    const perNight = tx('booking.perNightShort', null, '/ night');
    const qtyBit = `<span class="guest-cart-rate-qty">${line.qty} ×</span>`;
    if (showCompare) {
      const pct =
        rateMeta.pct > 0
          ? `<em class="guest-cart-rate-pct">−${rateMeta.pct}%</em>`
          : '';
      return `${qtyBit}
        <span class="guest-cart-rate-compare">
          <s class="guest-cart-rate-was">${formatMoney(regular)}</s>
          <span class="guest-cart-rate-arrow" aria-hidden="true">→</span>
          <strong class="guest-cart-rate-now">${formatMoney(promo)}</strong>
          ${pct}
        </span>
        <span class="guest-cart-rate-unit">${perNight}</span>`;
    }
    return `${qtyBit}
      <strong class="guest-cart-rate-now is-plain">${formatMoney(promo)}</strong>
      <span class="guest-cart-rate-unit">${perNight}</span>`;
  }

  function formatOfferCompareBreakdown(line) {
    const promo = Number(line.price || 0);
    const regular = resolveDisplayedRegularPrice(line);
    const showCompare = cartLineUsesSpecialOffer(line) && regular > promo;
    const rateMeta = cartLineRateKind(line);
    const offerNote = ` · ${rateMeta.label}`;
    const pctNote = rateMeta.pct > 0 ? ` (−${rateMeta.pct}%)` : '';
    const nightBit = tx('booking.perNightShort', null, '/ night');
    if (showCompare) {
      return `${line.roomType}${offerNote} · ${line.qty} × ${formatMoney(regular)} → ${formatMoney(promo)}${pctNote} ${nightBit}`;
    }
    return `${line.roomType}${offerNote} · ${line.qty} × ${formatMoney(promo)} ${nightBit}`;
  }

  function addToCart(roomType, qty = 1) {
    const meta = getRoomMeta(roomType);
    if (!meta || !meta.roomType) {
      return { ok: false, message: tx('booking.validateSelectRoom', null, 'Please select a room.') };
    }
    if (meta.available < 1) {
      return { ok: false, message: `${meta.roomType} cannot be added right now.` };
    }

    const addQty = Math.max(1, Number(qty) || 1);
    const slotsLeft = remainingIntendedRoomSlots();
    if (slotsLeft < 1) {
      const intended = intendedRoomCount();
      return {
        ok: false,
        message: `You chose ${intended} room${intended === 1 ? '' : 's'} in Guests. Remove a room first, or go back to Guests to add more.`,
      };
    }

    const limited = activeLimitedOfferForRoomType(meta.roomTypeId);
    const offerPrice = specialOfferPriceForRoomType(meta.roomTypeId);
    const price = offerPrice != null ? offerPrice : meta.price;
    const specialOfferId = offerPrice != null && limited ? Number(limited.id) : null;
    const rateKind = specialOfferId ? 'limited' : 'standard';
    const regularPrice =
      offerPrice != null
        ? regularComparePrice(meta.roomTypeId, meta.price, limited)
        : meta.price;

    // Keep Stay Longer lines separate — never merge Limited/Standard into them.
    const existing = findCartLine(meta.roomType, rateKind);
    const usedSameType = qtyForRoomType(meta.roomType);
    const nextQty = (existing ? existing.qty : 0) + Math.min(addQty, slotsLeft);

    if (usedSameType - (existing ? existing.qty : 0) + nextQty > meta.available) {
      return {
        ok: false,
        message: `You've reached the booking limit for ${meta.roomType}.`,
      };
    }

    if (existing) {
      existing.roomTypeId = meta.roomTypeId;
      existing.qty = nextQty;
      existing.price = price;
      existing.regularPrice = regularPrice;
      existing.available = meta.available;
      existing.specialOfferId = specialOfferId;
      existing.forcedStayLongerOfferId = null;
      existing.stayLongerMinNights = null;
    } else {
      bookingCart.push({
        roomTypeId: meta.roomTypeId,
        roomType: meta.roomType,
        qty: Math.min(addQty, slotsLeft),
        price,
        regularPrice,
        available: meta.available,
        specialOfferId,
        forcedStayLongerOfferId: null,
        stayLongerMinNights: null,
      });
    }

    syncSelectedOfferFromCart();
    renderCart();
    return { ok: true, message: `Added ${meta.roomType} to your booking.` };
  }

  function removeFromCart(roomType, rateKind = null) {
    if (rateKind) {
      const key = cartEntryKey(roomType, rateKind);
      bookingCart = bookingCart.filter((l) => lineEntryKey(l) !== key);
    } else {
      bookingCart = bookingCart.filter((l) => cartLineKey(l.roomType) !== cartLineKey(roomType));
    }
    syncSelectedOfferFromCart();
    renderCart();
  }

  function clearCart() {
    bookingCart = [];
    selectedSpecialOffer = null;
    selectedPayMethod = 'Cash';
    const offerHidden = document.getElementById('specialOfferId');
    if (offerHidden) offerHidden.value = '';
    renderCart();
    setPaymentOption('Full');
    syncGuestPayMethodUi();
  }

  function offerForcesCash(offer, line) {
    if (offer?.kind === 'GoogleLoyalty') return false;
    if (offer?.kind === 'LimitedTime' || offer?.kind === 'StayLongerSaveMore') return true;
    const kind = cartLineRateKind(line).kind;
    if (kind === 'loyalty') return false;
    if (kind === 'limited' || kind === 'stayLonger') return true;
    return Boolean(offer?.cashOnly);
  }

  function hasCashOnlySpecialOffer() {
    if (selectedSpecialOffer?.cashOnly) return true;
    return bookingCart.some((line) => {
      if (!cartLineUsesSpecialOffer(line)) return false;
      const offer = (cachedSpecialOffers || []).find(
        (o) => Number(o.id) === Number(line.specialOfferId)
      );
      return offerForcesCash(offer, line);
    });
  }

  function syncGuestPayMethodUi() {
    const cashOnly = hasCashOnlySpecialOffer();
    const block = document.getElementById('guestPayMethodBlock');
    const hint = document.getElementById('guestSpecialOfferPayHint');
    const tag = document.getElementById('guestSpecialOfferTag');
    const offerHidden = document.getElementById('specialOfferId');
    const arrivalHint = document.getElementById('arrivalDiscountHint');

    if (offerHidden) {
      offerHidden.value = selectedSpecialOffer?.id ? String(selectedSpecialOffer.id) : '';
    }
    if (block) block.hidden = !cashOnly;
    if (hint) hint.hidden = !cashOnly;
    if (tag) {
      tag.hidden = !selectedSpecialOffer?.id;
      const label = tag.querySelector('span');
      if (label) {
        label.textContent = selectedSpecialOffer?.title
          ? `${tx('booking.specialOfferTag', null, 'Special offer')}: ${selectedSpecialOffer.title}`
          : tx('booking.specialOfferTag', null, 'Special offer');
      }
    }

    selectedPayMethod = 'Cash';

    if (arrivalHint) {
      arrivalHint.textContent = cashOnly
        ? tx(
            'booking.arrivalDiscountBlockedByOffer',
            null,
            'Senior Citizen and PWD discounts are verified at arrival only, and cannot be combined with this special offer.'
          )
        : tx(
            'booking.arrivalDiscountHint',
            null,
            'Senior Citizen and PWD discounts take effect only at arrival. Reception verifies your ID at the front desk — they are not applied online. They cannot be combined with an active special offer or walk-in promo.'
          );
    }
  }

  function selectGuestPayMethod(method) {
    selectedPayMethod = 'Cash';
    syncGuestPayMethodUi();
  }

  function fillBookRoom(roomName) {
    const pageSelect = document.getElementById('bookRoomTypeSelect');
    if (pageSelect && roomName) pageSelect.value = roomName;
  }

  function setMessage(el, text, ok) {
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.classList.toggle('is-ok', !!ok);
    el.classList.toggle('is-error', !!text && !ok);
  }

  function clearBookRequiredErrors() {
    document.querySelectorAll('.guest-book-section.is-invalid-required').forEach((section) => {
      section.classList.remove('is-invalid-required');
    });
    document.querySelectorAll('#bookModalForm .is-invalid').forEach((el) => {
      el.classList.remove('is-invalid');
    });
    const guestMsg = document.getElementById('guestDetailsRequiredMsg');
    const dateMsg = document.getElementById('stayDatesRequiredMsg');
    if (guestMsg) {
      guestMsg.hidden = true;
      guestMsg.textContent = '';
    }
    if (dateMsg) {
      dateMsg.hidden = true;
      dateMsg.textContent = '';
    }
  }

  function markFieldInvalid(el) {
    if (!el) return;
    el.classList.add('is-invalid');
    el.closest('label')?.classList.add('is-invalid');
  }

  function formatRequiredList(items) {
    if (!items.length) return '';
    if (items.length === 1) {
      return tx('booking.validateRequiredOne', { a: items[0] }, `${items[0]} is required.`);
    }
    if (items.length === 2) {
      return tx(
        'booking.validateRequiredTwo',
        { a: items[0], b: items[1] },
        `${items[0]} and ${items[1]} are required.`
      );
    }
    return tx(
      'booking.validateRequiredList',
      { list: items.slice(0, -1).join(', '), last: items[items.length - 1] },
      `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]} are required.`
    );
  }

  function validateBookRequiredFields() {
    clearBookRequiredErrors();

    const nameEl = document.getElementById('guestName');
    const emailEl = document.getElementById('guestEmail');
    const phoneEl = document.getElementById('guestPhone');
    const checkInEl = document.getElementById('modalCheckIn');
    const checkOutEl = document.getElementById('modalCheckOut');
    const guestSection = document.getElementById('bookGuestSection');
    const datesSection = document.getElementById('bookDatesSection');
    const guestMsg = document.getElementById('guestDetailsRequiredMsg');
    const dateMsg = document.getElementById('stayDatesRequiredMsg');

    const name = nameEl?.value.trim() || '';
    const email = emailEl?.value.trim() || '';
    const phone = phoneEl?.value.trim() || '';
    const checkIn = checkInEl?.value || '';
    const checkOut = checkOutEl?.value || '';

    const guestMissing = [];
    const dateMissing = [];
    const allMissing = [];
    let focusEl = null;

    if (!name) {
      guestMissing.push(tx('booking.fullName', null, 'Full name'));
      allMissing.push(tx('booking.fullName', null, 'Full name'));
      markFieldInvalid(nameEl);
      focusEl = focusEl || nameEl;
    }
    if (!email) {
      guestMissing.push(tx('booking.email', null, 'Email'));
      allMissing.push(tx('booking.email', null, 'Email'));
      markFieldInvalid(emailEl);
      focusEl = focusEl || emailEl;
    }
    if (!phone) {
      guestMissing.push(tx('booking.phone', null, 'Phone'));
      allMissing.push(tx('booking.phone', null, 'Phone'));
      markFieldInvalid(phoneEl);
      focusEl = focusEl || phoneEl;
    }
    if (!checkIn) {
      dateMissing.push(tx('booking.checkInDate', null, 'Check-in date'));
      allMissing.push(tx('booking.checkInDate', null, 'Check-in date'));
      markFieldInvalid(checkInEl);
      focusEl = focusEl || checkInEl;
    }
    if (!checkOut) {
      dateMissing.push(tx('booking.checkOutDate', null, 'Check-out date'));
      allMissing.push(tx('booking.checkOutDate', null, 'Check-out date'));
      markFieldInvalid(checkOutEl);
      focusEl = focusEl || checkOutEl;
    }

    if (guestMissing.length) {
      guestSection?.classList.add('is-invalid-required');
      if (guestMsg) {
        guestMsg.hidden = false;
        guestMsg.textContent = formatRequiredList(
          guestMissing.map((item) => (item === 'name' ? 'Name' : item))
        );
      }
    }

    if (dateMissing.length) {
      datesSection?.classList.add('is-invalid-required');
      if (dateMsg) {
        dateMsg.hidden = false;
        dateMsg.textContent = formatRequiredList(dateMissing);
      }
    }

    if (allMissing.length) {
      focusEl?.focus();
      return {
        ok: false,
        message: formatRequiredList(allMissing),
      };
    }

    if (email && !email.includes('@')) {
      guestSection?.classList.add('is-invalid-required');
      markFieldInvalid(emailEl);
      if (guestMsg) {
        guestMsg.hidden = false;
        guestMsg.textContent = tx('booking.validateEmail', null, 'Enter a valid email address.');
      }
      emailEl?.focus();
      return { ok: false, message: tx('booking.validateEmail', null, 'Enter a valid email address.') };
    }

    if (phone && !isValidPhone(phone)) {
      guestSection?.classList.add('is-invalid-required');
      markFieldInvalid(phoneEl);
      if (guestMsg) {
        guestMsg.hidden = false;
        guestMsg.textContent = tx('booking.validatePhone', null, 'Enter a valid phone number.');
      }
      phoneEl?.focus();
      return { ok: false, message: tx('booking.validatePhone', null, 'Enter a valid phone number.') };
    }

    const dateError = validateDates(checkIn, checkOut);
    if (dateError) {
      datesSection?.classList.add('is-invalid-required');
      markFieldInvalid(checkInEl);
      markFieldInvalid(checkOutEl);
      if (dateMsg) {
        dateMsg.hidden = false;
        dateMsg.textContent = dateError;
      }
      checkInEl?.focus();
      return { ok: false, message: dateError };
    }

    return { ok: true, message: '' };
  }

  function todayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function addDaysIso(isoDate, days) {
    const parts = isoDate.split('-').map(Number);
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    dt.setDate(dt.getDate() + days);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function isoToLocalDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function formatStayChipDate(dt) {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(dt);
  }

  function renderStayDateHighlighter(checkInEl, checkOutEl) {
    if (!checkInEl || !checkOutEl) return;
    if (checkInEl.id !== 'modalCheckIn' || checkOutEl.id !== 'modalCheckOut') return;

    const wrap = document.getElementById('stayDateHighlight');
    const title = document.getElementById('stayDateHighlightTitle');
    const track = document.getElementById('stayDateHighlightTrack');
    if (!wrap || !track) return;

    track.innerHTML = '';
    const checkIn = checkInEl.value || '';
    const checkOut = checkOutEl.value || '';
    const start = isoToLocalDate(checkIn);
    const end = isoToLocalDate(checkOut);
    if (!start || !end || end <= start) {
      wrap.hidden = true;
      return;
    }

    const nights = nightCount(checkIn, checkOut);
    const titleText = tx(
      'booking.selectedStayRange',
      { n: nights },
      `Selected stay (${nights} ${nights === 1 ? 'night' : 'nights'})`
    );
    if (title) title.textContent = titleText;

    const cursor = new Date(start);
    let index = 0;
    while (cursor < end && index < 60) {
      const chip = document.createElement('span');
      chip.className = 'guest-stay-chip';
      if (index === 0) chip.classList.add('is-start');
      chip.textContent = formatStayChipDate(cursor);
      track.appendChild(chip);
      cursor.setDate(cursor.getDate() + 1);
      index += 1;
    }

    const endChip = document.createElement('span');
    endChip.className = 'guest-stay-chip is-end';
    endChip.textContent = `${tx('booking.checkoutShort', null, 'Out')} ${formatStayChipDate(end)}`;
    track.appendChild(endChip);
    wrap.hidden = false;
  }

  function applyDateLimits(checkInEl, checkOutEl) {
    if (!checkInEl || !checkOutEl) return;
    const today = todayIso();
    checkInEl.min = today;
    if (checkInEl.value && checkInEl.value < today) {
      checkInEl.value = today;
    }

    const minNights = Math.max(1, cartRequiredMinNights());
    const baseIn = checkInEl.value || today;
    const checkoutMin = addDaysIso(baseIn, minNights);
    checkOutEl.min = checkoutMin;
    if (checkOutEl.value && checkOutEl.value < checkoutMin) {
      checkOutEl.value = checkoutMin;
    }
    syncStayLongerDateHint();
    syncStayLongerSuggestionHint();
    renderStayDateHighlighter(checkInEl, checkOutEl);
  }

  function lockDateInputToPicker(el) {
    if (!el || el.dataset.pickerOnly === '1') {
      return;
    }

    el.dataset.pickerOnly = '1';
    el.setAttribute('inputmode', 'none');
    el.setAttribute('autocomplete', 'off');

    const openPicker = () => {
      try {
        if (typeof el.showPicker === 'function') {
          el.showPicker();
        }
      } catch {
        // Native click still opens the calendar when showPicker is blocked.
      }
    };

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.key === 'Escape') {
        return;
      }
      e.preventDefault();
    });
    el.addEventListener('paste', (e) => e.preventDefault());
    el.addEventListener('drop', (e) => e.preventDefault());
    el.addEventListener('click', openPicker);
  }

  function wireDateLimits(checkInEl, checkOutEl) {
    if (!checkInEl || !checkOutEl || checkInEl.dataset.dateLimitsWired === '1') {
      applyDateLimits(checkInEl, checkOutEl);
      return;
    }

    checkInEl.dataset.dateLimitsWired = '1';
    lockDateInputToPicker(checkInEl);
    lockDateInputToPicker(checkOutEl);
    applyDateLimits(checkInEl, checkOutEl);
    checkInEl.addEventListener('change', () => applyDateLimits(checkInEl, checkOutEl));
    checkOutEl.addEventListener('focus', () => applyDateLimits(checkInEl, checkOutEl));
  }

  function validateDates(checkIn, checkOut) {
    if (!checkIn || !checkOut) {
      return tx('booking.validateDates', null, 'Please choose check-in and check-out dates.');
    }
    const today = todayIso();
    if (checkIn < today) {
      return tx(
        'booking.validatePastCheckIn',
        null,
        'Past dates cannot be booked. Choose today or a future check-in.'
      );
    }
    if (checkOut <= checkIn) {
      return tx('booking.validateCheckOutAfter', null, 'Check-out must be after check-in.');
    }
    if (checkOut < today) {
      return tx(
        'booking.validatePastCheckOut',
        null,
        'Past dates cannot be booked. Choose a future check-out.'
      );
    }
    const nights = nightCount(checkIn, checkOut);
    const required = cartRequiredMinNights();
    if (required > 1 && nights < required) {
      return tx(
        'booking.validateMinStayOffer',
        { n: required },
        `This stay-longer offer requires at least ${required} nights. Extend your check-out.`
      );
    }
    return '';
  }

  /** Last availability snapshot from /api/bookings/availability (per selected dates). */
  let lastAvailabilitySnapshot = [];

  function formatSoldOutDateLabel(isoDate) {
    if (!isoDate) return '';
    const parts = String(isoDate).split('-').map(Number);
    if (parts.length < 3) return isoDate;
    const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function soldOutDatesForItem(item) {
    const raw = item?.soldOutDates ?? item?.SoldOutDates;
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  }

  function buildSoldOutMessages(items, cartLines = bookingCart) {
    const list = Array.isArray(items) ? items : [];
    const byId = new Map(list.map((item) => [Number(item.roomTypeId ?? item.RoomTypeId), item]));
    const messages = [];
    const seen = new Set();

    const lines = Array.isArray(cartLines) && cartLines.length ? cartLines : [];
    const targets = lines.length
      ? lines.map((line) => ({
          roomTypeId: Number(line.roomTypeId || 0),
          roomType: line.roomType,
          qty: Number(line.qty || 0),
        }))
      : list.map((item) => ({
          roomTypeId: Number(item.roomTypeId ?? item.RoomTypeId),
          roomType: item.roomTypeName ?? item.RoomTypeName ?? '',
          qty: 0,
        }));

    targets.forEach((target) => {
      const item = byId.get(target.roomTypeId);
      if (!item) return;
      const remaining = Number(item.remaining ?? item.Remaining ?? 0);
      const soldOutDates = soldOutDatesForItem(item);
      const name = target.roomType || item.roomTypeName || item.RoomTypeName || 'Room';
      const key = `${target.roomTypeId}:${remaining}:${soldOutDates.join(',')}`;
      if (seen.has(key)) return;
      seen.add(key);

      if (soldOutDates.length) {
        const labels = soldOutDates.map(formatSoldOutDateLabel).join(', ');
        messages.push(
          tx(
            'booking.soldOutNightMessage',
            { room: name, dates: labels },
            `${name} is fully booked on ${labels}.`
          )
        );
      } else if (remaining < 1 || (target.qty > 0 && remaining < target.qty)) {
        messages.push(
          tx(
            'booking.soldOutStayMessage',
            { room: name },
            `${name} has no rooms left for your entire stay.`
          )
        );
      }
    });

    return messages;
  }

  function hasSoldOutConflict() {
    if (!lastAvailabilitySnapshot.length) return false;
    const byId = new Map(
      lastAvailabilitySnapshot.map((item) => [Number(item.roomTypeId ?? item.RoomTypeId), item])
    );

    if (bookingCart.length) {
      return bookingCart.some((line) => {
        const item = byId.get(Number(line.roomTypeId || 0));
        const remaining = item ? Number(item.remaining ?? item.Remaining ?? 0) : 0;
        return remaining < Number(line.qty || 0);
      });
    }

    return lastAvailabilitySnapshot.some((item) => Number(item.remaining ?? item.Remaining ?? 0) < 1);
  }

  function updateSoldOutDatesUi() {
    const msgEl = document.getElementById('stayDatesAvailabilityMsg');
    const offerMsgEl = document.getElementById('offerDatesAvailabilityMsg');
    const checkIn = modalCheckIn?.value || '';
    const checkOut = modalCheckOut?.value || '';
    if (!msgEl && !offerMsgEl) return;

    if (!checkIn || !checkOut || validateDates(checkIn, checkOut)) {
      if (msgEl) {
        msgEl.hidden = true;
        msgEl.textContent = '';
      }
      if (offerMsgEl) {
        offerMsgEl.hidden = true;
        offerMsgEl.textContent = '';
      }
      return;
    }

    const messages = buildSoldOutMessages(lastAvailabilitySnapshot);
    const text = messages.join(' ');
    if (messages.length) {
      if (msgEl) {
        msgEl.hidden = false;
        msgEl.textContent = text;
      }
      if (offerMsgEl) {
        offerMsgEl.hidden = false;
        offerMsgEl.textContent = text;
      }
    } else {
      if (msgEl) {
        msgEl.hidden = true;
        msgEl.textContent = '';
      }
      if (offerMsgEl) {
        offerMsgEl.hidden = true;
        offerMsgEl.textContent = '';
      }
    }
  }

  function syncOfferCardsFromAvailability(byId) {
    document
      .querySelectorAll('#offerRoomList .guest-offer-card[data-offer-room-id]')
      .forEach((card) => {
        const roomTypeId = Number(card.getAttribute('data-offer-room-id') || 0);
        const item = byId.get(roomTypeId);
        const remaining = item ? Number(item.remaining ?? item.Remaining ?? 0) : 0;
        const soldOut = remaining < 1;
        card.classList.toggle('is-sold-out', soldOut);
        card.dataset.available = String(remaining);

        const badge = card.querySelector('.guest-offer-availability');
        if (badge) {
          badge.textContent = soldOut
            ? tx('rooms.fullyBooked', null, 'Fully booked')
            : tx('booking.nAvailable', { n: remaining }, `${remaining} available`);
          badge.classList.toggle('is-sold-out', soldOut);
        }

        const selectBtn = card.querySelector('[data-offer-add]');
        if (selectBtn) {
          selectBtn.disabled = soldOut;
          if (soldOut) {
            selectBtn.textContent = tx('booking.soldOutForDates', null, 'Fully booked for these dates');
          } else {
            const inCart = qtyForRoomType(card.getAttribute('data-offer-room-type') || '') > 0;
            selectBtn.textContent = inCart
              ? tx('rooms.inYourStay', null, 'In your stay')
              : tx('booking.addRoom', null, 'Add room');
          }
        }
      });
  }

  function applyLiveAvailability(items) {
    lastAvailabilitySnapshot = Array.isArray(items) ? items : [];
    const byId = new Map(
      lastAvailabilitySnapshot.map((item) => [Number(item.roomTypeId ?? item.RoomTypeId), item])
    );

    document.querySelectorAll('.guest-room[data-room-type-id]').forEach((card) => {
      const item = byId.get(Number(card.dataset.roomTypeId || 0));
      const remaining = item ? Number(item.remaining ?? item.Remaining ?? 0) : 0;
      const soldOut = remaining < 1;
      card.dataset.available = String(remaining);
      card.classList.toggle('is-sold-out', soldOut);

      const availability = card.querySelector('.guest-room-availability');
      if (availability) {
        availability.textContent = soldOut
          ? tx('rooms.fullyBooked', null, 'Fully booked')
          : tx('booking.nAvailable', { n: remaining }, `${remaining} available`);
        availability.classList.toggle('is-sold-out', soldOut);
        availability.classList.toggle('is-unavailable', soldOut);
      }

      const bookButton = card.querySelector('[data-guest-modal="guests"], [data-guest-modal="book"]');
      if (bookButton) bookButton.disabled = soldOut;
    });

    syncOfferCardsFromAvailability(byId);

    let hasShortage = false;
    bookingCart.forEach((line) => {
      const item = byId.get(Number(line.roomTypeId || 0));
      line.available = item ? Number(item.remaining ?? item.Remaining ?? 0) : 0;
      line.soldOutDates = item ? soldOutDatesForItem(item) : [];
      if (!cartLineUsesSpecialOffer(line)) {
        line.price = item ? Number(item.pricePerNight ?? item.PricePerNight ?? line.price) : line.price;
        line.regularPrice = line.price;
      } else if (item) {
        line.regularPrice = Number(item.pricePerNight ?? item.PricePerNight ?? line.regularPrice ?? 0);
      }
      if (line.qty > line.available) hasShortage = true;
    });
    reapplySpecialOfferPrices();
    renderCart();
    syncModalQtyMax();
    updateSoldOutDatesUi();
    syncOfferContinueState();
    return hasShortage;
  }

  async function refreshLiveAvailability(checkIn, checkOut) {
    if (validateDates(checkIn, checkOut)) return;
    try {
      const checkInAtUtc = toManilaDateTimeIso(checkIn, selectedCheckInTime());
      const checkoutTimeUtc = toManilaDateTimeIso(checkOut, selectedCheckOutTime());
      const query = new URLSearchParams({ checkInAtUtc, checkoutTimeUtc });
      const response = await fetch(`/api/bookings/availability?${query}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const hasShortage = applyLiveAvailability(await response.json());
      if (hasShortage) {
        setMessage(
          bookMsg,
          tx(
            'booking.notEnoughRoomsDates',
            null,
            'Not enough rooms for these dates (other bookings or reservations may already hold them). Adjust room types or dates.'
          ),
          false
        );
      } else if (hasSoldOutConflict() && bookWizardStep !== 'dates') {
        setMessage(bookMsg, buildSoldOutMessages(lastAvailabilitySnapshot).join(' '), false);
      } else if (bookWizardStep === 'dates') {
        setMessage(bookMsg, '', false);
      }
    } catch {
      // The submit endpoint performs the authoritative availability check.
    }
  }

  function nightCount(checkIn, checkOut) {
    if (!checkIn || !checkOut) return 0;
    const start = new Date(`${checkIn}T12:00:00`);
    const end = new Date(`${checkOut}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  }

  function stayTotalAmount() {
    const nights = nightCount(modalCheckIn?.value || '', modalCheckOut?.value || '');
    if (nights < 1) return 0;
    return cartNightlyTotal() * nights + stayFeesTotal();
  }

  function selectedPaymentOption() {
    return 'Full';
  }

  function updatePaymentPreview() {
    updateStayTimeFeesHint();
  }

  function setPaymentOption() {
    const hidden = document.getElementById('paymentOption');
    if (hidden) hidden.value = 'Full';
    updatePaymentPreview();
    syncCartSubmitState();
  }

  /** Preview only; classification is always Booking (payment choice removed). */
  function classifyStayFromPayment() {
    return {
      kind: 'booking',
      label: 'Booking',
      hint: 'Your request will be held as a booking. Reception will call to verify before check-in.',
    };
  }

  function updateLeadHint(checkInInput, hintEl, form) {
    if (!hintEl) return;
    // Lead-time hint is no longer authoritative; payment option drives classification.
    if (form?.id === 'bookModalForm') {
      hintEl.hidden = true;
      hintEl.textContent = '';
      return;
    }
    const result = classifyStayFromPayment(selectedPaymentOption());
    if (!result) {
      hintEl.hidden = true;
      hintEl.textContent = '';
      return;
    }
    hintEl.hidden = false;
    hintEl.textContent = result.hint;
    hintEl.classList.toggle('is-reservation', result.kind === 'reservation');
    hintEl.classList.toggle('is-booking', result.kind === 'booking');
  }

  function showSuccess(classification, message) {
    const successEyebrow = document.getElementById('successEyebrow');
    const successTitle = document.getElementById('successTitle');
    const successMessage = document.getElementById('successMessage');
    if (successEyebrow) successEyebrow.textContent = classification.label || tx('booking.booking', null, 'Booking');
    if (successTitle) {
      successTitle.textContent =
        classification.kind === 'reservation' ? tx('booking.successTitleReservation', null, 'Reservation received') : tx('booking.successTitleBooking', null, 'Booking received');
    }
    if (successMessage) successMessage.textContent = message;
    openModal(successModal);
    showToast(tx('booking.toastRequestSent', null, 'Booking request sent.'), true);
  }


  function guestTotals() {
    return guestRooms.reduce(
      (acc, room) => {
        acc.adults += Number(room.adults) || 0;
        acc.children += Number(room.children) || 0;
        acc.rooms += 1;
        return acc;
      },
      { adults: 0, children: 0, rooms: 0 }
    );
  }

  function partySummaryText() {
    const totals = guestTotals();
    const guestCount = totals.adults + totals.children;
    const childrenPart = totals.children ? tx('booking.partyChildrenPart', { n: totals.children, suffix: totals.children === 1 ? '' : 'ren' }, ` · ${totals.children} child${totals.children === 1 ? '' : 'ren'}`) : '';
    return tx('booking.partySummary', {
      guests: guestCount,
      guestsSuffix: guestCount === 1 ? '' : 's',
      rooms: totals.rooms,
      roomsSuffix: totals.rooms === 1 ? '' : 's',
      adults: totals.adults,
      adultsSuffix: totals.adults === 1 ? '' : 's',
      childrenPart
    }, `${guestCount} guest${guestCount === 1 ? '' : 's'} · ${totals.rooms} room${totals.rooms === 1 ? '' : 's'} · ${totals.adults} adult${totals.adults === 1 ? '' : 's'}${childrenPart}`);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function syncGuestFlowSummary() {
    const el = document.getElementById('guestFlowSummaryText');
    if (!el) return;
    const totals = guestTotals();
    const guestCount = totals.adults + totals.children;
    const key = totals.rooms === 1 ? 'rooms.guestsSummary' : 'rooms.guestsSummaryPluralRooms';
    el.textContent = tx(
      key,
      { guests: guestCount, rooms: totals.rooms },
      `${guestCount} guest${guestCount === 1 ? '' : 's'} · ${totals.rooms} room${totals.rooms === 1 ? '' : 's'}`
    );
  }

  function showGuestsHint(message) {
    const hint = document.getElementById('guestsHint');
    if (!hint) return;
    hint.hidden = !message;
    hint.textContent = message || '';
    clearTimeout(guestsHintTimer);
    if (message) {
      guestsHintTimer = setTimeout(() => {
        hint.hidden = true;
        hint.textContent = '';
      }, 4200);
    }
  }

  function ageOptionsHtml(selected) {
    let html = `<option value="">${tx('booking.selectAge', null, 'Select age')}</option>`;
    for (let age = 0; age <= MAX_CHILD_AGE; age += 1) {
      const label = age === 0 
        ? tx('booking.under1Year', null, 'Under 1 year')
        : age === 1 
          ? tx('booking.yearsOld', { n: age }, `${age} year old`)
          : tx('booking.yearsOldPlural', { n: age }, `${age} years old`);
      const isSelected = selected !== null && selected !== undefined && Number(selected) === age;
      html += `<option value="${age}"${isSelected ? ' selected' : ''}>${label}</option>`;
    }
    return html;
  }

  function clampGuestRoomsCapacity() {
    for (let i = 0; i < guestRooms.length; i += 1) {
      const room = guestRooms[i];
      let a = Number(room.adults) || 1;
      let c = Number(room.children) || 0;
      if (a + c > MAX_GUESTS_PER_ROOM) {
        c = Math.max(0, MAX_GUESTS_PER_ROOM - a);
        if (a > MAX_GUESTS_PER_ROOM) a = MAX_GUESTS_PER_ROOM;
      }
      room.adults = a;
      room.children = c;
      if (Array.isArray(room.childAges)) {
        room.childAges.length = c;
      }
    }
  }

  function renderGuestsRooms() {
    const list = document.getElementById('guestsRoomList');
    if (!list) return;

    clampGuestRoomsCapacity();

    list.innerHTML = guestRooms
      .map((room, index) => {
        const total = (Number(room.adults) || 0) + (Number(room.children) || 0);
        const overCapacity = total > MAX_GUESTS_PER_ROOM;
        const atCapacity = total >= MAX_GUESTS_PER_ROOM;
        const canInc = total < MAX_GUESTS_PER_ROOM;
        const canDecAdult = (Number(room.adults) || 0) > 1;
        const canDecChild = (Number(room.children) || 0) > 0;
        const hasExtra = roomHasExtraGuest(room);
        const removeBtn =
          index === 0
            ? ''
            : `<button type="button" class="guest-guests-remove" data-guest-remove-room="${index}" aria-label="${tx('booking.removeRoomAria', { n: index + 1 }, `Remove room ${index + 1}`)}">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
              </button>`;

        const ages =
          (Number(room.children) || 0) > 0
            ? `<div class="guest-guests-ages">
                <span class="guest-guests-ages-label">${tx('booking.childAge', { n: room.children }, `${room.children} child${room.children === 1 ? '' : "ren"}'s age`)}</span>
                <div class="guest-guests-ages-grid">
                  ${Array.from({ length: room.children }, (_, childIndex) => {
                    const age = room.childAges[childIndex];
                    return `<label class="guest-guests-age-field">
                      <span class="visually-hidden">${tx('booking.childAge', { n: childIndex + 1 }, `Child ${childIndex + 1} age`)}</span>
                      <select data-guest-age="${index}" data-guest-age-index="${childIndex}">
                        ${ageOptionsHtml(age)}
                      </select>
                    </label>`;
                  }).join('')}
                </div>
              </div>`
            : '';

        const tooltipMsg = tx('booking.maxGuestsPerRoom', { n: MAX_GUESTS_PER_ROOM }, `Each room holds up to ${MAX_GUESTS_PER_ROOM} guests. Please add another room for additional guests.`);
        const tooltipAttr = !canInc ? ` data-tooltip="${tooltipMsg}"` : '';
        const titleAttr = !canInc ? ` title="${tooltipMsg}"` : '';
        const extraNote = hasExtra
          ? `<p class="guest-guests-extra-note">${tx('booking.extraPersonFeeNote', { fee: EXTRA_PERSON_FEE_PER_NIGHT.toFixed(0) }, `Extra person · ₱${EXTRA_PERSON_FEE_PER_NIGHT.toFixed(0)}/night`)}</p>`
          : '';

        return `<article class="guest-guests-room${atCapacity ? ' is-at-capacity' : ''}${overCapacity ? ' is-over-capacity' : ''}${hasExtra ? ' has-extra-person' : ''}" data-guest-room="${index}">
          <div class="guest-guests-room-head">
            <h3>${tx('booking.roomLabel', { n: index + 1 }, `Room ${index + 1}`)}</h3>
            ${removeBtn}
          </div>
          <div class="guest-guests-counters">
            <div class="guest-guests-counter">
              <span class="guest-guests-counter-label">${tx('booking.adults', null, 'Adults')}</span>
              <div class="guest-guests-stepper">
                <div class="guest-stepper-btn-wrap">
                  <button type="button" data-guest-step="adults" data-guest-room-index="${index}" data-guest-delta="-1" aria-label="${tx('booking.fewerAdultsAria', { n: index + 1 }, `Fewer adults in room ${index + 1}`)}" ${canDecAdult ? '' : 'disabled'}>−</button>
                </div>
                <span aria-live="polite">${room.adults}</span>
                <div class="guest-stepper-btn-wrap${!canInc ? ' has-tooltip' : ''}"${tooltipAttr}>
                  <button type="button" data-guest-step="adults" data-guest-room-index="${index}" data-guest-delta="1" aria-label="${tx('booking.moreAdultsAria', { n: index + 1 }, `More adults in room ${index + 1}`)}" ${canInc ? '' : 'disabled'}${titleAttr}>+</button>
                </div>
              </div>
            </div>
            <div class="guest-guests-counter">
              <span class="guest-guests-counter-label">${tx('booking.childrenUnder12', null, 'Children under 12')}</span>
              <div class="guest-guests-stepper">
                <div class="guest-stepper-btn-wrap">
                  <button type="button" data-guest-step="children" data-guest-room-index="${index}" data-guest-delta="-1" aria-label="${tx('booking.fewerChildrenAria', { n: index + 1 }, `Fewer children in room ${index + 1}`)}" ${canDecChild ? '' : 'disabled'}>−</button>
                </div>
                <span aria-live="polite">${room.children}</span>
                <div class="guest-stepper-btn-wrap${!canInc ? ' has-tooltip' : ''}"${tooltipAttr}>
                  <button type="button" data-guest-step="children" data-guest-room-index="${index}" data-guest-delta="1" aria-label="${tx('booking.moreChildrenAria', { n: index + 1 }, `More children in room ${index + 1}`)}" ${canInc ? '' : 'disabled'}${titleAttr}>+</button>
                </div>
              </div>
            </div>
          </div>
          ${ages}
          ${extraNote}
        </article>`;
      })
      .join('');

    syncGuestFlowSummary();
    syncGuestsContinueState();
  }

  function syncGuestsContinueState() {
    const btn = document.getElementById('guestsSubmitBtn');
    if (!btn) return;
    const over = guestRoomsOverCapacity();
    btn.disabled = over;
    btn.title = over
      ? tx('booking.capacityHint', null, 'Guests exceed room capacity. Add more rooms or reduce guests.')
      : '';
  }

  function adjustGuestCount(roomIndex, field, delta) {
    const room = guestRooms[roomIndex];
    if (!room) return;

    const adults = Number(room.adults) || 0;
    const children = Number(room.children) || 0;
    const currentTotal = adults + children;

    if (delta > 0 && currentTotal >= MAX_GUESTS_PER_ROOM) {
      showGuestsHint(
        tx(
          'booking.maxGuestsPerRoom',
          { n: MAX_GUESTS_PER_ROOM },
          `Each room holds up to ${MAX_GUESTS_PER_ROOM} guests. Please add another room for additional guests.`
        )
      );
      return;
    }

    if (field === 'adults') {
      const next = adults + delta;
      if (next < 1) return;
      if (next + children > MAX_GUESTS_PER_ROOM) {
        showGuestsHint(
          tx(
            'booking.maxGuestsPerRoom',
            { n: MAX_GUESTS_PER_ROOM },
            `Each room holds up to ${MAX_GUESTS_PER_ROOM} guests. Please add another room for additional guests.`
          )
        );
        return;
      }
      room.adults = next;
    } else {
      const next = children + delta;
      if (next < 0) return;
      if (adults + next > MAX_GUESTS_PER_ROOM) {
        showGuestsHint(
          tx(
            'booking.maxGuestsPerRoom',
            { n: MAX_GUESTS_PER_ROOM },
            `Each room holds up to ${MAX_GUESTS_PER_ROOM} guests. Please add another room for additional guests.`
          )
        );
        return;
      }
      room.children = next;
      while (room.childAges.length < next) room.childAges.push(null);
      room.childAges.length = next;
    }

    showGuestsHint('');
    renderGuestsRooms();
  }

  function maxInventoryAvailable() {
    const counts = Array.from(document.querySelectorAll('.guest-room[data-room-type-id]')).map((card) =>
      Number(card.getAttribute('data-available') || 0)
    );
    return counts.length ? Math.max(0, ...counts) : 0;
  }

  function maxGuestCapacityAcrossInventory() {
    let maxRooms = 0;
    document.querySelectorAll('.guest-room[data-room-type-id]').forEach((card) => {
      const available = Number(card.getAttribute('data-available') || 0);
      maxRooms = Math.max(maxRooms, available);
    });
    return maxPartyForRoomCount(maxRooms);
  }

  function capacityShortageMessage(roomCount = guestRooms.length, roomType = '') {
    const totals = guestTotals();
    const guestCount = totals.adults + totals.children;
    const configuredCapacity = maxPartyForRoomCount(roomCount);
    const maxAvailable = maxInventoryAvailable();
    const maxCapacity = maxGuestCapacityAcrossInventory();
    const parts = [];

    if (guestCount > configuredCapacity) {
      const roomsNeeded = Math.max(
        1,
        Math.ceil(guestCount / MAX_GUESTS_PER_ROOM)
      );
      parts.push(
        `${guestCount} guests need at least ${roomsNeeded} room${roomsNeeded === 1 ? '' : 's'} (up to ${BASE_GUESTS_PER_ROOM} included per room, plus one extra guest per room).`
      );
    }

    if (roomCount > maxAvailable) {
      parts.push(
        maxAvailable < 1
          ? `No rooms currently show as available for your party of ${guestCount}.`
          : `You selected ${roomCount} room${roomCount === 1 ? '' : 's'}, but only ${maxAvailable} room${maxAvailable === 1 ? '' : 's'} currently available.`
      );
    }

    if (guestCount > maxCapacity && maxCapacity >= 0) {
      parts.push(
        maxCapacity < 1
          ? `Available inventory cannot accommodate ${guestCount} guests right now.`
          : `Available rooms can hold about ${maxCapacity} guest${maxCapacity === 1 ? '' : 's'}, but your party has ${guestCount}.`
      );
    }

    if (roomType) {
      const meta = getRoomMeta(roomType);
      if (meta?.roomType) {
        const qty = Math.min(roomCount, Math.max(0, meta.available));
        const hold = maxPartyForRoomCount(qty);
        if (guestCount > hold) {
          parts.push(
            `${meta.roomType} with ${qty} room${qty === 1 ? '' : 's'} holds up to ${hold} guest${hold === 1 ? '' : 's'}; your party has ${guestCount}.`
          );
        }
      }
    }

    return parts.filter(Boolean).join(' ');
  }

  function setCapacityBanner(el, message, { canContinue = true } = {}) {
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      el.classList.remove('is-warning');
      return;
    }
    el.hidden = false;
    el.classList.add('is-warning');
    el.textContent = canContinue
      ? `${message} You can still continue — the hotel will review your request.`
      : message;
  }

  function syncCapacityBanners(selectedRoomType = '') {
    const shortage = capacityShortageMessage(guestRooms.length, selectedRoomType);
    setCapacityBanner(document.getElementById('guestsCapacityBanner'), shortage);
    setCapacityBanner(document.getElementById('offerCapacityBanner'), shortage);
    setCapacityBanner(document.getElementById('bookCapacityBanner'), shortage);
  }

  function addGuestRoom() {
    if (guestRooms.length >= MAX_GUEST_ROOMS) {
      showGuestsHint(`You can book up to ${MAX_GUEST_ROOMS} rooms in one request.`);
      return;
    }
    guestRooms.push({ adults: 1, children: 0, childAges: [] });
    showGuestsHint('');
    renderGuestsRooms();
  }

  function removeGuestRoom(index) {
    if (index < 1 || guestRooms.length <= 1) return;
    guestRooms.splice(index, 1);
    showGuestsHint('');
    renderGuestsRooms();
  }

  function validateGuestRooms() {
    for (let i = 0; i < guestRooms.length; i += 1) {
      const room = guestRooms[i];
      const adults = Number(room.adults) || 0;
      const children = Number(room.children) || 0;
      if (adults < 1) {
        return tx('booking.needAdultInRoom', { n: i + 1 }, `Room ${i + 1} needs at least 1 adult.`);
      }
      if (children > 0) {
        for (let c = 0; c < children; c += 1) {
          const age = room.childAges[c];
          if (age === null || age === undefined || age === '') {
            return tx(
              'booking.selectAgesInRoom',
              { n: i + 1 },
              `Select an age for each child in Room ${i + 1}.`
            );
          }
          if (Number(age) > MAX_CHILD_AGE) {
            return tx(
              'booking.childAgeMax',
              { n: MAX_CHILD_AGE },
              `Children must be ${MAX_CHILD_AGE} years old or under.`
            );
          }
        }
      }
    }
    return '';
  }

  function openGuestsStep(roomName) {
    preferredRoomType = roomName || preferredRoomType || '';
    // Only seed the offer cart when Book was started from a specific room.
    pendingSeedRoomType = roomName ? roomName : '';
    showGuestsHint('');
    renderGuestsRooms();
    openModal(guestsModal);
  }

  function maxGuestsNeededPerRoom() {
    return guestRooms.reduce((max, room) => {
      const total = (Number(room.adults) || 0) + (Number(room.children) || 0);
      return Math.max(max, total);
    }, 0);
  }

  function offerIncludesToggleHtml(key, extraHtml) {
    if (!extraHtml) return '';
    const open = offerIncludesOpen.has(key);
    return `
      <button type="button" class="guest-offer-included-toggle" data-offer-includes="${escapeHtml(key)}" aria-expanded="${open ? 'true' : 'false'}">
        ${open ? tx('booking.hideIncluded', null, 'Hide details') : tx('booking.whatsIncluded', null, 'What’s included')}
      </button>
      <div class="guest-offer-included-extra" data-offer-includes-panel="${escapeHtml(key)}" ${open ? '' : 'hidden'}>
        ${extraHtml}
      </div>`;
  }

  function offerRatePriceHtml({ effective, regular, showCompare, pct }) {
    if (showCompare) {
      return `<span class="guest-offer-price-compare">
                ${pct > 0 ? `<span class="guest-room-discount-badge">-${pct}%</span>` : ''}
                <s class="guest-offer-price-was">${formatMoney(regular)}</s>
              </span>
              <strong class="guest-offer-price is-promo">${formatMoney(effective)}</strong>`;
    }
    return `<strong class="guest-offer-price">${formatMoney(effective)}</strong>`;
  }

  function remainingFromAvailabilitySnapshot(roomTypeId, fallback) {
    const checkIn = modalCheckIn?.value || '';
    const checkOut = modalCheckOut?.value || '';
    if (
      !lastAvailabilitySnapshot.length ||
      !checkIn ||
      !checkOut ||
      validateDates(checkIn, checkOut)
    ) {
      return fallback;
    }
    const item = lastAvailabilitySnapshot.find(
      (row) => Number(row.roomTypeId ?? row.RoomTypeId) === roomTypeId
    );
    if (!item) return fallback;
    return Number(item.remaining ?? item.Remaining ?? 0);
  }

  function collectOfferRoomTypes() {
    const cards = Array.from(document.querySelectorAll('.guest-room[data-room-type-id]'));
    return cards
      .map((card) => {
        const roomType = card.getAttribute('data-room-type') || '';
        const roomTypeId = Number(card.getAttribute('data-room-type-id') || 0);
        const price = Number(card.getAttribute('data-price') || 0);
        const occupancy = Number(card.getAttribute('data-occupancy') || 0);
        const beds = Number(card.getAttribute('data-beds') || 0);
        const available = remainingFromAvailabilitySnapshot(
          roomTypeId,
          Number(card.getAttribute('data-available') || 0)
        );
        const images = parseJsonArray(card.getAttribute('data-images'));
        const inclusions = orderInclusionsCustomFirst(parseJsonArray(card.getAttribute('data-inclusions')));
        const description =
          card.querySelector('.guest-room-desc-full')?.textContent?.trim() ||
          card.querySelector('.guest-room-feature-desc')?.textContent?.trim() ||
          '';
        return {
          roomType,
          roomTypeId,
          price,
          occupancy,
          beds,
          available,
          images,
          inclusions,
          description,
          preferred: Boolean(preferredRoomType && roomType === preferredRoomType),
        };
      })
      .filter((item) => item.roomType)
      .sort((a, b) => {
        if (a.available <= 0 && b.available > 0) return 1;
        if (b.available <= 0 && a.available > 0) return -1;
        return Number(b.preferred) - Number(a.preferred) || a.price - b.price;
      });
  }

  function renderOfferPanel() {
    const list = document.getElementById('offerRoomList');
    const empty = document.getElementById('offerEmptyState');
    const party = document.getElementById('offerPartySummary');
    const lede = document.getElementById('offerSelectLede');
    if (!list) return;

    const roomCount = guestRooms.length;
    if (party) party.textContent = partySummaryText();
    if (lede) {
      lede.textContent =
        roomCount > 1
          ? tx('booking.offerLedeMulti', null, 'Add room types for your party. Prices shown are per night.')
          : tx('booking.offerLede', null, 'Add room types to your stay. Prices shown are per night.');
    }

    const items = collectOfferRoomTypes();
    list.innerHTML = '';
    if (empty) {
      empty.hidden = items.length > 0;
      const title = document.getElementById('offerEmptyTitle');
      const message = document.getElementById('offerEmptyMessage');
      if (items.length < 1) {
        const totals = guestTotals();
        const guestCount = totals.adults + totals.children;
        if (title) title.textContent = tx('booking.noRoomsListed', null, 'No rooms listed right now');
        if (message) {
          message.textContent =
            `No available room types are listed for ${guestCount} guest${guestCount === 1 ? '' : 's'}. Check back later, or contact the hotel to continue.`;
        }
      }
    }

    items.forEach((item) => {
      const image = item.images[0] || '';
      const tags = item.inclusions
        .slice(0, 5)
        .map((inc) => `<li>${escapeHtml(inc)}</li>`)
        .join('');
      const more = item.inclusions.length > 5
        ? `<li>${tx('rooms.more', { n: item.inclusions.length - 5 }, `+${item.inclusions.length - 5} more`)}</li>`
        : '';
      const desc =
        item.description.length > 160
          ? `${item.description.slice(0, 160).trimEnd()}…`
          : item.description;
      const safeName = escapeHtml(item.roomType);
      const safeImage = escapeHtml(image);
      const bookQty = Math.min(roomCount, item.available);
      const perRoom = effectiveGuestsPerRoom();
      const qtyNote =
        bookQty < roomCount
          ? tx(
              'booking.roomsOfAvailable',
              { bookQty, roomCount },
              `${bookQty} of ${roomCount} rooms available now`
            )
          : tx(
              'booking.roomsQtyUpTo',
              { qty: bookQty, suffix: bookQty === 1 ? '' : 's', perRoom },
              `${bookQty} room${bookQty === 1 ? '' : 's'} · up to ${perRoom} guests each`
            );
      const bedsLabel =
        Number(item.beds) === 1
          ? tx('rooms.bed', { n: item.beds || '—' }, `${item.beds || '—'} bed`)
          : tx('rooms.beds', { n: item.beds || '—' }, `${item.beds || '—'} beds`);
      const limited = activeLimitedOfferForRoomType(item.roomTypeId);
      const effective =
        limited && Number(limited.promoPricePerNight) > 0
          ? Number(limited.promoPricePerNight)
          : Number(item.price);
      const regular = limited
        ? regularComparePrice(item.roomTypeId, item.price, limited)
        : Number(item.price);
      const showCompare = Boolean(limited && regular > effective);
      const pct = showCompare ? discountPercent(regular, effective) : 0;
      const stayLongerOffers = stayLongerOffersForRoomType(item.roomTypeId);
      const includesKey = `best:${item.roomTypeId}`;
      const extraIncludes = [
        limited ? `<span>${tx('booking.cashOnly', null, 'Cash only')}</span>` : '',
        qtyNote ? `<span>${escapeHtml(qtyNote)}</span>` : '',
      ]
        .filter(Boolean)
        .join('');
      const soldOut = item.available < 1;
      const article = document.createElement('article');
      article.className = `guest-offer-card${item.preferred ? ' is-preferred' : ''}${soldOut ? ' is-sold-out' : ''}`;
      article.id = `offer-room-${item.roomTypeId}`;
      article.setAttribute('data-offer-room-type', item.roomType);
      article.setAttribute('data-offer-room-id', String(item.roomTypeId));
      article.innerHTML = `
        <div class="guest-offer-card-top">
          <div class="guest-offer-media">
            ${
              image
                ? `<img src="${safeImage}" alt="" loading="lazy" />`
                : `<div class="guest-room-placeholder" aria-hidden="true"><span>${(item.roomType || 'R').trim().charAt(0).toUpperCase()}</span></div>`
            }
            <span class="guest-offer-availability${soldOut ? ' is-sold-out' : ''}">${
              soldOut
                ? tx('rooms.fullyBooked', null, 'Fully booked')
                : tx('booking.nAvailable', { n: item.available }, `${item.available} available`)
            }</span>
          </div>
          <div class="guest-offer-copy">
            <button type="button"
                    class="guest-offer-details-btn"
                    data-offer-details="${safeName}"
                    aria-label="${tx('booking.viewRoomDetails', { room: item.roomType }, `View ${item.roomType} details`)}"
                    title="${tx('booking.viewRoomDetails', { room: item.roomType }, `View ${item.roomType} details`)}">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 11v5"/>
                <circle cx="12" cy="8" r="1.15" fill="currentColor" stroke="none"/>
              </svg>
            </button>
            <p class="guest-eyebrow">${tx('booking.guestRoom', null, 'Guest room')}</p>
            <h3>${safeName}</h3>
            <ul class="guest-offer-meta">
              <li>${tx('booking.upToGuestsPerRoom', { n: perRoom }, `Up to ${perRoom} guests / room`)}</li>
              <li>${bedsLabel}</li>
            </ul>
            ${tags ? `<ul class="guest-offer-tags">${tags}${more}</ul>` : ''}
            <p class="guest-offer-desc">${escapeHtml(desc) || tx('booking.defaultOfferDesc', null, 'A comfortable stay with everything you need.')}</p>
          </div>
        </div>
        <div class="guest-offer-rates">
          <div class="guest-offer-rate is-best">
            <div class="guest-offer-rate-copy">
              <strong class="guest-offer-rate-name">${tx('booking.bestDeal', null, 'Best deal')}</strong>
              <p class="guest-offer-rate-kind">${
                limited
                  ? tx('booking.offerKindLimited', null, 'Limited time offer')
                  : tx('booking.bestAvailableRate', null, 'Best Available Rate — Room Only')
              }</p>
              <ul class="guest-offer-rate-includes">
                <li>${tx('booking.roomOnly', null, 'Room only')}</li>
                <li>${tx('booking.mealsNotIncluded', null, 'Meals not included')}</li>
                <li>${tx('booking.wifiAndFacilities', null, 'Wi‑Fi and hotel facilities')}</li>
              </ul>
              ${offerIncludesToggleHtml(includesKey, extraIncludes)}
            </div>
            <div class="guest-offer-rate-price">
              <span class="guest-offer-price-label">${tx('booking.priceFor1Night', null, 'Price for 1 night')}</span>
              ${offerRatePriceHtml({ effective, regular, showCompare, pct })}
              ${limited ? `<span class="guest-offer-price-note">${tx('booking.cashOnly', null, 'Cash only')}</span>` : ''}
              <button type="button"
                      class="guest-btn guest-btn-primary guest-offer-select"
                      data-offer-add=""
                      ${soldOut ? 'disabled' : ''}>
                ${
                  soldOut
                    ? tx('booking.soldOutForDates', null, 'Fully booked for these dates')
                    : tx('booking.addRoom', null, 'Add room')
                }
              </button>
            </div>
          </div>
          ${
            stayLongerOffers.length
              ? `<div class="guest-offer-specials">
            <h4 class="guest-offer-specials-title">${tx('booking.specialOffers', null, 'Special offers')}</h4>
            ${renderSpecialOfferRows(item)}
          </div>`
              : ''
          }
        </div>
      `;
      const detailsBtn = article.querySelector('[data-offer-details]');
      if (detailsBtn) detailsBtn.setAttribute('data-offer-details', item.roomType);
      const selectBtn = article.querySelector('[data-offer-add]');
      if (selectBtn) selectBtn.setAttribute('data-offer-add', item.roomType);
      article.querySelectorAll('[data-stay-longer-room]').forEach((btn) => {
        btn.setAttribute('data-stay-longer-room', item.roomType);
      });
      article.querySelectorAll('[data-offer-more]').forEach((btn) => {
        btn.setAttribute('data-offer-more', item.roomType);
      });
      list.appendChild(article);
    });
    renderOfferBookTags(items);
    renderOfferCart();
  }

  function offerBookTagLabel(name) {
    const raw = String(name || '').trim();
    const stripped = raw.replace(/\s+rooms?\s*$/i, '').trim();
    return stripped || raw;
  }

  function renderOfferBookTags(items) {
    const nav = document.getElementById('offerBookTags');
    if (!nav) return;
    offerBookTagObserver?.disconnect();
    offerBookTagObserver = null;
    if (items.length < 2) {
      nav.hidden = true;
      nav.innerHTML = '';
      return;
    }
    nav.hidden = false;
    nav.setAttribute('aria-label', tx('booking.jumpAria', null, 'Jump to room type'));
    nav.innerHTML = items
      .map((item, index) => {
        const label = offerBookTagLabel(item.roomType);
        const active = index === 0 ? ' is-active' : '';
        return `<button type="button"
                        class="guest-offer-booktag${active}"
                        data-offer-jump-id="${Number(item.roomTypeId)}"
                        aria-pressed="${index === 0 ? 'true' : 'false'}"
                        aria-label="${escapeHtml(tx('booking.jumpToRoom', { room: item.roomType }, `Jump to ${item.roomType}`))}">${escapeHtml(label)}</button>`;
      })
      .join('');
    bindOfferBookTagObserver();
  }

  function setActiveOfferBookTag(roomTypeId) {
    const id = String(roomTypeId || '');
    document.querySelectorAll('#offerBookTags .guest-offer-booktag').forEach((btn) => {
      const active = (btn.getAttribute('data-offer-jump-id') || '') === id;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function offerCatalogScroller() {
    return document.querySelector('#offerSelectModal .guest-offers-layout');
  }

  function offerBookTagsScrollOffset() {
    const tags = document.getElementById('offerBookTags');
    if (!tags || tags.hidden) return 8;
    if (window.matchMedia('(max-width: 899.98px)').matches) {
      return Math.ceil(tags.getBoundingClientRect().height) + 8;
    }
    return 8;
  }

  function scrollOfferRoomIntoView(roomTypeId) {
    const card = document.getElementById(`offer-room-${roomTypeId}`);
    const scroller = offerCatalogScroller();
    if (!card || !scroller) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nextTop = scroller.scrollTop + (card.getBoundingClientRect().top - scroller.getBoundingClientRect().top) - offerBookTagsScrollOffset();
    scroller.scrollTo({ top: Math.max(0, nextTop), behavior: reduceMotion ? 'auto' : 'smooth' });
    setActiveOfferBookTag(roomTypeId);
  }

  function bindOfferBookTagObserver() {
    const scroller = offerCatalogScroller();
    const cards = Array.from(document.querySelectorAll('#offerRoomList .guest-offer-card[id^="offer-room-"]'));
    if (!scroller || cards.length < 2 || !('IntersectionObserver' in window)) return;
    offerBookTagObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const topCard = visible[0]?.target;
        const id = topCard?.getAttribute('data-offer-room-id');
        if (id) setActiveOfferBookTag(id);
      },
      { root: scroller, rootMargin: '-8% 0px -70% 0px', threshold: 0.01 }
    );
    cards.forEach((card) => offerBookTagObserver.observe(card));
  }

  let guestCatalogRefreshTimer = 0;
  let guestCatalogRefreshing = false;

  function normalizeGuestRoomType(raw) {
    return {
      roomTypeId: Number(raw.roomTypeId ?? raw.RoomTypeId ?? 0),
      name: String(raw.name ?? raw.Name ?? '').trim(),
      description: String(raw.description ?? raw.Description ?? '').trim(),
      pricePerNight: Number(raw.pricePerNight ?? raw.PricePerNight ?? 0),
      maxOccupancy: Number(raw.maxOccupancy ?? raw.MaxOccupancy ?? 0),
      bedCount: Number(raw.bedCount ?? raw.BedCount ?? 0),
      availableCount: Number(raw.availableCount ?? raw.AvailableCount ?? 0),
      inclusions: orderInclusionsCustomFirst(raw.inclusions ?? raw.Inclusions ?? []),
      images: Array.isArray(raw.images ?? raw.Images)
        ? [...(raw.images ?? raw.Images)].filter(Boolean)
        : [],
    };
  }

  function renderGuestRoomFeatureTags(card, inclusions) {
    let tagsEl = card.querySelector('.guest-room-feature-tags');
    if (!inclusions.length) {
      if (tagsEl) tagsEl.remove();
      return;
    }
    if (!tagsEl) {
      const copy = card.querySelector('.guest-room-feature-copy');
      const priceEl = card.querySelector('.guest-room-feature-price');
      if (!copy || !priceEl) return;
      tagsEl = document.createElement('ul');
      tagsEl.className = 'guest-room-feature-tags';
      copy.insertBefore(tagsEl, priceEl);
    }
    const visible = inclusions.slice(0, 3);
    const more = inclusions.length - visible.length;
    tagsEl.innerHTML =
      visible.map((inc) => `<li>${escapeHtml(inc)}</li>`).join('') +
      (more > 0 ? `<li data-i18n-more="${more}">+${more} more</li>` : '');
  }

  function applyGuestRoomTypeToCard(card, type) {
    const canBook = type.availableCount > 0;
    card.classList.toggle('is-sold-out', !canBook);
    card.setAttribute('data-fill-room', type.name);
    card.setAttribute('data-room-type', type.name);
    card.setAttribute('data-room-type-id', String(type.roomTypeId));
    card.setAttribute('data-price', type.pricePerNight.toFixed(2));
    card.setAttribute('data-occupancy', String(type.maxOccupancy));
    card.setAttribute('data-beds', String(type.bedCount));
    card.setAttribute('data-available', String(type.availableCount));
    card.setAttribute('data-images', JSON.stringify(type.images));
    card.setAttribute('data-inclusions', JSON.stringify(type.inclusions));

    const title = card.querySelector(`#room-title-${type.roomTypeId}`) || card.querySelector('h2');
    if (title) title.textContent = type.name;

    const descFull = card.querySelector('.guest-room-desc-full');
    if (descFull) descFull.textContent = type.description || '';

    const descEl = card.querySelector('.guest-room-feature-desc');
    if (descEl) {
      if (!type.description) {
        descEl.textContent = tx(
          'rooms.defaultDescription',
          null,
          'A comfortable stay with everything you need for a quiet night in.'
        );
        descEl.setAttribute('data-i18n', 'rooms.defaultDescription');
      } else {
        descEl.removeAttribute('data-i18n');
        const desc = type.description;
        descEl.textContent =
          desc.length > 180 ? `${desc.slice(0, 180).trimEnd()}…` : desc;
      }
    }

    const avail = card.querySelector('.guest-room-availability');
    if (avail) {
      avail.classList.toggle('is-sold-out', !canBook);
      avail.setAttribute('data-available', String(type.availableCount));
      avail.setAttribute('data-i18n-available', String(type.availableCount));
      avail.textContent = canBook
        ? `${type.availableCount} available`
        : tx('rooms.fullyBooked', null, 'Fully booked');
    }

    const upTo = card.querySelector('[data-i18n-up-to]');
    if (upTo) {
      upTo.setAttribute('data-i18n-up-to', String(type.maxOccupancy));
      upTo.textContent = tx(
        'rooms.upToGuests',
        { n: type.maxOccupancy },
        `Up to ${type.maxOccupancy} guests`
      );
    }

    const beds = card.querySelector('[data-i18n-beds]');
    if (beds) {
      beds.setAttribute('data-i18n-beds', String(type.bedCount));
      const bedLabel =
        type.bedCount === 1
          ? tx('rooms.bed', { n: type.bedCount }, `${type.bedCount} bed`)
          : tx('rooms.beds', { n: type.bedCount }, `${type.bedCount} beds`);
      beds.textContent = bedLabel;
    }

    renderGuestRoomFeatureTags(card, type.inclusions);

    const img = card.querySelector('[data-feature-image]');
    const firstImage = type.images[0];
    if (img && firstImage) {
      img.src = firstImage;
      img.alt = type.name;
    }
  }

  function buildGuestRoomCardHtml(type) {
    const canBook = type.availableCount > 0;
    const safeName = escapeHtml(type.name);
    const desc = type.description || '';
    const inclusions = type.inclusions;
    const tagsHtml = inclusions.length
      ? `<ul class="guest-room-feature-tags">${inclusions
          .slice(0, 3)
          .map((inc) => `<li>${escapeHtml(inc)}</li>`)
          .join('')}${
          inclusions.length > 3
            ? `<li data-i18n-more="${inclusions.length - 3}">+${inclusions.length - 3} more</li>`
            : ''
        }</ul>`
      : '';
    const image = type.images[0];
    const mediaHtml = image
      ? `<img src="${escapeHtml(image)}" alt="${safeName}" loading="lazy" data-feature-image />`
      : `<div class="guest-room-placeholder" aria-hidden="true"><span>${escapeHtml(
          (type.name.trim()[0] || 'R').toUpperCase()
        )}</span></div>`;
    const pagerHtml =
      type.images.length > 1
        ? `<div class="guest-feature-pager" data-feature-pager>
            <button type="button" class="guest-feature-pager-btn is-prev" data-feature-prev aria-label="Previous photo for ${safeName}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <span class="guest-feature-pager-count" data-feature-count>1 / ${type.images.length}</span>
            <button type="button" class="guest-feature-pager-btn is-next" data-feature-next aria-label="Next photo for ${safeName}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>`
        : '';

    const descHtml = desc
      ? `<p class="guest-room-feature-desc">${escapeHtml(
          desc.length > 180 ? `${desc.slice(0, 180).trimEnd()}…` : desc
        )}</p>`
      : `<p class="guest-room-feature-desc" data-i18n="rooms.defaultDescription">A comfortable stay with everything you need for a quiet night in.</p>`;

    const bedSuffix = type.bedCount === 1 ? '' : 's';
    const imagesJson = JSON.stringify(type.images).replace(/"/g, '&quot;');
    const inclusionsJson = JSON.stringify(inclusions).replace(/"/g, '&quot;');
    return `<article class="guest-room guest-room-feature guest-reveal guest-reveal--noren${canBook ? '' : ' is-sold-out'}"
         data-reveal
         data-guest-modal="details"
         data-fill-room="${safeName}"
         data-room-type="${safeName}"
         data-room-type-id="${type.roomTypeId}"
         data-price="${type.pricePerNight.toFixed(2)}"
         data-occupancy="${type.maxOccupancy}"
         data-beds="${type.bedCount}"
         data-available="${type.availableCount}"
         data-images="${imagesJson}"
         data-inclusions="${inclusionsJson}"
         aria-labelledby="room-title-${type.roomTypeId}">
      <div class="guest-room-desc-full" hidden>${escapeHtml(desc)}</div>
      <div class="guest-room-feature-media" data-feature-media>
        ${mediaHtml}
        <span class="guest-room-availability${canBook ? '' : ' is-sold-out'}"
              data-i18n-available="${type.availableCount}"
              data-available="${type.availableCount}">
          ${canBook ? `${type.availableCount} available` : 'Fully booked'}
        </span>
        ${pagerHtml}
      </div>
      <div class="guest-room-feature-copy">
        <div class="guest-room-feature-heading">
          <p class="guest-eyebrow" data-i18n="rooms.guestRoom">Guest room</p>
          <h2 id="room-title-${type.roomTypeId}">${safeName}</h2>
        </div>
        ${descHtml}
        <ul class="guest-room-feature-meta">
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>
            <span data-i18n-up-to="${type.maxOccupancy}">Up to ${type.maxOccupancy} guests</span>
          </li>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5v14M3 9h18M21 5v14M7 13h10"/></svg>
            <span data-i18n-beds="${type.bedCount}">${type.bedCount} bed${bedSuffix}</span>
          </li>
        </ul>
        ${tagsHtml}
        <p class="guest-room-feature-price">
          <small data-i18n="rooms.from">From</small>
          <span>₱${type.pricePerNight.toFixed(2)}</span>
          <small data-i18n="rooms.perNight">per night</small>
        </p>
        <div class="guest-room-feature-actions">
          <button type="button"
                  class="guest-btn guest-btn-ghost"
                  data-guest-modal="details"
                  data-fill-room="${safeName}"
                  aria-label="View details for ${safeName}"
                  data-i18n="rooms.details">Details</button>
        </div>
      </div>
    </article>`;
  }

  function syncGuestRoomsIntroMeta(types) {
    const meta = document.querySelector('.guest-rooms-intro-meta[data-i18n-types-meta]');
    if (!meta) return;
    const typeCount = types.length;
    const bookableCount = types.filter((t) => t.availableCount > 0).length;
    meta.setAttribute('data-types', String(typeCount));
    meta.setAttribute('data-available-types', String(bookableCount));
    meta.textContent = `${typeCount} room type${typeCount === 1 ? '' : 's'} · ${bookableCount} available to book`;
  }

  function applyGuestRoomTypes(types) {
    if (!document.getElementById('rooms')) return;
    const track = document.querySelector('[data-room-carousel-track]');
    const existingCards = Array.from(document.querySelectorAll('.guest-room[data-room-type-id]'));
    const byId = new Map(types.map((t) => [t.roomTypeId, t]));
    const existingIds = new Set(
      existingCards.map((c) => Number(c.getAttribute('data-room-type-id')))
    );

    existingCards.forEach((card) => {
      const id = Number(card.getAttribute('data-room-type-id'));
      const type = byId.get(id);
      if (!type) {
        card.remove();
        return;
      }
      applyGuestRoomTypeToCard(card, type);
    });

    const newTypes = types.filter((t) => !existingIds.has(t.roomTypeId));
    if (newTypes.length && track) {
      newTypes.forEach((type) => {
        track.insertAdjacentHTML('beforeend', buildGuestRoomCardHtml(type));
      });
      const freshCards = Array.from(
        track.querySelectorAll('.guest-room-feature[data-reveal]:not(.is-inview)')
      ).slice(-newTypes.length);
      scheduleRevealCascade(freshCards, { startDelay: 60, step: 70, maxDelay: 480 });
      document.querySelectorAll('.guest-room-feature[data-images]').forEach((card) => {
        if (!card.dataset.featurePagerBound) {
          initFeatureMediaPager(card);
          card.dataset.featurePagerBound = '1';
        }
      });
    }

    syncGuestRoomsIntroMeta(types);
    paintRoomCardPrices();
  }

  async function refreshGuestCatalog() {
    if (guestCatalogRefreshing || !document.getElementById('rooms')) return;
    guestCatalogRefreshing = true;
    try {
      const response = await fetch('/api/guest/room-types', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      const raw = await response.json();
      const types = (Array.isArray(raw) ? raw : [])
        .map(normalizeGuestRoomType)
        .filter((t) => t.roomTypeId > 0 && t.name);
      applyGuestRoomTypes(types);
      cachedSpecialOffers = null;
      await loadSpecialOffers(true);
      if (offerSelectModal && !offerSelectModal.hidden) {
        renderOfferPanel();
        syncOfferChangeChrome();
      }
    } finally {
      guestCatalogRefreshing = false;
    }
  }

  function scheduleGuestCatalogRefresh() {
    clearTimeout(guestCatalogRefreshTimer);
    guestCatalogRefreshTimer = setTimeout(() => refreshGuestCatalog(), 300);
  }

  function initGuestCatalogRealtime() {
    if (!document.getElementById('rooms') || typeof signalR === 'undefined') return;
    const connection = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/guest-catalog')
      .withAutomaticReconnect()
      .build();
    connection.on('GuestCatalogChanged', () => scheduleGuestCatalogRefresh());
    connection.start().catch(() => {});
  }

  async function loadSpecialOffers(forceReload = false) {
    if (!forceReload && cachedSpecialOffers) return cachedSpecialOffers;
    try {
      const response = await fetch('/api/special-offers/active', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!response.ok) {
        cachedSpecialOffers = [];
        paintRoomCardPrices();
        syncLoyaltyBanner();
        return cachedSpecialOffers;
      }
      cachedSpecialOffers = await response.json();
      paintRoomCardPrices();
      reapplySpecialOfferPrices();
      syncLoyaltyBanner();
      return cachedSpecialOffers;
    } catch {
      cachedSpecialOffers = [];
      paintRoomCardPrices();
      syncLoyaltyBanner();
      return cachedSpecialOffers;
    }
  }

  function googleLoyaltyOffers() {
    return (cachedSpecialOffers || []).filter(
      (o) => o.kind === 'GoogleLoyalty' && loyaltyCouponAmount(o) > 0
    );
  }

  function loyaltyCouponAmount(offer) {
    if (!offer) return 0;
    if (Number(offer.discountAmount) > 0) return Number(offer.discountAmount);
    const regular = Number(offer.regularPricePerNight || 0);
    const promo = Number(offer.promoPricePerNight || 0);
    return regular > promo ? regular - promo : 0;
  }

  function loyaltyCouponUnits(mode, nights) {
    const n = Math.max(1, Number(nights) || 1);
    if (mode === 'FirstNight') return 1;
    if (mode === 'WeeklyReset') return Math.ceil(n / 7);
    return n;
  }

  function loyaltyApplyLabel(mode) {
    if (mode === 'FirstNight') return tx('booking.loyaltyFirstNight', null, 'first night only');
    if (mode === 'WeeklyReset') return tx('booking.loyaltyWeekly', null, 'once every 7 nights');
    if (mode === 'FirstBooking') return tx('booking.loyaltyFirstBooking', null, 'first booking only');
    return tx('booking.loyaltyEveryNight', null, 'every night');
  }

  function loyaltyCouponForRoomType(roomTypeId, requireSignIn = true) {
    if (requireSignIn && !isGoogleGuestSignedIn()) return null;
    return googleLoyaltyOffers().find((o) => Number(o.roomTypeId) === Number(roomTypeId)) || null;
  }

  function lineLoyaltyDeduct(line, nights, requireSignIn = true) {
    const offer = loyaltyCouponForRoomType(line?.roomTypeId, requireSignIn);
    if (!offer) return 0;
    const unit = loyaltyCouponAmount(offer);
    if (!(unit > 0)) return 0;
    const stayNights = Math.max(1, Number(nights) || 1);
    const units = loyaltyCouponUnits(offer.loyaltyApplyMode, stayNights);
    return unit * units * Number(line.qty || 1);
  }

  function loyaltySaveAmount() {
    const offers = googleLoyaltyOffers();
    if (!offers.length) return 0;
    const nights = Math.max(1, currentStayNights() || 1);

    if (bookingCart.length) {
      return bookingCart.reduce((sum, line) => sum + lineLoyaltyDeduct(line, nights, false), 0);
    }

    let best = 0;
    offers.forEach((o) => {
      const unit = loyaltyCouponAmount(o);
      const save = unit * loyaltyCouponUnits(o.loyaltyApplyMode, nights);
      if (save > best) best = save;
    });
    return best;
  }

  function loyaltyIsApplied() {
    if (!isGoogleGuestSignedIn()) return false;
    if (bookingCart.length) {
      return bookingCart.some((line) => loyaltyCouponForRoomType(line.roomTypeId));
    }
    const cards = document.querySelectorAll('.guest-room[data-room-type-id]');
    if (!cards.length) return googleLoyaltyOffers().length > 0;
    return Array.from(cards).some((card) => {
      const id = Number(card.getAttribute('data-room-type-id') || 0);
      return Boolean(loyaltyCouponForRoomType(id));
    });
  }

  function loyaltyCampaignKey() {
    return googleLoyaltyOffers()
      .map((o) => String(o.id ?? `${o.roomTypeId}:${loyaltyCouponAmount(o)}`))
      .sort()
      .join('|');
  }

  function loyaltyAdDismissed() {
    const key = loyaltyCampaignKey();
    if (!key) return true;
    try {
      return sessionStorage.getItem('mori.loyaltyAdDismissed') === key;
    } catch {
      return false;
    }
  }

  function loyaltyReduceMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function clearLoyaltyAdHide(banner) {
    if (banner._loyaltyHideTimer) {
      window.clearTimeout(banner._loyaltyHideTimer);
      banner._loyaltyHideTimer = 0;
    }
    if (banner._loyaltyHideEnd) {
      banner.removeEventListener('transitionend', banner._loyaltyHideEnd);
      banner._loyaltyHideEnd = null;
    }
  }

  function showLoyaltyAdEl(banner) {
    clearLoyaltyAdHide(banner);
    banner.classList.remove('is-leaving');
    if (!banner.hidden && banner.classList.contains('is-in')) return;
    banner.hidden = false;
    if (loyaltyReduceMotion()) {
      banner.classList.add('is-in');
      return;
    }
    banner.classList.remove('is-in');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (banner.hidden || banner.classList.contains('is-leaving')) return;
        banner.classList.add('is-in');
      });
    });
  }

  function hideLoyaltyAdEl(banner) {
    if (banner.hidden && !banner.classList.contains('is-leaving')) return;
    clearLoyaltyAdHide(banner);
    const finish = () => {
      clearLoyaltyAdHide(banner);
      banner.classList.remove('is-in', 'is-leaving');
      banner.hidden = true;
    };
    if (loyaltyReduceMotion() || !banner.classList.contains('is-in')) {
      finish();
      return;
    }
    banner.classList.add('is-leaving');
    banner.classList.remove('is-in');
    const onEnd = (event) => {
      if (event.target !== banner) return;
      if (event.propertyName !== 'opacity') return;
      finish();
    };
    banner._loyaltyHideEnd = onEnd;
    banner.addEventListener('transitionend', onEnd);
    banner._loyaltyHideTimer = window.setTimeout(finish, 340);
  }

  function dismissLoyaltyAd() {
    const key = loyaltyCampaignKey();
    try {
      sessionStorage.setItem('mori.loyaltyAdDismissed', key || '1');
    } catch {
      /* private mode */
    }
    document.querySelectorAll('[data-loyalty-banner]').forEach((banner) => {
      hideLoyaltyAdEl(banner);
    });
  }

  function syncLoyaltyBanner() {
    const banners = document.querySelectorAll('[data-loyalty-banner]');
    if (!banners.length) return;

    const hasCampaign = googleLoyaltyOffers().length > 0;
    const signedIn = isGoogleGuestSignedIn();
    const show = hasCampaign && !loyaltyAdDismissed() && (signedIn || isGoogleLoginEnabled());
    const applied = loyaltyIsApplied();
    const save = loyaltySaveAmount();
    const saveText = save > 0.004 ? formatMoney(save) : '';

    banners.forEach((banner) => {
      banner.classList.toggle('is-applied', Boolean(signedIn && applied));
      const featured = googleLoyaltyOffers()
        .slice()
        .sort((a, b) => loyaltyCouponAmount(b) - loyaltyCouponAmount(a))[0];
      const unit = featured ? loyaltyCouponAmount(featured) : 0;
      const amountEl = banner.querySelector('[data-loyalty-amount]');
      const whenEl = banner.querySelector('[data-loyalty-when]');
      const claimEl = banner.querySelector('[data-loyalty-claim]');
      const modes = [...new Set(googleLoyaltyOffers().map((o) => o.loyaltyApplyMode))];
      if (amountEl) {
        amountEl.textContent = unit > 0.004 ? `−${formatMoney(unit)}` : '';
      }
      if (whenEl) {
        whenEl.textContent =
          modes.length === 1
            ? loyaltyApplyLabel(modes[0])
            : tx('booking.loyaltyQualifying', null, 'On qualifying stays');
      }
      const title = banner.querySelector('[data-loyalty-title]');
      if (title) {
        if (signedIn && applied) {
          title.textContent = saveText
            ? tx(
                'booking.loyaltyAppliedSave',
                { amount: saveText },
                `You save ${saveText} on this stay`
              )
            : tx('booking.loyaltyApplied', null, 'Loyalty discount applied');
        } else if (signedIn) {
          title.textContent = tx(
            'booking.loyaltyReady',
            null,
            'Applied automatically at checkout'
          );
        } else {
          title.textContent = tx(
            'booking.loyaltyJoin',
            null,
            'A private guest rate — claim to apply'
          );
        }
      }
      if (claimEl) {
        claimEl.textContent =
          signedIn && applied
            ? tx('booking.loyaltyClaimApplied', null, 'Ready on your stay')
            : tx('booking.loyaltyClaimReady', null, 'Applied at checkout');
      }
      if (show) showLoyaltyAdEl(banner);
      else hideLoyaltyAdEl(banner);
    });
  }

  const BOOK_DRAFT_KEY = 'mori.guestBookDraft';

  function persistBookDraft() {
    try {
      sessionStorage.setItem(
        BOOK_DRAFT_KEY,
        JSON.stringify({
          v: 1,
          guestRooms,
          bookingCart,
          checkIn: document.getElementById('modalCheckIn')?.value || '',
          checkOut: document.getElementById('modalCheckOut')?.value || '',
          checkInTime: document.getElementById('modalCheckInTime')?.value || '',
          checkOutTime: document.getElementById('modalCheckOutTime')?.value || '',
          guestName: document.getElementById('guestName')?.value || '',
          guestEmail: document.getElementById('guestEmail')?.value || '',
          guestPhone: document.getElementById('guestPhone')?.value || '',
        })
      );
    } catch {
      /* quota / private mode */
    }
  }

  function restoreBookDraft() {
    let raw = '';
    try {
      raw = sessionStorage.getItem(BOOK_DRAFT_KEY) || '';
    } catch {
      return;
    }
    if (!raw) return;
    try {
      sessionStorage.removeItem(BOOK_DRAFT_KEY);
    } catch {
      /* ignore */
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (!data || data.v !== 1) return;

    if (Array.isArray(data.guestRooms) && data.guestRooms.length) {
      guestRooms = data.guestRooms;
    }
    if (Array.isArray(data.bookingCart)) {
      bookingCart = data.bookingCart;
    }

    const nameEl = document.getElementById('guestName');
    const emailEl = document.getElementById('guestEmail');
    const phoneEl = document.getElementById('guestPhone');
    if (nameEl && data.guestName) nameEl.value = data.guestName;
    if (emailEl && data.guestEmail) emailEl.value = data.guestEmail;
    if (phoneEl && data.guestPhone) phoneEl.value = data.guestPhone;

    if (modalCheckIn && data.checkIn) modalCheckIn.value = data.checkIn;
    if (modalCheckOut && data.checkOut) modalCheckOut.value = data.checkOut;
    const inTime = document.getElementById('modalCheckInTime');
    const outTime = document.getElementById('modalCheckOutTime');
    if (inTime && data.checkInTime) inTime.value = data.checkInTime;
    if (outTime && data.checkOutTime) outTime.value = data.checkOutTime;

    try {
      renderGuestsRooms();
      syncGuestFlowSummary();
      if (modalCheckIn && modalCheckOut) {
        applyDateLimits(modalCheckIn, modalCheckOut);
      }
      renderCart();
    } catch {
      /* wizard not ready */
    }
  }

  function offerKindLabel(kind) {
    const map = {
      LimitedTime: tx('booking.offerKindLimited', null, 'Limited time offer'),
      StayLongerSaveMore: tx('booking.offerKindStayLonger', null, 'Stay longer, save more'),
      GoogleLoyalty: tx('booking.offerKindLoyalty', null, 'Loyalty Coupon'),
    };
    return map[kind] || kind;
  }

  function renderSpecialOfferRows(item) {
    const offers = stayLongerOffersForRoomType(item.roomTypeId);
    if (!offers.length) {
      return `<p class="guest-offer-special-empty">${tx(
        'booking.noStayLongerOffers',
        null,
        'No stay-longer offers right now.'
      )}</p>`;
    }

    const showAll = offerMoreOffersOpen.has(item.roomType);
    const visible = showAll ? offers : offers.slice(0, OFFER_SPECIAL_PREVIEW_COUNT);
    const hiddenCount = Math.max(0, offers.length - visible.length);

    const rows = visible
      .map((offer) => {
        const promoAmt = Number(offer.promoPricePerNight);
        const regularAmt = Number(offer.regularPricePerNight);
        const pct = discountPercent(regularAmt, promoAmt);
        const minNights = Number(offer.minNights || 0);
        const includeKey = `offer:${offer.id}`;
        const preview = [
          offer.description
            ? `<li>${escapeHtml(String(offer.description).slice(0, 72))}${String(offer.description).length > 72 ? '…' : ''}</li>`
            : `<li>${tx('booking.offerKindStayLonger', null, 'Stay longer, save more')}</li>`,
          `<li>${tx('booking.offerMinNightsOnly', { n: minNights }, `${minNights}+ nights`)}</li>`,
          offer.cashOnly ? `<li>${tx('booking.cashOnly', null, 'Cash only')}</li>` : '',
        ]
          .filter(Boolean)
          .slice(0, 3)
          .join('');
        const extra = [
          offer.description ? `<span>${escapeHtml(offer.description)}</span>` : '',
          `<span>${tx(
            'booking.offerNeedNights',
            { n: minNights },
            `Requires ${minNights}+ nights — dates are locked to this minimum`
          )}</span>`,
          offer.cashOnly ? `<span>${tx('booking.cashOnly', null, 'Cash only')}</span>` : '',
        ]
          .filter(Boolean)
          .join('');
        return `
          <div class="guest-offer-rate is-special">
            <div class="guest-offer-rate-copy">
              <strong class="guest-offer-rate-name">${tx('booking.offerKindStayLonger', null, 'Stay longer, save more')}</strong>
              <ul class="guest-offer-rate-includes">${preview}</ul>
              ${offerIncludesToggleHtml(includeKey, extra)}
            </div>
            <div class="guest-offer-rate-price">
              <span class="guest-offer-price-label">${tx('booking.priceFor1Night', null, 'Price for 1 night')}</span>
              ${offerRatePriceHtml({
                effective: promoAmt,
                regular: regularAmt,
                showCompare: regularAmt > promoAmt,
                pct,
              })}
              <span class="guest-offer-price-note">${tx('booking.cashOnly', null, 'Cash only')} · ${tx('booking.perNightShort', null, '/ night')}</span>
              <button type="button"
                      class="guest-btn guest-btn-primary guest-offer-select guest-offer-select-offer"
                      data-stay-longer-book="${Number(offer.id)}"
                      data-stay-longer-room="${escapeHtml(item.roomType)}"
                      data-stay-longer-min="${minNights}">
                ${tx('booking.bookStayLonger', null, 'Book this offer')}
              </button>
            </div>
          </div>`;
      })
      .join('');

    const moreBtn =
      offers.length > OFFER_SPECIAL_PREVIEW_COUNT
        ? `<button type="button" class="guest-offer-more" data-offer-more="${escapeHtml(item.roomType)}" aria-expanded="${showAll ? 'true' : 'false'}">
             ${
               showAll
                 ? tx('booking.showFewerOffers', null, 'Show fewer offers')
                 : tx('booking.showMoreOffers', { n: hiddenCount }, `Show ${hiddenCount} more offers`)
             }
           </button>`
        : '';

    return `${rows}${moreBtn}`;
  }

  // Keep original function name flow: openOfferStep will await offers first

  function seedPreferredRoomIntoOfferCart() {
    const roomType = pendingSeedRoomType;
    pendingSeedRoomType = '';
    if (!roomType) return false;
    if (bookingCart.length > 0) return false;
    if (remainingIntendedRoomSlots() < 1) return false;
    const result = addToCart(roomType, 1);
    if (!result.ok) return false;
    preferredRoomType = roomType;
    fillBookRoom(roomType);
    return true;
  }

  function syncDatesBeforeOfferChrome() {
    const stepList = document.getElementById('bookStepList');
    const bookTitle = document.getElementById('bookTitle');
    const eyebrow = document.querySelector('#bookModal .guest-book-modal-head .guest-eyebrow');
    const backBtn = document.getElementById('bookWizardBackBtn');
    const nextBtn = document.getElementById('bookWizardNextBtn');

    if (datesBeforeOfferFlow) {
      stepList?.setAttribute('hidden', '');
      if (bookTitle) {
        bookTitle.textContent = tx('booking.stayDates', null, 'Stay dates');
      }
      if (eyebrow) {
        eyebrow.textContent = tx('booking.stepDates', null, 'Dates');
      }
      if (backBtn) {
        backBtn.textContent = tx('booking.backToGuests', null, 'Back to guests');
      }
      if (nextBtn) {
        nextBtn.textContent = tx('booking.continueToRooms', null, 'Continue to rooms');
      }
    } else {
      stepList?.removeAttribute('hidden');
      if (bookTitle) {
        bookTitle.textContent = tx('booking.completeBooking', null, 'Complete your booking');
      }
      if (eyebrow) {
        eyebrow.textContent = tx('booking.booking', null, 'Booking');
      }
    }
  }

  async function openDatesBeforeOfferStep() {
    const error = validateGuestRooms();
    if (error) {
      showGuestsHint(error);
      showToast(error, false);
      return;
    }
    if (guestRoomsOverCapacity()) {
      const message = tx(
        'booking.capacityHint',
        null,
        `Guests exceed room capacity (max ${MAX_GUESTS_PER_ROOM} per room). Add another room or reduce guests to continue.`
      );
      showGuestsHint(message);
      showToast(message, false);
      syncGuestsContinueState();
      return;
    }
    showGuestsHint('');
    datesBeforeOfferFlow = true;
    offerSelectMode = 'initial';
    clearPendingChangeRoom();
    ensureStayDatesForOffer();
    applyDateLimits(modalCheckIn, modalCheckOut);
    updateLeadHint(modalCheckIn, modalLeadHint, bookModalForm);
    syncDatesBeforeOfferChrome();
    setBookWizardStep('dates');
    openModal(bookModal);
  }

  async function openOfferStep() {
    const error = validateGuestRooms();
    if (error) {
      showGuestsHint(error);
      showToast(error, false);
      return;
    }
    if (guestRoomsOverCapacity()) {
      const message = tx(
        'booking.capacityHint',
        null,
        `Guests exceed room capacity (max ${MAX_GUESTS_PER_ROOM} per room). Add another room or reduce guests to continue.`
      );
      showGuestsHint(message);
      showToast(message, false);
      syncGuestsContinueState();
      return;
    }
    showGuestsHint('');
    offerSelectMode = 'initial';
    clearPendingChangeRoom();
    syncOfferChangeChrome();
    syncGuestFlowSummary();
    await loadSpecialOffers();
    ensureStayDatesForOffer();
    if (modalCheckIn?.value && modalCheckOut?.value) {
      await refreshLiveAvailability(modalCheckIn.value, modalCheckOut.value);
    }
    const seeded = seedPreferredRoomIntoOfferCart();
    renderOfferPanel();
    openModal(offerSelectModal);
    if (seeded) {
      const line = bookingCart.find((l) => cartLineKey(l.roomType) === cartLineKey(preferredRoomType));
      const qty = line?.qty || 1;
      showToast(
        `Added ${qty} × ${preferredRoomType} · ${cartRoomCount()} of ${intendedRoomCount()} room${intendedRoomCount() === 1 ? '' : 's'}.`,
        true
      );
    }
  }

  function syncOfferChangeChrome() {
    const backBtn = document.getElementById('offerBackToGuestsBtn');
    const backLabel = document.getElementById('offerBackLabel');
    const title = document.getElementById('offerSelectTitle');
    const eyebrow = document.querySelector('#offerSelectModal .guest-offers-head-titles .guest-eyebrow');
    const continueBtn = document.getElementById('offerContinueBtn');
    const isChange = offerSelectMode === 'change';

    if (backLabel) backLabel.textContent = isChange ? tx('booking.booking', null, 'Booking') : tx('booking.guestsTitle', null, 'Guests');
    if (backBtn) {
      backBtn.setAttribute('aria-label', isChange ? tx('booking.backToBooking', null, 'Back to booking') : tx('booking.backToGuests', null, 'Back to guests'));
    }
    if (title) title.textContent = isChange ? tx('booking.changeRoomsTitle', null, 'Change rooms') : tx('booking.addRoomsOffer', null, 'Add rooms & offer');
    if (eyebrow) eyebrow.textContent = isChange ? tx('booking.editRoomsEyebrow', null, 'Edit rooms') : tx('booking.step2', null, 'Step 2');
    if (continueBtn) {
      continueBtn.textContent = isChange ? tx('booking.done', null, 'Done') : tx('booking.continue', null, 'Continue');
    }
  }

  async function openOfferChangeMode(preferredType = '') {
    if (preferredType) preferredRoomType = preferredType;
    pendingChangeRoomType = preferredType || '';
    pendingChangeQty = preferredType ? 1 : 0;
    offerSelectMode = 'change';
    syncOfferChangeChrome();
    syncGuestFlowSummary();
    if (modalCheckIn?.value && modalCheckOut?.value) {
      await refreshLiveAvailability(modalCheckIn.value, modalCheckOut.value);
    }
    renderOfferPanel();
    openModal(offerSelectModal);
    showToast(
      pendingChangeRoomType
        ? tx('booking.replacingRoom', { n: `1 × ${pendingChangeRoomType}` }, `Replacing 1 × ${pendingChangeRoomType}. Your other rooms of this type stay as-is.`)
        : tx('booking.pickRoomThenDone', null, 'Pick a room type, then tap Done.'),
      true
    );
  }

  function returnToBookRooms() {
    clearPendingChangeRoom();
    preferredRoomType = bookingCart[0]?.roomType || preferredRoomType;
    fillBookRoom(preferredRoomType);
    updateBookPartySummary();
    reapplySpecialOfferPrices();
    refreshStayTimeOptions(true);
    updatePaymentPreview();
    renderCart();
    setBookWizardStep('rooms');
    openModal(bookModal);
    offerSelectMode = 'initial';
    syncOfferChangeChrome();
    if (bookingCart.length) {
      showToast(tx('booking.toastRoomsUpdated', null, 'Rooms updated.'), true);
    } else {
      showToast(tx('booking.toastNoRoomsSelected', null, 'No rooms selected. Add a room to continue.'), false);
    }
  }

  function updateBookPartySummary() {
    const el = document.getElementById('bookPartySummary');
    if (!el) return;
    const text = partySummaryText();
    el.hidden = !text;
    el.textContent = text;
  }

  function addOfferRoomToCart(roomType) {
    const meta = getRoomMeta(roomType);
    if (!meta?.roomType) {
      showToast(tx('booking.toastPleaseChooseRoom', null, 'Please choose a room.'), false);
      return;
    }
    if (meta.available < 1) {
      showToast(`${meta.roomType} is not available right now.`, false);
      return;
    }

    if (offerSelectMode === 'change' && pendingChangeRoomType) {
      if (isPendingChangeRoom(meta.roomType)) {
        clearPendingChangeRoom();
        renderOfferCart();
        showToast(`Keeping ${meta.roomType}.`, true);
        return;
      }
      // Remove only the pending unit(s), keep the rest of that room type.
      const replacing = pendingChangeRoomType;
      const replaceQty = pendingChangeLineQty() || 1;
      clearPendingChangeRoom();
      reduceCartLineQty(replacing, replaceQty);
    }

    const slotsLeft = remainingIntendedRoomSlots();
    if (slotsLeft < 1) {
      const intended = intendedRoomCount();
      showToast(
        `You chose ${intended} room${intended === 1 ? '' : 's'} in Guests. That is the maximum for this stay.`,
        false
      );
      syncOfferContinueState();
      renderOfferCart();
      return;
    }

    const remaining = remainingCapacity(meta.roomType, meta.available);
    if (remaining < 1) {
      showToast(`You've reached the booking limit for ${meta.roomType}.`, false);
      renderOfferCart();
      return;
    }

    const qty = Math.min(1, remaining, slotsLeft);
    const result = addToCart(roomType, qty);
    if (!result.ok) {
      showToast(result.message, false);
      renderOfferCart();
      return;
    }

    preferredRoomType = roomType;
    fillBookRoom(roomType);
    showToast(
      `Added ${qty} × ${meta.roomType} · ${cartRoomCount()} of ${intendedRoomCount()} room${intendedRoomCount() === 1 ? '' : 's'}.`,
      true
    );
  }

  function addStayLongerOfferToCart(roomType, offerId) {
    const meta = getRoomMeta(roomType);
    const offer =
      (cachedSpecialOffers || []).find(
        (o) =>
          Number(o.id) === Number(offerId)
          && o.kind === 'StayLongerSaveMore'
          && Number(o.roomTypeId) === Number(meta?.roomTypeId || 0)
      ) || null;
    if (!meta?.roomType || !offer) {
      showToast(tx('booking.toastPleaseChooseRoom', null, 'Please choose a room.'), false);
      return;
    }
    const minNights = Number(offer.minNights || 0);
    const promo = Number(offer.promoPricePerNight || 0);
    if (!(minNights >= 2) || !(promo > 0)) {
      showToast(tx('booking.toastOfferUnavailable', null, 'That offer is no longer available.'), false);
      return;
    }

    if (offerSelectMode === 'change' && pendingChangeRoomType) {
      if (isPendingChangeRoom(meta.roomType)) {
        clearPendingChangeRoom();
        renderOfferCart();
        showToast(`Keeping ${meta.roomType}.`, true);
        return;
      }
      const replacing = pendingChangeRoomType;
      const replaceQty = pendingChangeLineQty() || 1;
      clearPendingChangeRoom();
      reduceCartLineQty(replacing, replaceQty);
    }

    const slotsLeft = remainingIntendedRoomSlots();
    if (slotsLeft < 1) {
      const intended = intendedRoomCount();
      showToast(
        `You chose ${intended} room${intended === 1 ? '' : 's'} in Guests. That is the maximum for this stay.`,
        false
      );
      syncOfferContinueState();
      renderOfferCart();
      return;
    }

    const remaining = remainingCapacity(meta.roomType, meta.available);
    if (remaining < 1) {
      showToast(`You've reached the booking limit for ${meta.roomType}.`, false);
      renderOfferCart();
      return;
    }

    const existing = findCartLine(meta.roomType, 'stayLonger');
    const addQty = Math.min(1, remaining, slotsLeft);
    if (existing) {
      existing.qty = Math.min(
        meta.available - (qtyForRoomType(meta.roomType) - existing.qty),
        existing.qty + addQty
      );
      existing.forcedStayLongerOfferId = Number(offer.id);
      existing.stayLongerMinNights = minNights;
      existing.specialOfferId = Number(offer.id);
      existing.price = promo;
      existing.regularPrice = regularComparePrice(meta.roomTypeId, meta.price, offer);
      existing.available = meta.available;
    } else {
      bookingCart.push({
        roomTypeId: meta.roomTypeId,
        roomType: meta.roomType,
        qty: addQty,
        price: promo,
        regularPrice: regularComparePrice(meta.roomTypeId, meta.price, offer),
        available: meta.available,
        specialOfferId: Number(offer.id),
        forcedStayLongerOfferId: Number(offer.id),
        stayLongerMinNights: minNights,
      });
    }

    syncSelectedOfferFromCart();
    applyDateLimits(modalCheckIn, modalCheckOut);
    preferredRoomType = roomType;
    fillBookRoom(roomType);
    renderCart();
    showToast(
      tx(
        'booking.toastStayLongerAdded',
        { room: meta.roomType, n: minNights },
        `Added ${meta.roomType} with stay-longer rate · check-out needs ${minNights}+ nights.`
      ),
      true
    );
  }

  function continueFromOfferToBooking() {
    if (!bookingCart.length) {
      showToast(tx('booking.toastAddRoom', null, 'Add at least one room to continue.'), false);
      syncOfferContinueState();
      return;
    }
    if (cartRoomCount() > intendedRoomCount()) {
      const intended = intendedRoomCount();
      showToast(
        `You chose ${intended} room${intended === 1 ? '' : 's'} in Guests. Remove extras before continuing.`,
        false
      );
      syncOfferContinueState();
      return;
    }
    if (isGuestCapacityExceeded()) {
      const guestCount = guestPartyCount();
      const hold = cartGuestHoldCapacity();
      const message = `Guests (${guestCount}) exceed selected room capacity (${hold}). Add more rooms or go back to adjust guests.`;
      showToast(message, false);
      syncOfferContinueState();
      return;
    }
    if (hasSoldOutConflict()) {
      const message = buildSoldOutMessages(lastAvailabilitySnapshot).join(' ');
      showToast(message, false);
      syncOfferContinueState();
      return;
    }

    if (offerSelectMode === 'change') {
      returnToBookRooms();
      return;
    }

    preferredRoomType = bookingCart[0]?.roomType || preferredRoomType;
    fillBookRoom(preferredRoomType);
    applyDateLimits(modalCheckIn, modalCheckOut);
    updateBookPartySummary();
    reapplySpecialOfferPrices();
    setPaymentOption('Full');
    syncGuestPayMethodUi();
    refreshStayTimeOptions(true);
    updateLeadHint(modalCheckIn, modalLeadHint, bookModalForm);
    syncModalQtyMax();
    updatePaymentPreview();
    renderCart();
    if (modalCheckIn?.value && modalCheckOut?.value) {
      void refreshLiveAvailability(modalCheckIn.value, modalCheckOut.value);
    }
    setBookWizardStep('guest');
    openModal(bookModal);
    showToast(`${cartRoomCount()} room${cartRoomCount() === 1 ? '' : 's'} ready — enter guest details.`, true);
  }

  function setBookWizardStep(step) {
    if (!BOOK_WIZARD_STEPS.includes(step)) step = 'guest';
    bookWizardStep = step;
    const form = document.getElementById('bookModalForm');
    form?.setAttribute('data-book-step', step);

    form?.querySelectorAll('[data-book-step-panel]').forEach((panel) => {
      const match = panel.getAttribute('data-book-step-panel') === step;
      panel.hidden = !match;
    });

    const stepIndex = BOOK_WIZARD_STEPS.indexOf(step);
    document.querySelectorAll('#bookStepList [data-book-step-tab]').forEach((tab) => {
      const tabStep = tab.getAttribute('data-book-step-tab');
      const tabIndex = BOOK_WIZARD_STEPS.indexOf(tabStep);
      tab.classList.toggle('is-current', tabStep === step);
      tab.classList.toggle('is-done', tabIndex > -1 && tabIndex < stepIndex);
      if (tabStep === step) tab.setAttribute('aria-current', 'step');
      else tab.removeAttribute('aria-current');
    });

    const backBtn = document.getElementById('bookWizardBackBtn');
    const nextBtn = document.getElementById('bookWizardNextBtn');
    const submitBtn = document.getElementById('bookModalSubmit');
    const isLast = step === 'confirm';

    if (backBtn) {
      backBtn.hidden = false;
      backBtn.textContent = step === 'guest' ? tx('booking.backToRooms', null, 'Back to rooms') : tx('booking.back', null, 'Back');
    }
    if (nextBtn) nextBtn.hidden = isLast;
    if (submitBtn) submitBtn.hidden = !isLast;

    if (step === 'dates') {
      ensureStayDatesForOffer();
      reapplySpecialOfferPrices();
      renderCart();
      if (cartRequiredMinNights() > 1) {
        const dateMsg = document.getElementById('stayDatesRequiredMsg');
        // Keep banner as status; clear prior error until they try an invalid range.
        if (dateMsg && !document.getElementById('bookDatesSection')?.classList.contains('is-invalid-required')) {
          dateMsg.hidden = true;
          dateMsg.textContent = '';
        }
      }
    } else {
      const banner = document.getElementById('stayLongerMinBanner');
      if (banner && step !== 'dates') {
        // Keep banner only on dates step.
        banner.hidden = true;
      }
    }

    const lede = document.getElementById('bookModalLede');
    if (lede) {
      const copy = {
        guest: tx('booking.ledeGuest', null, 'Enter guest contact details to continue.'),
        dates: tx('booking.ledeDates', null, 'Choose check-in and check-out for every room in this stay.'),
        rooms: tx('booking.ledeRooms', null, 'Review your rooms. You can still adjust quantities.'),
        confirm: tx('booking.ledeConfirm', null, 'Choose payment and accept the Terms of Stay to submit.'),
      };
      lede.textContent = copy[step] || copy.guest;
    }

    clearBookRequiredErrors();
    setMessage(document.getElementById('bookFormMessage'), '', false);
    syncCartSubmitState();
    syncDatesBeforeOfferChrome();

    const panel = form?.querySelector(`[data-book-step-panel="${step}"]`);
    const focusEl = panel?.querySelector('input, select, button, textarea');
    focusEl?.focus?.();
  }

  function validateGuestWizardStep() {
    clearBookRequiredErrors();
    const nameEl = document.getElementById('guestName');
    const emailEl = document.getElementById('guestEmail');
    const phoneEl = document.getElementById('guestPhone');
    const guestSection = document.getElementById('bookGuestSection');
    const guestMsg = document.getElementById('guestDetailsRequiredMsg');

    const name = nameEl?.value.trim() || '';
    const email = emailEl?.value.trim() || '';
    const phone = phoneEl?.value.trim() || '';
    const missing = [];
    let focusEl = null;

    if (!name) {
      missing.push(tx('booking.fullName', null, 'Full name'));
      markFieldInvalid(nameEl);
      focusEl = focusEl || nameEl;
    }
    if (!email) {
      missing.push(tx('booking.email', null, 'Email'));
      markFieldInvalid(emailEl);
      focusEl = focusEl || emailEl;
    }
    if (!phone) {
      missing.push(tx('booking.phone', null, 'Phone'));
      markFieldInvalid(phoneEl);
      focusEl = focusEl || phoneEl;
    }

    if (missing.length) {
      guestSection?.classList.add('is-invalid-required');
      if (guestMsg) {
        guestMsg.hidden = false;
        guestMsg.textContent = formatRequiredList(missing);
      }
      focusEl?.focus();
      return { ok: false, message: formatRequiredList(missing) };
    }

    if (email && !email.includes('@')) {
      guestSection?.classList.add('is-invalid-required');
      markFieldInvalid(emailEl);
      if (guestMsg) {
        guestMsg.hidden = false;
        guestMsg.textContent = tx('booking.validateEmail', null, 'Enter a valid email address.');
      }
      emailEl?.focus();
      return { ok: false, message: tx('booking.validateEmail', null, 'Enter a valid email address.') };
    }

    if (phone && !isValidPhone(phone)) {
      guestSection?.classList.add('is-invalid-required');
      markFieldInvalid(phoneEl);
      if (guestMsg) {
        guestMsg.hidden = false;
        guestMsg.textContent = tx('booking.validatePhone', null, 'Enter a valid phone number.');
      }
      phoneEl?.focus();
      return { ok: false, message: tx('booking.validatePhone', null, 'Enter a valid phone number.') };
    }

    return { ok: true, message: '' };
  }

  function validateDatesWizardStep() {
    clearBookRequiredErrors();
    const checkInEl = document.getElementById('modalCheckIn');
    const checkOutEl = document.getElementById('modalCheckOut');
    const datesSection = document.getElementById('bookDatesSection');
    const dateMsg = document.getElementById('stayDatesRequiredMsg');
    const checkIn = checkInEl?.value || '';
    const checkOut = checkOutEl?.value || '';
    const missing = [];
    let focusEl = null;

    if (!checkIn) {
      missing.push('check-in date');
      markFieldInvalid(checkInEl);
      focusEl = focusEl || checkInEl;
    }
    if (!checkOut) {
      missing.push('check-out date');
      markFieldInvalid(checkOutEl);
      focusEl = focusEl || checkOutEl;
    }

    if (missing.length) {
      datesSection?.classList.add('is-invalid-required');
      if (dateMsg) {
        dateMsg.hidden = false;
        dateMsg.textContent = formatRequiredList(missing);
      }
      focusEl?.focus();
      return { ok: false, message: formatRequiredList(missing) };
    }

    const dateError = validateDates(checkIn, checkOut);
    if (dateError) {
      datesSection?.classList.add('is-invalid-required');
      if (dateMsg) {
        dateMsg.hidden = false;
        dateMsg.textContent = dateError;
      }
      checkOutEl?.focus();
      return { ok: false, message: dateError };
    }

    if (bookingCart.length && hasSoldOutConflict()) {
      const soldOutMsg = buildSoldOutMessages(lastAvailabilitySnapshot).join(' ');
      updateSoldOutDatesUi();
      checkOutEl?.focus();
      return { ok: false, message: soldOutMsg };
    }

    return { ok: true, message: '' };
  }

  function validateRoomsWizardStep() {
    updateBookRoomsCapacityWarning();
    if (!bookingCart.length) {
      return { ok: false, message: tx('booking.validateAddRoom', null, 'Add at least one room to your booking.') };
    }
    if (cartRoomCount() > intendedRoomCount()) {
      const intended = intendedRoomCount();
      return {
        ok: false,
        message: `You chose ${intended} room${intended === 1 ? '' : 's'} in Guests. Remove extras to continue.`,
      };
    }
    if (isGuestCapacityExceeded()) {
      const guestCount = guestPartyCount();
      const hold = cartGuestHoldCapacity();
      return {
        ok: false,
        message: `Guests (${guestCount}) exceed this room’s capacity (${hold}). Add more rooms or reduce guests to continue.`,
      };
    }
    if (hasSoldOutConflict()) {
      return {
        ok: false,
        message: buildSoldOutMessages(lastAvailabilitySnapshot).join(' '),
      };
    }
    return { ok: true, message: '' };
  }

  function advanceBookWizard() {
    const bookMsg = document.getElementById('bookFormMessage');
    let result = { ok: true, message: '' };

    if (bookWizardStep === 'guest') result = validateGuestWizardStep();
    else if (bookWizardStep === 'dates') result = validateDatesWizardStep();
    else if (bookWizardStep === 'rooms') result = validateRoomsWizardStep();

    if (!result.ok) {
      setMessage(bookMsg, result.message, false);
      return;
    }

    if (datesBeforeOfferFlow && bookWizardStep === 'dates') {
      datesBeforeOfferFlow = false;
      syncDatesBeforeOfferChrome();
      closeAllModals(false);
      void openOfferStep();
      return;
    }

    const index = BOOK_WIZARD_STEPS.indexOf(bookWizardStep);
    const next = BOOK_WIZARD_STEPS[Math.min(BOOK_WIZARD_STEPS.length - 1, index + 1)];
    setBookWizardStep(next);
  }

  function retreatBookWizard() {
    if (datesBeforeOfferFlow && bookWizardStep === 'dates') {
      datesBeforeOfferFlow = false;
      syncDatesBeforeOfferChrome();
      openGuestsStep(preferredRoomType);
      return;
    }
    if (bookWizardStep === 'guest') {
      renderOfferPanel();
      openModal(offerSelectModal);
      return;
    }
    const index = BOOK_WIZARD_STEPS.indexOf(bookWizardStep);
    const prev = BOOK_WIZARD_STEPS[Math.max(0, index - 1)];
    setBookWizardStep(prev);
  }

  function openRoomDetailsFromOffers(roomType) {
    if (!roomType) return;
    detailsReturnTarget = 'offers';
    fillDetails(roomType);
    openModal(detailsModal);
    syncDetailsReturnUi();
    const dialog = detailsModal?.querySelector('.guest-modal-dialog');
    if (dialog) dialog.scrollTop = 0;
  }

  function syncDetailsReturnUi() {
    const closeBtns = detailsModal?.querySelectorAll('[data-close-modal].guest-btn-ghost, .guest-modal-actions [data-close-modal]');
    closeBtns?.forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      if (btn.classList.contains('guest-modal-close')) return;
      if (detailsReturnTarget === 'offers') {
        btn.textContent = tx('booking.backToOffers', null, 'Back to offers');
        btn.setAttribute('data-details-return', 'offers');
      } else {
        btn.textContent = tx('details.close', null, 'Close');
        btn.removeAttribute('data-details-return');
      }
    });
  }

  function closeDetailsOrModal() {
    const returnTo = detailsReturnTarget;
    detailsReturnTarget = null;
    syncDetailsReturnUi();
    if (returnTo === 'offers') {
      openModal(offerSelectModal);
      return;
    }
    closeAllModals();
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-modal]')) {
      if (detailsModal && !detailsModal.hidden && detailsReturnTarget === 'offers') {
        closeDetailsOrModal();
        return;
      }
      detailsReturnTarget = null;
      closeAllModals();
      return;
    }

    const offerJump = event.target.closest('[data-offer-jump-id]');
    if (offerJump) {
      const roomTypeId = offerJump.getAttribute('data-offer-jump-id') || '';
      if (roomTypeId) scrollOfferRoomIntoView(roomTypeId);
      return;
    }

    const offerMore = event.target.closest('[data-offer-more]');
    if (offerMore) {
      const roomType = offerMore.getAttribute('data-offer-more') || '';
      if (offerMoreOffersOpen.has(roomType)) offerMoreOffersOpen.delete(roomType);
      else offerMoreOffersOpen.add(roomType);
      renderOfferPanel();
      return;
    }

    const offerIncludes = event.target.closest('[data-offer-includes]');
    if (offerIncludes) {
      const key = offerIncludes.getAttribute('data-offer-includes') || '';
      if (!key) return;
      if (offerIncludesOpen.has(key)) offerIncludesOpen.delete(key);
      else offerIncludesOpen.add(key);
      const open = offerIncludesOpen.has(key);
      offerIncludes.setAttribute('aria-expanded', open ? 'true' : 'false');
      offerIncludes.textContent = open
        ? tx('booking.hideIncluded', null, 'Hide details')
        : tx('booking.whatsIncluded', null, 'What’s included');
      const panel = document.querySelector(`[data-offer-includes-panel="${CSS.escape(key)}"]`);
      if (panel) panel.hidden = !open;
      return;
    }

    const offerDetails = event.target.closest('[data-offer-details]');
    if (offerDetails) {
      const roomType = offerDetails.getAttribute('data-offer-details') || '';
      openRoomDetailsFromOffers(roomType);
      return;
    }

    // Photo paging is independent from room actions.
    if (event.target.closest('[data-feature-pager]')) return;

    const guestStep = event.target.closest('[data-guest-step]');
    if (guestStep) {
      const roomIndex = Number(guestStep.getAttribute('data-guest-room-index') || -1);
      const field = guestStep.getAttribute('data-guest-step') || '';
      const delta = Number(guestStep.getAttribute('data-guest-delta') || 0);
      adjustGuestCount(roomIndex, field, delta);
      return;
    }

    const removeRoom = event.target.closest('[data-guest-remove-room]');
    if (removeRoom) {
      removeGuestRoom(Number(removeRoom.getAttribute('data-guest-remove-room') || -1));
      return;
    }

    const inlineAddRoom = event.target.closest('[data-guest-add-room-inline]');
    if (inlineAddRoom) {
      addGuestRoom();
      return;
    }

    const offerSelect = event.target.closest('[data-offer-select]');
    if (offerSelect) {
      // Limited Time is auto-applied as the room rate — no separate select path.
      return;
    }

    const offerAdd = event.target.closest('[data-offer-add]');
    if (offerAdd) {
      const roomType = offerAdd.getAttribute('data-offer-add') || '';
      addOfferRoomToCart(roomType);
      return;
    }

    const stayLongerBook = event.target.closest('[data-stay-longer-book]');
    if (stayLongerBook) {
      const offerId = Number(stayLongerBook.getAttribute('data-stay-longer-book') || 0);
      const roomType = stayLongerBook.getAttribute('data-stay-longer-room') || '';
      addStayLongerOfferToCart(roomType, offerId);
      return;
    }

    const offerCartDelta = event.target.closest('[data-offer-cart-delta]');
    if (offerCartDelta) {
      const roomType = offerCartDelta.getAttribute('data-offer-cart-room') || '';
      const rateKind = offerCartDelta.getAttribute('data-offer-cart-rate') || 'standard';
      const delta = Number(offerCartDelta.getAttribute('data-offer-cart-delta') || 0);
      const line = findCartLine(roomType, rateKind);
      if (line) setCartLineQty(roomType, line.qty + delta, rateKind);
      return;
    }

    const offerCartRemove = event.target.closest('[data-offer-cart-remove]');
    if (offerCartRemove) {
      const removedType = offerCartRemove.getAttribute('data-offer-cart-remove') || '';
      const rateKind = offerCartRemove.getAttribute('data-offer-cart-rate') || null;
      const cancelChange = offerCartRemove.getAttribute('data-offer-cart-cancel-change') === '1';
      if (cancelChange && isPendingChangeRoom(removedType)) {
        clearPendingChangeRoom();
        renderOfferCart();
        showToast(tx('booking.toastChangeCancelled', null, 'Change cancelled.'), true);
        return;
      }
      if (isPendingChangeRoom(removedType)) clearPendingChangeRoom();
      removeFromCart(removedType, rateKind);
      return;
    }

    const trigger = event.target.closest('[data-guest-modal]');
    if (!trigger) return;

    const kind = trigger.getAttribute('data-guest-modal');
    const roomName = trigger.getAttribute('data-fill-room') || '';

    if (kind === 'details') {
      const currentRoom = detailsModal?.dataset.currentRoom || '';
      const isOpen = detailsModal && !detailsModal.hidden;

      // Clicking Details again on the same room closes it.
      if (isOpen && currentRoom === roomName) {
        closeAllModals();
        return;
      }

      // Clicking Details on another room replaces the open details.
      detailsReturnTarget = null;
      fillDetails(roomName);
      openModal(detailsModal);
      syncDetailsReturnUi();
      const dialog = detailsModal.querySelector('.guest-modal-dialog');
      if (dialog) dialog.scrollTop = 0;
      return;
    }

    if (kind === 'guests' || kind === 'book') {
      const fromDetails = Boolean(detailsModal && !detailsModal.hidden);
      const resolvedRoom =
        roomName ||
        (fromDetails ? detailsModal?.dataset.currentRoom || '' : '') ||
        preferredRoomType;
      openGuestsStep(resolvedRoom);
    }
  });

  document.getElementById('guestsRoomList')?.addEventListener('change', (event) => {
    const select = event.target.closest('[data-guest-age]');
    if (!select) return;
    const roomIndex = Number(select.getAttribute('data-guest-age') || -1);
    const ageIndex = Number(select.getAttribute('data-guest-age-index') || -1);
    const room = guestRooms[roomIndex];
    if (!room || ageIndex < 0) return;
    room.childAges[ageIndex] = select.value === '' ? null : Number(select.value);
  });

  document.getElementById('guestsAddRoomBtn')?.addEventListener('click', () => {
    addGuestRoom();
  });

  document.getElementById('guestsSubmitBtn')?.addEventListener('click', () => {
    openDatesBeforeOfferStep();
  });

  document.getElementById('offerBackToGuestsBtn')?.addEventListener('click', () => {
    if (offerSelectMode === 'change') {
      returnToBookRooms();
      return;
    }
    openGuestsStep(preferredRoomType);
  });

  document.getElementById('offerBackFooterBtn')?.addEventListener('click', () => {
    if (offerSelectMode === 'change') {
      returnToBookRooms();
      return;
    }
    openGuestsStep(preferredRoomType);
  });

  document.getElementById('offerSelectionStatus')?.addEventListener('click', () => {
    scrollOfferCartIntoView();
  });

  document.getElementById('offerContinueBtn')?.addEventListener('click', () => {
    continueFromOfferToBooking();
  });

  document.getElementById('bookWizardNextBtn')?.addEventListener('click', () => {
    advanceBookWizard();
  });

  document.getElementById('bookWizardBackBtn')?.addEventListener('click', () => {
    retreatBookWizard();
  });

  syncGuestFlowSummary();
  renderGuestsRooms();

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (detailsModal && !detailsModal.hidden && detailsReturnTarget === 'offers') {
        closeDetailsOrModal();
        return;
      }
      detailsReturnTarget = null;
      closeAllModals();
      return;
    }

    const activeModal = allModals.find((modal) => modal && !modal.hidden);
    if (event.key === 'Tab' && activeModal) {
      const controls = Array.from(
        activeModal.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), details > summary, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((control) => control.getClientRects().length > 0);
      if (controls.length) {
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    if (detailsModal && !detailsModal.hidden && detailsPhotos.length > 1) {
      if (event.key === 'ArrowLeft') showDetailsPhoto(detailsPhotoIndex - 1);
      if (event.key === 'ArrowRight') showDetailsPhoto(detailsPhotoIndex + 1);
    }
  });

  const bookCheckIn = document.getElementById('bookCheckIn');
  const bookCheckOut = document.getElementById('bookCheckOut');
  const bookLeadHint = document.getElementById('bookLeadHint');
  const quickBookForm = document.getElementById('quickBookForm');
  wireDateLimits(bookCheckIn, bookCheckOut);
  bookCheckIn?.addEventListener('change', () => {
    updateLeadHint(bookCheckIn, bookLeadHint, quickBookForm);
  });

  const modalCheckIn = document.getElementById('modalCheckIn');
  const modalCheckOut = document.getElementById('modalCheckOut');
  const modalLeadHint = document.getElementById('modalLeadHint');
  const bookModalForm = document.getElementById('bookModalForm');
  wireDateLimits(modalCheckIn, modalCheckOut);
  function refreshRequiredErrorsIfShown() {
    const formMsg = document.getElementById('bookFormMessage');
    const guestInvalid = document.getElementById('bookGuestSection')?.classList.contains('is-invalid-required');
    const datesInvalid = document.getElementById('bookDatesSection')?.classList.contains('is-invalid-required');
    const formError = formMsg && !formMsg.hidden && formMsg.classList.contains('is-error');
    if (!guestInvalid && !datesInvalid && !formError) return;

    let result = { ok: true, message: '' };
    if (bookWizardStep === 'guest') result = validateGuestWizardStep();
    else if (bookWizardStep === 'dates') result = validateDatesWizardStep();
    else if (bookWizardStep === 'rooms') result = validateRoomsWizardStep();
    else result = validateBookRequiredFields();

    if (result.ok) setMessage(formMsg, '', false);
    else setMessage(formMsg, result.message, false);
  }

  modalCheckIn?.addEventListener('change', () => {
    applyDateLimits(modalCheckIn, modalCheckOut);
    ensureStayDatesForOffer();
    const minNights = cartRequiredMinNights();
    const nights = nightCount(modalCheckIn.value || '', modalCheckOut?.value || '');
    const dateMsg = document.getElementById('stayDatesRequiredMsg');
    const datesSection = document.getElementById('bookDatesSection');
    if (minNights > 1 && nights > 0 && nights < minNights) {
      datesSection?.classList.add('is-invalid-required');
      if (dateMsg) {
        dateMsg.hidden = false;
        dateMsg.textContent = tx(
          'booking.validateMinStayOffer',
          { n: minNights },
          `This stay-longer offer requires at least ${minNights} nights. Extend your check-out.`
        );
      }
      showToast(
        tx(
          'booking.validateMinStayOffer',
          { n: minNights },
          `This stay-longer offer requires at least ${minNights} nights. Extend your check-out.`
        ),
        false
      );
    } else if (dateMsg && datesSection?.classList.contains('is-invalid-required')) {
      const err = validateDates(modalCheckIn.value || '', modalCheckOut?.value || '');
      if (!err) {
        datesSection.classList.remove('is-invalid-required');
        dateMsg.hidden = true;
        dateMsg.textContent = '';
      }
    }
    updateLeadHint(modalCheckIn, modalLeadHint, bookModalForm);
    refreshLiveAvailability(modalCheckIn.value, modalCheckOut?.value || '');
    renderCart();
    syncLoyaltyBanner();
    refreshRequiredErrorsIfShown();
  });
  modalCheckOut?.addEventListener('change', () => {
    applyDateLimits(modalCheckIn, modalCheckOut);
    const minNights = cartRequiredMinNights();
    const nights = nightCount(modalCheckIn?.value || '', modalCheckOut.value || '');
    const dateMsg = document.getElementById('stayDatesRequiredMsg');
    const datesSection = document.getElementById('bookDatesSection');
    if (minNights > 1 && nights > 0 && nights < minNights) {
      // Bump to minimum and warn.
      if (modalCheckIn?.value) {
        modalCheckOut.value = addDaysIso(modalCheckIn.value, minNights);
      }
      datesSection?.classList.add('is-invalid-required');
      if (dateMsg) {
        dateMsg.hidden = false;
        dateMsg.textContent = tx(
          'booking.validateMinStayOffer',
          { n: minNights },
          `This stay-longer offer requires at least ${minNights} nights. Check-out was adjusted.`
        );
      }
      showToast(
        tx(
          'booking.validateMinStayAdjusted',
          { n: minNights },
          `Stay must be at least ${minNights} nights for this offer. Check-out was updated.`
        ),
        false
      );
    } else if (dateMsg && nights >= minNights) {
      datesSection?.classList.remove('is-invalid-required');
      dateMsg.hidden = true;
      dateMsg.textContent = '';
    }
    refreshLiveAvailability(modalCheckIn?.value || '', modalCheckOut.value);
    renderCart();
    syncLoyaltyBanner();
    refreshRequiredErrorsIfShown();
  });

  ['guestName', 'guestEmail', 'guestPhone'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => {
      refreshRequiredErrorsIfShown();
    });
  });

  document.getElementById('modalCheckInTime')?.addEventListener('change', () => {
    updateStayTimeFeesHint();
    syncCartSubmitState();
  });
  document.getElementById('modalCheckOutTime')?.addEventListener('change', () => {
    updateStayTimeFeesHint();
    syncCartSubmitState();
  });
  document.getElementById('stayLongerSuggestSwitchBtn')?.addEventListener('click', () => {
    applyStayLongerSuggestion();
  });
  refreshStayTimeOptions(true);

  const bookPageMsg = document.getElementById('bookPageFormMessage');
  const clearBookForm = document.getElementById('clearBookForm');
  const bookMsg = document.getElementById('bookFormMessage');
  const addRoomToCartBtn = document.getElementById('addRoomToCartBtn');
  const modalRoomQty = document.getElementById('modalRoomQty');
  const modalRoomType = document.getElementById('modalRoomType');
  const acceptStayTerms = document.getElementById('acceptStayTerms');

  function syncModalQtyMax() {
    if (!modalRoomQty || !modalRoomType) return;
    const meta = getRoomMeta(modalRoomType.value);
    const byAvailability = meta
      ? Math.max(0, remainingCapacity(meta.roomType, meta.available))
      : 0;
    const byIntent = remainingIntendedRoomSlots();
    const hardMax = Math.max(0, Math.min(byAvailability, byIntent));
    modalRoomQty.max = String(Math.max(hardMax, 0));
    if (hardMax < 1) {
      modalRoomQty.value = '1';
      modalRoomQty.disabled = true;
    } else {
      modalRoomQty.disabled = false;
      if (Number(modalRoomQty.value || 1) > hardMax) modalRoomQty.value = String(hardMax);
    }
  }

  modalRoomType?.addEventListener('change', syncModalQtyMax);
  acceptStayTerms?.addEventListener('change', syncCartSubmitState);

  addRoomToCartBtn?.addEventListener('click', () => {
    const roomType = modalRoomType?.value || '';
    const qty = Number(modalRoomQty?.value || 1);
    const result = addToCart(roomType, qty);
    if (!result.ok) {
      setMessage(bookMsg, result.message, false);
      showToast(result.message);
      return;
    }
    setMessage(bookMsg, '', false);
    showToast(result.message, true);
    if (modalRoomQty) modalRoomQty.value = '1';
    syncModalQtyMax();
  });

  document.getElementById('bookingCartList')?.addEventListener('click', (event) => {
    const changeBtn = event.target.closest('[data-change-room]');
    if (changeBtn) {
      openOfferChangeMode(changeBtn.getAttribute('data-change-room') || '');
      return;
    }
  });

  document.getElementById('bookingCartTotalsToggle')?.addEventListener('click', () => {
    setBookingCartTotalsOpen(!bookingCartTotalsOpen);
  });

  quickBookForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = document.getElementById('bookGuestName')?.value.trim() || '';
    const email = document.getElementById('bookGuestEmail')?.value.trim() || '';
    const phone = document.getElementById('bookGuestPhone')?.value.trim() || '';
    const checkIn = bookCheckIn?.value || '';
    const checkOut = document.getElementById('bookCheckOut')?.value || '';
    const guests = Number(document.getElementById('bookGuests')?.value || 0);
    const roomType = document.getElementById('bookRoomTypeSelect')?.value || '';

    if (!name || !email || !phone) {
      setMessage(bookPageMsg, 'Name, email, and phone are required.', false);
      return;
    }
    if (!email.includes('@')) {
      setMessage(bookPageMsg, tx('booking.validateEmail', null, 'Enter a valid email address.'), false);
      return;
    }
    if (!isValidPhone(phone)) {
      setMessage(bookPageMsg, tx('booking.validatePhone', null, 'Enter a valid phone number.'), false);
      return;
    }
    const dateError = validateDates(checkIn, checkOut);
    if (dateError) {
      setMessage(bookPageMsg, dateError, false);
      showToast(dateError);
      return;
    }
    if (!roomType) {
      setMessage(bookPageMsg, tx('booking.validateSelectRoom', null, 'Please select a room.'), false);
      return;
    }
    if (guests < 1) {
      setMessage(bookPageMsg, 'Guest count must be at least 1.', false);
      return;
    }

    const guestName = document.getElementById('guestName');
    const guestEmail = document.getElementById('guestEmail');
    const guestPhone = document.getElementById('guestPhone');
    if (guestName) guestName.value = name;
    if (guestEmail) guestEmail.value = email;
    if (guestPhone) guestPhone.value = phone;
    if (modalCheckIn) modalCheckIn.value = checkIn;
    if (modalCheckOut) modalCheckOut.value = checkOut;

    clearCart();
    fillBookRoom(roomType);
    setMessage(bookPageMsg, 'Continue in the booking form — add rooms to your cart, then submit.', true);
    applyDateLimits(modalCheckIn, modalCheckOut);
    setBookWizardStep('guest');
    openModal(bookModal);
    updateLeadHint(modalCheckIn, modalLeadHint, bookModalForm);
    syncModalQtyMax();
  });

  clearBookForm?.addEventListener('click', () => {
    quickBookForm?.reset();
    applyDateLimits(bookCheckIn, bookCheckOut);
    setMessage(bookPageMsg, '', false);
    updateLeadHint(bookCheckIn, bookLeadHint, quickBookForm);
    showToast('Form cleared.');
  });

  bookModalForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (bookWizardStep !== 'confirm') {
      advanceBookWizard();
      return;
    }

    const name = document.getElementById('guestName')?.value.trim() || '';
    const email = document.getElementById('guestEmail')?.value.trim() || '';
    const phone = document.getElementById('guestPhone')?.value.trim() || '';
    const checkIn = modalCheckIn?.value || '';
    const checkOut = document.getElementById('modalCheckOut')?.value || '';

    const guestOk = validateGuestWizardStep();
    if (!guestOk.ok) {
      setBookWizardStep('guest');
      setMessage(bookMsg, guestOk.message, false);
      return;
    }
    const datesOk = validateDatesWizardStep();
    if (!datesOk.ok) {
      setBookWizardStep('dates');
      setMessage(bookMsg, datesOk.message, false);
      return;
    }
    const roomsOk = validateRoomsWizardStep();
    if (!roomsOk.ok) {
      setBookWizardStep('rooms');
      setMessage(bookMsg, roomsOk.message, false);
      return;
    }
    if (!acceptStayTerms?.checked) {
      setMessage(bookMsg, tx('booking.validateAcceptTerms', null, 'Please read and accept the Terms of Stay before submitting.'), false);
      acceptStayTerms?.focus();
      return;
    }
    const paymentOption = 'Full';
    const specialOfferId = selectedSpecialOffer?.id
      ? Number(selectedSpecialOffer.id)
      : (Number(document.getElementById('specialOfferId')?.value || 0) || null);
    if (hasCashOnlySpecialOffer()) {
      selectedPayMethod = 'Cash';
    }

    clearBookRequiredErrors();
    const submitButton = document.getElementById('bookModalSubmit');
    const token = bookModalForm.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.originalText = submitButton.textContent || '';
      submitButton.textContent = tx('booking.sending', null, 'Sending…');
    }
    setMessage(bookMsg, '', false);

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          RequestVerificationToken: token,
        },
        body: JSON.stringify({
          guestName: name,
          guestEmail: email,
          guestPhone: phone,
          checkInAtUtc: toManilaDateTimeIso(checkIn, selectedCheckInTime()),
          checkoutTimeUtc: toManilaDateTimeIso(checkOut, selectedCheckOutTime()),
          paymentOption,
          acceptTerms: true,
          extraPersons: extraPersonsSelected(),
          arrivalDiscountRequest: 'None',
          specialOfferId: specialOfferId > 0 ? specialOfferId : null,
          preferredPaymentMethod: selectedPayMethod || 'Cash',
          items: bookingCart.map((line) => ({
            roomTypeId: line.roomTypeId,
            quantity: line.qty,
          })),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (Array.isArray(payload.availability)) {
          applyLiveAvailability(payload.availability);
        }
        const validationMessage = payload.errors
          ? Object.values(payload.errors).flat().join(' ')
          : '';
        throw new Error(
          payload.message
          || validationMessage
          || (response.status === 429
            ? tx(
                'booking.toastTooManyAttempts',
                null,
                'Too many booking attempts. Please wait a minute and try again.'
              )
            : tx('booking.toastSubmitFailed', null, 'We could not submit your booking. Please try again.'))
        );
      }

      const kind = String(payload.kind || 'Booking').toLowerCase();
      const dueNow = Number(payload.amountDueNow ?? 0);
      const checkInTime = selectedCheckInTime();
      const checkOutTime = selectedCheckOutTime();
      const fees = timeFeesTotal();
      const feeNote = fees > 0
        ? ` Time fees (${formatMoney(fees)} for early check-in / late check-out) will be settled with the hotel.`
        : '';
      const roomSummary = (payload.items || bookingCart)
        .map((line) => `${line.quantity ?? line.qty}× ${line.roomTypeName ?? line.roomType}`)
        .join(', ');
      const offerNote = selectedSpecialOffer?.id
        ? selectedSpecialOffer.cashOnly
          ? ` Special offer${selectedSpecialOffer.title ? ` “${selectedSpecialOffer.title}”` : ''} — pay cash on arrival only.`
          : ` Special offer${selectedSpecialOffer.title ? ` “${selectedSpecialOffer.title}”` : ''} applied.`
        : '';
      showSuccess(
        {
          kind,
          label: kind === 'reservation'
            ? tx('booking.reservation', null, 'Reservation')
            : tx('booking.booking', null, 'Booking'),
        },
        `Thanks, ${name}. Your booking request ${payload.reference} is Pending. Reception will call to verify ${roomSummary} (${checkIn} ${checkInTime} → ${checkOut} ${checkOutTime}).${feeNote}${offerNote}`
      );
      bookModalForm.reset();
      clearBookRequiredErrors();
      clearCart();
      setPaymentOption('Full');
      setBookWizardStep('guest');
      lastTimeFeeRoomCount = -1;
      refreshStayTimeOptions(true);
      applyDateLimits(modalCheckIn, modalCheckOut);
      updateLeadHint(modalCheckIn, modalLeadHint, bookModalForm);
      syncModalQtyMax();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to submit booking.';
      setMessage(bookMsg, message, false);
      showToast(message);
    } finally {
      if (submitButton) {
        submitButton.textContent = submitButton.dataset.originalText || 'Submit booking';
        syncCartSubmitState();
      }
    }
  });

  renderCart();
  syncModalQtyMax();

  function initRoomCarousel(root) {
    const track = root.querySelector('[data-room-carousel-track]');
    const prevBtn = root.querySelector('[data-room-carousel-prev]');
    const nextBtn = root.querySelector('[data-room-carousel-next]');
    if (!track || !prevBtn || !nextBtn) return;

    const cards = () => Array.from(track.querySelectorAll('.guest-room, .guest-gallery-room, .guest-review-slide'));

    function stepSize() {
      const first = cards()[0];
      if (!first) return track.clientWidth;
      const styles = window.getComputedStyle(track);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
      const cardStep = first.getBoundingClientRect().width + gap;
      const requestedPageSize = Math.max(1, Number.parseInt(root.dataset.carouselPageSize || '1', 10));
      const visibleCards = Math.max(
        1,
        Math.min(requestedPageSize, Math.round((track.clientWidth + gap) / cardStep))
      );
      return cardStep * visibleCards;
    }

    function maxScrollLeft() {
      return Math.max(0, track.scrollWidth - track.clientWidth);
    }

    function updateNav() {
      const maxScroll = maxScrollLeft();
      // Hysteresis avoids width thrash when CSS/layout reacts to .is-scrollable
      const wasScrollable = root.classList.contains('is-scrollable');
      const scrollable = wasScrollable ? maxScroll > 8 : maxScroll > 2;
      root.classList.toggle('is-scrollable', scrollable);
      prevBtn.hidden = !scrollable;
      nextBtn.hidden = !scrollable;
      // Keep both controls enabled while scrollable so the carousel can loop.
      prevBtn.disabled = !scrollable;
      nextBtn.disabled = !scrollable;
    }

    function scrollBehavior() {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    }

    function scrollByDir(dir) {
      const maxScroll = maxScrollLeft();
      if (maxScroll <= 2) return;

      const atStart = track.scrollLeft <= 2;
      const atEnd = track.scrollLeft >= maxScroll - 2;
      const behavior = scrollBehavior();

      if (dir > 0 && atEnd) {
        track.scrollTo({ left: 0, behavior });
        return;
      }

      if (dir < 0 && atStart) {
        track.scrollTo({ left: maxScroll, behavior });
        return;
      }

      track.scrollBy({ left: dir * stepSize(), behavior });
    }

    prevBtn.addEventListener('click', () => scrollByDir(-1));
    nextBtn.addEventListener('click', () => scrollByDir(1));
    track.addEventListener('scroll', updateNav, { passive: true });
    window.addEventListener('resize', updateNav);

    track.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scrollByDir(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        scrollByDir(1);
      }
    });

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateNav);
      ro.observe(track);
      cards().forEach((card) => ro.observe(card));
    }

    updateNav();
  }

  document.querySelectorAll('[data-room-carousel]').forEach(initRoomCarousel);

  function initFeatureMediaPager(root) {
    const media = root.querySelector('[data-feature-media]');
    const img = root.querySelector('[data-feature-image]');
    const pager = root.querySelector('[data-feature-pager]');
    if (!media || !img || !pager) return;

    let photos = [];
    try {
      const parsed = JSON.parse(root.getAttribute('data-images') || '[]');
      photos = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      photos = [];
    }
    if (photos.length < 2) return;

    let index = Math.max(0, photos.indexOf(img.getAttribute('src') || ''));
    if (index < 0) index = 0;
    let fadeTimer = 0;

    const countEl = pager.querySelector('[data-feature-count]');
    const prevBtn = pager.querySelector('[data-feature-prev]');
    const nextBtn = pager.querySelector('[data-feature-next]');

    function show(i) {
      index = ((i % photos.length) + photos.length) % photos.length;
      const nextSrc = photos[index];
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (reduceMotion || img.getAttribute('src') === nextSrc) {
        img.src = nextSrc;
        img.classList.remove('is-fading');
        if (countEl) countEl.textContent = `${index + 1} / ${photos.length}`;
        return;
      }

      window.clearTimeout(fadeTimer);
      img.classList.add('is-fading');
      fadeTimer = window.setTimeout(() => {
        img.src = nextSrc;
        if (countEl) countEl.textContent = `${index + 1} / ${photos.length}`;
        requestAnimationFrame(() => {
          img.classList.remove('is-fading');
        });
      }, 140);
    }

    prevBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      show(index - 1);
    });
    nextBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      show(index + 1);
    });
  }

  document.querySelectorAll('.guest-room-feature[data-images]').forEach((card) => {
    initFeatureMediaPager(card);
    card.dataset.featurePagerBound = '1';
  });

  // Apply active Limited Time / Google Loyalty rates on room cards as soon as offers load.
  document.querySelectorAll('[data-loyalty-google-form]').forEach((form) => {
    form.addEventListener('submit', persistBookDraft);
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-loyalty-dismiss]')) return;
    event.preventDefault();
    dismissLoyaltyAd();
  });
  restoreBookDraft();
  loadSpecialOffers();
  initGuestCatalogRealtime();

  // Show / hide password toggle
  document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('[data-password-toggle]');
    if (!toggleBtn) return;

    const targetId = toggleBtn.getAttribute('data-password-toggle');
    if (!targetId) return;

    const input = document.getElementById(targetId);
    if (!input) return;

    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';

    toggleBtn.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
    const labelText = isPassword ? tx('auth.hidePassword', null, 'Hide password') : tx('auth.showPassword', null, 'Show password');
    toggleBtn.setAttribute('aria-label', labelText);
    toggleBtn.setAttribute('title', labelText);

    const iconShow = toggleBtn.querySelector('.icon-eye-show');
    const iconHide = toggleBtn.querySelector('.icon-eye-hide');
    if (iconShow && iconHide) {
      iconShow.hidden = isPassword;
      iconHide.hidden = !isPassword;
    }
  });

  document.addEventListener('mori:langchange', () => {
    syncGuestFlowSummary();
    if (guestsModal && !guestsModal.hidden) {
      renderGuestsRooms();
      syncGuestsContinueState();
    }
    syncOfferSelectionStatus();
    syncOfferCardSelectionState();
    syncOfferContinueState();
    renderOfferCart();
    if (offerSelectModal && !offerSelectModal.hidden) {
      renderOfferPanel();
      syncOfferChangeChrome();
    }
    paintRoomCardPrices();
    syncLoyaltyBanner();
    if (bookModal && !bookModal.hidden) {
      setBookWizardStep(bookWizardStep);
      renderCart();
      refreshStayTimeOptions();
      updateStayTimeFeesHint();
      applyDateLimits(modalCheckIn, modalCheckOut);
      const party = document.getElementById('bookPartySummary');
      if (party) {
        party.hidden = false;
        party.textContent = partySummaryText();
      }
    }
    if (successModal && !successModal.hidden) {
      const doneBtn = successModal.querySelector('[data-close-modal].guest-btn-primary');
      if (doneBtn) doneBtn.textContent = tx('booking.done', null, 'Done');
    }
  });
})();
