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

  const MAX_GUESTS_PER_ROOM = 2;
  const MAX_CHILD_AGE = 12;
  const MAX_GUEST_ROOMS = 8;
  const EARLY_CHECKIN_TIME = '11:30';
  const EARLY_CHECKIN_FEE_PER_ROOM = 500;
  const LATE_CHECKOUT_FEE_PER_ROOM_PER_HOUR = 100;
  const MAX_LATE_CHECKOUT_HOURS = 3;
  const DEFAULT_CHECKIN_TIME = '14:00';
  const DEFAULT_CHECKOUT_TIME = '12:00';

  /** @type {{ adults: number, children: number, childAges: (number|null)[] }[]} */
  let guestRooms = [{ adults: 2, children: 0, childAges: [] }];
  let preferredRoomType = '';
  let guestsHintTimer = null;

  function setNavOpen(open) {
    if (!guestNav || !guestNavToggle) return;
    guestNav.classList.toggle('is-open', open);
    guestNavToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    guestNavToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  guestNavToggle?.addEventListener('click', () => {
    setNavOpen(!guestNav.classList.contains('is-open'));
  });

  guestNav?.querySelectorAll('.guest-nav-links a, .guest-nav-cta').forEach((link) => {
    link.addEventListener('click', () => setNavOpen(false));
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

  function initScrollReveals() {
    const nodes = Array.from(document.querySelectorAll('[data-reveal]'));
    if (!nodes.length) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      nodes.forEach((el) => el.classList.add('is-inview'));
      return;
    }

    const roomsPage = document.querySelector('.guest-rooms-page');
    const roomsCadence = Boolean(roomsPage);

    nodes.forEach((el, index) => {
      if (!el.style.getPropertyValue('--reveal-delay')) {
        const step = roomsCadence ? 110 : 90;
        el.style.setProperty('--reveal-delay', `${Math.min(index % 5, 4) * step}ms`);
      }
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-inview');
          observer.unobserve(entry.target);
        });
      },
      {
        root: null,
        threshold: roomsCadence ? 0.14 : 0.18,
        rootMargin: roomsCadence ? '0px 0px -6% 0px' : '0px 0px -8% 0px'
      }
    );

    nodes.forEach((el) => observer.observe(el));
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
    const selected = (selectedItems || [])
      .map((i) => String(i).trim())
      .filter(Boolean);
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

    for (const cat of INCLUSION_CATALOG) {
      const items = takeItems(cat.items);
      if (items.length) groups.push({ name: cat.name, items });
    }

    const leftovers = selected.filter((i) => !used.has(i.toLowerCase()));
    if (leftovers.length) {
      groups.push({ name: 'Custom', items: leftovers });
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
      empty.textContent = 'No listed inclusions';
      container.appendChild(empty);
      return;
    }

    groups.forEach((group) => {
      const section = document.createElement('section');
      section.className = 'guest-inclusion-group';

      const heading = document.createElement('h3');
      heading.className = 'guest-inclusion-group-title';
      heading.innerHTML = `<span class="guest-inclusion-icon">${iconSvg(iconForCategory(group.name))}</span><span>${group.name}</span>`;
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
    if (occupancy) occupancy.textContent = `Up to ${card.dataset.occupancy || '—'} guests`;
    if (beds) beds.textContent = `${card.dataset.beds || '—'} bed(s)`;
    if (description) description.textContent = fullDesc || 'No description provided.';
    if (bookBtn) {
      bookBtn.dataset.fillRoom = roomTypeStr;
      bookBtn.disabled = !isAvailable;
      bookBtn.textContent = isAvailable ? 'Book this room' : 'Unavailable for these dates';
    }

    if (statusPill) {
      statusPill.textContent = isAvailable ? 'Available' : 'Reserved';
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

  /** @type {{ roomTypeId: number, roomType: string, qty: number, price: number, available: number }[]} */
  let bookingCart = [];

  function getRoomMeta(roomType) {
    if (!roomType) return null;
    const modalSelect = document.getElementById('modalRoomType');
    const opt = modalSelect
      ? Array.from(modalSelect.options).find((o) => o.value === roomType)
      : null;
    const card = findRoomCard(roomType);
    const occupancy = Number(card?.dataset.occupancy || 0);
    if (opt?.value) {
      return {
        roomTypeId: Number(opt.dataset.roomTypeId || 0),
        roomType: opt.value,
        available: Number(opt.dataset.available || 0),
        price: Number(opt.dataset.price || 0),
        occupancy,
      };
    }
    if (!card) return null;
    return {
      roomTypeId: Number(card.dataset.roomTypeId || 0),
      roomType: card.dataset.roomType || roomType,
      available: Number(card.dataset.available || 0),
      price: Number(card.dataset.price || 0),
      occupancy,
    };
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

  function remainingCapacity(roomType, available) {
    const line = bookingCart.find((l) => cartLineKey(l.roomType) === cartLineKey(roomType));
    const used = line ? line.qty : 0;
    return Math.max(0, Number(available || 0) - used);
  }

  function cartRoomCount() {
    return bookingCart.reduce((sum, line) => sum + line.qty, 0);
  }

  function cartNightlyTotal() {
    return bookingCart.reduce((sum, line) => sum + line.qty * line.price, 0);
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
      const freeTimes = ['14:00', '14:30', '15:00', '15:30', '16:00'];
      checkInSelect.innerHTML = [
        `<option value="${EARLY_CHECKIN_TIME}">${EARLY_CHECKIN_TIME} — ${formatMoney(earlyFee)} early check-in</option>`,
        ...freeTimes.map((t) => `<option value="${t}">${t} — free of charge</option>`),
      ].join('');
      checkInSelect.value = [...checkInSelect.options].some((o) => o.value === prevIn)
        ? prevIn
        : DEFAULT_CHECKIN_TIME;
    }

    if (checkOutSelect) {
      const options = [
        `<option value="${DEFAULT_CHECKOUT_TIME}">${DEFAULT_CHECKOUT_TIME} — free of charge</option>`,
      ];
      for (let hour = 1; hour <= MAX_LATE_CHECKOUT_HOURS; hour += 1) {
        const [baseH, baseM] = DEFAULT_CHECKOUT_TIME.split(':').map(Number);
        const totalMinutes = baseH * 60 + baseM + hour * 60;
        const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
        const mm = String(totalMinutes % 60).padStart(2, '0');
        const time = `${hh}:${mm}`;
        const fee = LATE_CHECKOUT_FEE_PER_ROOM_PER_HOUR * hour * rooms;
        options.push(
          `<option value="${time}">${time} — ${formatMoney(fee)} late check-out</option>`
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
    const parts = [];
    if (early > 0) {
      parts.push(`Early check-in (${EARLY_CHECKIN_TIME}): ${formatMoney(early)} (${formatMoney(EARLY_CHECKIN_FEE_PER_ROOM)} × ${rooms} room${rooms === 1 ? '' : 's'})`);
    }
    if (late > 0) {
      parts.push(`Late check-out (+${hours}h): ${formatMoney(late)} (${formatMoney(LATE_CHECKOUT_FEE_PER_ROOM_PER_HOUR)} × ${rooms} room${rooms === 1 ? '' : 's'} × ${hours}h)`);
    }
    hint.hidden = parts.length === 0;
    hint.textContent = parts.length
      ? `${parts.join(' · ')}. Added to your stay total.`
      : '';
  }

  function cartGuestHoldCapacity() {
    if (!bookingCart.length) return 0;
    return bookingCart.reduce((sum, line) => {
      const meta = getRoomMeta(line.roomType);
      const listed = meta?.occupancy > 0 ? meta.occupancy : MAX_GUESTS_PER_ROOM;
      const perRoom = Math.min(listed, MAX_GUESTS_PER_ROOM);
      return sum + line.qty * perRoom;
    }, 0);
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

  function syncCartSubmitState() {
    const submitBtn = document.getElementById('bookModalSubmit');
    const status = document.getElementById('bookingCartStatus');
    const summary = document.getElementById('bookingCartSummary');
    const summaryLabel = document.getElementById('bookingCartSummaryLabel');
    const summaryTotal = document.getElementById('bookingCartSummaryTotal');
    const totalRooms = cartRoomCount();
    const nightTotal = cartNightlyTotal();
    const nights = nightCount(modalCheckIn?.value || '', modalCheckOut?.value || '');
    const stayTotal = nights > 0 ? nightTotal * nights : 0;
    const fees = timeFeesTotal(totalRooms);
    const grandTotal = stayTotal + fees;
    const hasRooms = bookingCart.length > 0;
    const acceptedTerms = document.getElementById('acceptStayTerms')?.checked === true;
    const hasPayment = Boolean(selectedPaymentOption());
    const overCapacity = isGuestCapacityExceeded();

    refreshStayTimeOptions();
    updateBookRoomsCapacityWarning();

    if (submitBtn) {
      submitBtn.disabled = !hasRooms || !acceptedTerms || !hasPayment || overCapacity;
      submitBtn.title = overCapacity
        ? 'Guests exceed room capacity. Add more rooms or reduce guests.'
        : '';
    }

    if (status) {
      status.classList.toggle('is-empty', !hasRooms);
      status.classList.toggle('is-ready', hasRooms && !overCapacity);
      status.classList.toggle('is-over-capacity', overCapacity);
      if (!hasRooms) {
        status.textContent = 'Cart empty';
      } else if (overCapacity) {
        status.textContent = 'Capacity exceeded';
      } else {
        status.textContent = `${totalRooms} room${totalRooms === 1 ? '' : 's'} ready`;
      }
    }

    if (summary) summary.hidden = !hasRooms;
    if (summaryLabel) {
      if (nights > 0) {
        summaryLabel.textContent = fees > 0
          ? `${totalRooms} room${totalRooms === 1 ? '' : 's'} · ${nights} night${nights === 1 ? '' : 's'} · time fees`
          : `${totalRooms} room${totalRooms === 1 ? '' : 's'} · ${nights} night${nights === 1 ? '' : 's'}`;
      } else {
        summaryLabel.textContent = `${totalRooms} room${totalRooms === 1 ? '' : 's'} selected · pick dates`;
      }
    }
    if (summaryTotal) {
      if (nights > 0) {
        summaryTotal.textContent = fees > 0
          ? `${formatMoney(grandTotal)} total`
          : `${formatMoney(stayTotal)} stay total`;
      } else {
        summaryTotal.textContent = `${formatMoney(nightTotal)} / night`;
      }
    }
    updatePaymentPreview();
  }

  function renderCart() {
    const list = document.getElementById('bookingCartList');
    const empty = document.getElementById('bookingCartEmpty');
    if (!list || !empty) return;

    list.innerHTML = '';
    if (!bookingCart.length) {
      list.hidden = true;
      empty.hidden = false;
      syncCartSubmitState();
      return;
    }

    empty.hidden = true;
    list.hidden = false;
    const nights = nightCount(modalCheckIn?.value || '', modalCheckOut?.value || '');

    bookingCart.forEach((line) => {
      const atCap = line.qty >= line.available;
      const perNight = line.qty * line.price;
      const stayLine = nights > 0 ? perNight * nights : perNight;
      const li = document.createElement('li');
      li.className = `guest-cart-item${atCap ? ' is-at-cap' : ''}`;
      li.innerHTML = `
        <div class="guest-cart-item-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/></svg>
        </div>
        <div class="guest-cart-item-main">
          <div class="guest-cart-item-title">
            <strong>${line.roomType}</strong>
            <span class="guest-cart-qty-badge">${line.qty}</span>
          </div>
          <div class="guest-cart-item-meta">
            <span class="guest-cart-rate">${line.qty} × ${formatMoney(line.price)}${nights > 1 ? ` × ${nights} nights` : ''}</span>
            <span class="guest-cart-line-total">${formatMoney(stayLine)}${nights > 0 ? '' : ' / night'}</span>
            ${atCap ? '<span class="guest-cart-avail is-max">Limit reached</span>' : ''}
          </div>
        </div>
        <button type="button" class="guest-cart-remove" data-remove-room="${line.roomType}" aria-label="Remove ${line.roomType}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
          Remove
        </button>
      `;
      list.appendChild(li);
    });

    syncCartSubmitState();
  }

  function addToCart(roomType, qty = 1) {
    const meta = getRoomMeta(roomType);
    if (!meta || !meta.roomType) {
      return { ok: false, message: 'Please select a room.' };
    }
    if (meta.available < 1) {
      return { ok: false, message: `${meta.roomType} cannot be added right now.` };
    }

    const addQty = Math.max(1, Number(qty) || 1);
    const existing = bookingCart.find((l) => cartLineKey(l.roomType) === cartLineKey(meta.roomType));
    const currentQty = existing ? existing.qty : 0;
    const nextQty = currentQty + addQty;

    if (nextQty > meta.available) {
      return {
        ok: false,
        message: `You've reached the booking limit for ${meta.roomType}.`,
      };
    }

    if (existing) {
      existing.roomTypeId = meta.roomTypeId;
      existing.qty = nextQty;
      existing.price = meta.price;
      existing.available = meta.available;
    } else {
      bookingCart.push({
        roomTypeId: meta.roomTypeId,
        roomType: meta.roomType,
        qty: addQty,
        price: meta.price,
        available: meta.available,
      });
    }

    renderCart();
    return { ok: true, message: `Added ${meta.roomType} to your booking.` };
  }

  function removeFromCart(roomType) {
    bookingCart = bookingCart.filter((l) => cartLineKey(l.roomType) !== cartLineKey(roomType));
    renderCart();
  }

  function clearCart() {
    bookingCart = [];
    renderCart();
    setPaymentOption('Full');
  }

  function fillBookRoom(roomName) {
    const modalSelect = document.getElementById('modalRoomType');
    const pageSelect = document.getElementById('bookRoomTypeSelect');
    if (modalSelect && roomName) modalSelect.value = roomName;
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
    if (items.length === 1) return `${items[0]} is required.`;
    if (items.length === 2) return `${items[0]} and ${items[1]} are required.`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]} are required.`;
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
      guestMissing.push('name');
      allMissing.push('Name');
      markFieldInvalid(nameEl);
      focusEl = focusEl || nameEl;
    }
    if (!email) {
      guestMissing.push('email');
      allMissing.push('email');
      markFieldInvalid(emailEl);
      focusEl = focusEl || emailEl;
    }
    if (!phone) {
      guestMissing.push('phone');
      allMissing.push('phone');
      markFieldInvalid(phoneEl);
      focusEl = focusEl || phoneEl;
    }
    if (!checkIn) {
      dateMissing.push('check-in date');
      allMissing.push('check-in date');
      markFieldInvalid(checkInEl);
      focusEl = focusEl || checkInEl;
    }
    if (!checkOut) {
      dateMissing.push('check-out date');
      allMissing.push('check-out date');
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
        guestMsg.textContent = 'Enter a valid email address.';
      }
      emailEl?.focus();
      return { ok: false, message: 'Enter a valid email address.' };
    }

    if (phone && !isValidPhone(phone)) {
      guestSection?.classList.add('is-invalid-required');
      markFieldInvalid(phoneEl);
      if (guestMsg) {
        guestMsg.hidden = false;
        guestMsg.textContent = 'Enter a valid phone number.';
      }
      phoneEl?.focus();
      return { ok: false, message: 'Enter a valid phone number.' };
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

  function applyDateLimits(checkInEl, checkOutEl) {
    if (!checkInEl || !checkOutEl) return;
    const today = todayIso();
    checkInEl.min = today;
    if (checkInEl.value && checkInEl.value < today) {
      checkInEl.value = '';
    }

    const checkoutMin = checkInEl.value ? addDaysIso(checkInEl.value, 1) : addDaysIso(today, 1);
    checkOutEl.min = checkoutMin;
    if (checkOutEl.value && checkOutEl.value < checkoutMin) {
      checkOutEl.value = '';
    }
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
      return 'Please choose check-in and check-out dates.';
    }
    const today = todayIso();
    if (checkIn < today) {
      return 'Past dates cannot be booked. Choose today or a future check-in.';
    }
    if (checkOut <= checkIn) {
      return 'Check-out must be after check-in.';
    }
    if (checkOut < today) {
      return 'Past dates cannot be booked. Choose a future check-out.';
    }
    return '';
  }

  function applyLiveAvailability(items) {
    const byId = new Map(
      (Array.isArray(items) ? items : []).map((item) => [Number(item.roomTypeId), item])
    );

    document.querySelectorAll('#modalRoomType option[data-room-type-id]').forEach((option) => {
      const item = byId.get(Number(option.dataset.roomTypeId || 0));
      const remaining = item ? Number(item.remaining || 0) : 0;
      option.dataset.available = String(remaining);
      option.disabled = remaining < 1;
    });

    document.querySelectorAll('.guest-room[data-room-type-id]').forEach((card) => {
      const item = byId.get(Number(card.dataset.roomTypeId || 0));
      const remaining = item ? Number(item.remaining || 0) : 0;
      card.dataset.available = String(remaining);

      const availability = card.querySelector('.guest-room-availability');
      if (availability) {
        availability.textContent =
          remaining > 0 ? `${remaining} available for selected dates` : 'Unavailable for selected dates';
        availability.classList.toggle('is-unavailable', remaining < 1);
      }

      const bookButton = card.querySelector('[data-guest-modal="guests"], [data-guest-modal="book"]');
      if (bookButton) bookButton.disabled = remaining < 1;
    });

    let hasShortage = false;
    bookingCart.forEach((line) => {
      const item = byId.get(Number(line.roomTypeId || 0));
      line.available = item ? Number(item.remaining || 0) : 0;
      line.price = item ? Number(item.pricePerNight || line.price) : line.price;
      if (line.qty > line.available) hasShortage = true;
    });
    renderCart();
    syncModalQtyMax();
    return hasShortage;
  }

  async function refreshLiveAvailability(checkIn, checkOut) {
    if (validateDates(checkIn, checkOut)) return;
    try {
      const query = new URLSearchParams({ checkIn, checkOut });
      const response = await fetch(`/api/bookings/availability?${query}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const hasShortage = applyLiveAvailability(await response.json());
      if (hasShortage) {
        setMessage(
          bookMsg,
          'Availability changed for these dates. Remove or adjust rooms that exceed the new limit.',
          false
        );
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
    return cartNightlyTotal() * nights + timeFeesTotal();
  }

  function selectedPaymentOption() {
    return document.getElementById('paymentOption')?.value || '';
  }

  function updatePaymentPreview() {
    const nights = nightCount(modalCheckIn?.value || '', modalCheckOut?.value || '');
    const nightly = cartNightlyTotal();
    const rooms = cartRoomCount();
    const fees = timeFeesTotal(rooms);
    const stayOnly = nights > 0 ? nightly * nights : 0;
    const stayTotal = stayOnly > 0 ? stayOnly + fees : 0;
    const displayTotal = stayTotal > 0 ? stayTotal : nightly;
    const fullEl = document.getElementById('paymentFullAmount');
    const halfEl = document.getElementById('paymentHalfAmount');
    const fullMeta = document.getElementById('paymentFullMeta');
    const halfMeta = document.getElementById('paymentHalfMeta');
    const hintEl = document.getElementById('paymentHint');
    const option = selectedPaymentOption();
    const halfAmount = Math.round((displayTotal / 2) * 100) / 100;
    const hasCart = nightly > 0;
    const unit = stayTotal > 0 ? '' : hasCart ? ' / night' : '';
    updateStayTimeFeesHint();

    if (fullEl) {
      fullEl.textContent = hasCart ? `${formatMoney(displayTotal)}${unit}` : '—';
    }
    if (halfEl) {
      halfEl.textContent = hasCart ? `${formatMoney(halfAmount)}${unit}` : '—';
    }
    if (fullMeta) {
      if (!hasCart) {
        fullMeta.textContent = 'Add rooms & dates to see price · booking';
      } else if (stayTotal > 0) {
        fullMeta.textContent = fees > 0
          ? `Due now for ${nights} night${nights === 1 ? '' : 's'} + time fees · booking`
          : `Due now for ${nights} night${nights === 1 ? '' : 's'} · recorded as a booking`;
      } else {
        fullMeta.textContent = 'Select stay dates for total · recorded as a booking';
      }
    }
    if (halfMeta) {
      if (!hasCart) {
        halfMeta.textContent = 'Add rooms & dates to see price · reservation';
      } else if (stayTotal > 0) {
        halfMeta.textContent = fees > 0
          ? `Due now (50%) · balance ${formatMoney(displayTotal - halfAmount)} at hotel · includes time fees`
          : `Due now (50%) · balance ${formatMoney(displayTotal - halfAmount)} at hotel · reservation`;
      } else {
        halfMeta.textContent = 'Select stay dates for total · 50% now · reservation';
      }
    }

    if (!hintEl) return;
    if (!option) {
      hintEl.hidden = true;
      hintEl.textContent = '';
      return;
    }
    hintEl.hidden = false;
    if (option === 'Half') {
      const due = hasCart && stayTotal > 0
        ? ` Due now: ${formatMoney(halfAmount)}.`
        : hasCart
          ? ` Due now: ${formatMoney(halfAmount)} / night once dates are set.`
          : '';
      hintEl.textContent = `Half payment is saved as a reservation — even if check-in is within 24 hours.${due} Balance is due at the hotel.`;
      hintEl.classList.add('is-reservation');
      hintEl.classList.remove('is-booking');
    } else {
      const due = hasCart && stayTotal > 0
        ? ` Due now: ${formatMoney(displayTotal)}.`
        : hasCart
          ? ` Due now: ${formatMoney(displayTotal)} / night once dates are set.`
          : '';
      hintEl.textContent = `Full payment is saved as a booking (advance booking on the staff calendar).${due}`;
      hintEl.classList.add('is-booking');
      hintEl.classList.remove('is-reservation');
    }
  }

  function setPaymentOption(option) {
    const hidden = document.getElementById('paymentOption');
    if (hidden) hidden.value = option || '';
    document.querySelectorAll('[data-payment-option]').forEach((btn) => {
      const active = btn.getAttribute('data-payment-option') === option;
      btn.classList.toggle('is-selected', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    updatePaymentPreview();
    syncCartSubmitState();
  }

  /** Preview only; the server performs the authoritative classification from payment option. */
  function classifyStayFromPayment(paymentOption) {
    if (paymentOption === 'Half') {
      return {
        kind: 'reservation',
        label: 'Reservation',
        hint: 'Half payment — this request will be held as a reservation.',
      };
    }
    if (paymentOption === 'Full') {
      return {
        kind: 'booking',
        label: 'Booking',
        hint: 'Full payment — this request will be held as a booking.',
      };
    }
    return null;
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
    if (successEyebrow) successEyebrow.textContent = classification.label || 'Request';
    if (successTitle) {
      successTitle.textContent =
        classification.kind === 'reservation' ? 'Reservation received' : 'Booking received';
    }
    if (successMessage) successMessage.textContent = message;
    openModal(successModal);
    showToast('Booking request sent.', true);
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
    const parts = [
      `${guestCount} guest${guestCount === 1 ? '' : 's'}`,
      `${totals.rooms} room${totals.rooms === 1 ? '' : 's'}`,
    ];
    const detail = [];
    if (totals.adults) detail.push(`${totals.adults} adult${totals.adults === 1 ? '' : 's'}`);
    if (totals.children) detail.push(`${totals.children} child${totals.children === 1 ? '' : 'ren'}`);
    if (detail.length) parts.push(detail.join(' · '));
    return parts.join(' · ');
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
    el.textContent = `${guestCount} guest${guestCount === 1 ? '' : 's'} · ${totals.rooms} room${totals.rooms === 1 ? '' : 's'}`;
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
    let html = '<option value="">Select age</option>';
    for (let age = 0; age <= MAX_CHILD_AGE; age += 1) {
      const label = age === 0 ? 'Under 1 year' : `${age} year${age === 1 ? '' : 's'} old`;
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
        room.adults = a;
        room.children = c;
        if (Array.isArray(room.childAges)) {
          room.childAges.length = c;
        }
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
        const removeBtn =
          index === 0
            ? ''
            : `<button type="button" class="guest-guests-remove" data-guest-remove-room="${index}" aria-label="Remove room ${index + 1}">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
              </button>`;

        const ages =
          (Number(room.children) || 0) > 0
            ? `<div class="guest-guests-ages">
                <span class="guest-guests-ages-label">${room.children} child${room.children === 1 ? '' : "ren"}'s age</span>
                <div class="guest-guests-ages-grid">
                  ${Array.from({ length: room.children }, (_, childIndex) => {
                    const age = room.childAges[childIndex];
                    return `<label class="guest-guests-age-field">
                      <span class="visually-hidden">Child ${childIndex + 1} age</span>
                      <select data-guest-age="${index}" data-guest-age-index="${childIndex}">
                        ${ageOptionsHtml(age)}
                      </select>
                    </label>`;
                  }).join('')}
                </div>
              </div>`
            : '';

        const tooltipMsg = 'Maximum capacity reached (2 guests per room). Please add another room for additional guests.';
        const tooltipAttr = !canInc ? ` data-tooltip="${tooltipMsg}"` : '';
        const titleAttr = !canInc ? ` title="${tooltipMsg}"` : '';

        return `<article class="guest-guests-room${atCapacity ? ' is-at-capacity' : ''}${overCapacity ? ' is-over-capacity' : ''}" data-guest-room="${index}">
          <div class="guest-guests-room-head">
            <h3>Room ${index + 1}</h3>
            ${removeBtn}
          </div>
          <div class="guest-guests-counters">
            <div class="guest-guests-counter">
              <span class="guest-guests-counter-label">Adults</span>
              <div class="guest-guests-stepper">
                <div class="guest-stepper-btn-wrap">
                  <button type="button" data-guest-step="adults" data-guest-room-index="${index}" data-guest-delta="-1" aria-label="Fewer adults in room ${index + 1}" ${canDecAdult ? '' : 'disabled'}>−</button>
                </div>
                <span aria-live="polite">${room.adults}</span>
                <div class="guest-stepper-btn-wrap${!canInc ? ' has-tooltip' : ''}"${tooltipAttr}>
                  <button type="button" data-guest-step="adults" data-guest-room-index="${index}" data-guest-delta="1" aria-label="More adults in room ${index + 1}" ${canInc ? '' : 'disabled'}${titleAttr}>+</button>
                </div>
              </div>
            </div>
            <div class="guest-guests-counter">
              <span class="guest-guests-counter-label">Children under 12 years old</span>
              <div class="guest-guests-stepper">
                <div class="guest-stepper-btn-wrap">
                  <button type="button" data-guest-step="children" data-guest-room-index="${index}" data-guest-delta="-1" aria-label="Fewer children in room ${index + 1}" ${canDecChild ? '' : 'disabled'}>−</button>
                </div>
                <span aria-live="polite">${room.children}</span>
                <div class="guest-stepper-btn-wrap${!canInc ? ' has-tooltip' : ''}"${tooltipAttr}>
                  <button type="button" data-guest-step="children" data-guest-room-index="${index}" data-guest-delta="1" aria-label="More children in room ${index + 1}" ${canInc ? '' : 'disabled'}${titleAttr}>+</button>
                </div>
              </div>
            </div>
          </div>
          ${ages}
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
      ? 'Guests exceed room capacity. Add another room or reduce guests to continue.'
      : '';
  }

  function adjustGuestCount(roomIndex, field, delta) {
    const room = guestRooms[roomIndex];
    if (!room) return;

    const adults = Number(room.adults) || 0;
    const children = Number(room.children) || 0;
    const currentTotal = adults + children;

    if (delta > 0 && currentTotal >= MAX_GUESTS_PER_ROOM) {
      showGuestsHint('Each room holds up to 2 guests. Please add another room for additional guests.');
      return;
    }

    if (field === 'adults') {
      const next = adults + delta;
      if (next < 1) return;
      if (next + children > MAX_GUESTS_PER_ROOM) {
        showGuestsHint('Each room holds up to 2 guests. Please add another room for additional guests.');
        return;
      }
      room.adults = next;
    } else {
      const next = children + delta;
      if (next < 0) return;
      if (adults + next > MAX_GUESTS_PER_ROOM) {
        showGuestsHint('Each room holds up to 2 guests. Please add another room for additional guests.');
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
    let max = 0;
    document.querySelectorAll('.guest-room[data-room-type-id]').forEach((card) => {
      const available = Number(card.getAttribute('data-available') || 0);
      const occupancy = Number(card.getAttribute('data-occupancy') || 0);
      const listed = occupancy > 0 ? occupancy : MAX_GUESTS_PER_ROOM;
      const perRoom = Math.min(listed, MAX_GUESTS_PER_ROOM);
      max = Math.max(max, available * perRoom);
    });
    return max;
  }

  function capacityShortageMessage(roomCount = guestRooms.length, roomType = '') {
    const totals = guestTotals();
    const guestCount = totals.adults + totals.children;
    const configuredCapacity = roomCount * MAX_GUESTS_PER_ROOM;
    const maxAvailable = maxInventoryAvailable();
    const maxCapacity = maxGuestCapacityAcrossInventory();
    const parts = [];

    if (guestCount > configuredCapacity) {
      parts.push(
        `${guestCount} guests need at least ${Math.ceil(guestCount / MAX_GUESTS_PER_ROOM)} room${Math.ceil(guestCount / MAX_GUESTS_PER_ROOM) === 1 ? '' : 's'} (max ${MAX_GUESTS_PER_ROOM} guests per room).`
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
        const listed = meta.occupancy > 0 ? meta.occupancy : MAX_GUESTS_PER_ROOM;
        const perRoom = Math.min(listed, MAX_GUESTS_PER_ROOM);
        const hold = qty * perRoom;
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
        return `Room ${i + 1} needs at least 1 adult.`;
      }
      if (children > 0) {
        for (let c = 0; c < children; c += 1) {
          const age = room.childAges[c];
          if (age === null || age === undefined || age === '') {
            return `Select an age for each child in Room ${i + 1}.`;
          }
          if (Number(age) > MAX_CHILD_AGE) {
            return `Children must be ${MAX_CHILD_AGE} years old or under.`;
          }
        }
      }
    }
    return '';
  }

  function openGuestsStep(roomName) {
    preferredRoomType = roomName || preferredRoomType || '';
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

  function collectOfferRoomTypes() {
    const cards = Array.from(document.querySelectorAll('.guest-room[data-room-type-id]'));
    return cards
      .map((card) => {
        const roomType = card.getAttribute('data-room-type') || '';
        const roomTypeId = Number(card.getAttribute('data-room-type-id') || 0);
        const price = Number(card.getAttribute('data-price') || 0);
        const occupancy = Number(card.getAttribute('data-occupancy') || 0);
        const beds = Number(card.getAttribute('data-beds') || 0);
        const available = Number(card.getAttribute('data-available') || 0);
        const images = parseJsonArray(card.getAttribute('data-images'));
        const inclusions = parseJsonArray(card.getAttribute('data-inclusions'));
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
      .filter((item) => item.roomType && item.available >= 1)
      .sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.price - b.price);
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
          ? `Selecting a rate books up to ${roomCount} rooms of that type (based on availability). Prices shown are per night.`
          : 'Choose a rate for your stay. Prices shown are per night.';
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
        if (title) title.textContent = 'No rooms listed right now';
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
      const more = item.inclusions.length > 5 ? `<li>+${item.inclusions.length - 5} more</li>` : '';
      const desc =
        item.description.length > 160
          ? `${item.description.slice(0, 160).trimEnd()}…`
          : item.description;
      const safeName = escapeHtml(item.roomType);
      const safeImage = escapeHtml(image);
      const bookQty = Math.min(roomCount, item.available);
      const listed = item.occupancy > 0 ? item.occupancy : MAX_GUESTS_PER_ROOM;
      const perRoom = Math.min(listed, MAX_GUESTS_PER_ROOM);
      const qtyNote =
        bookQty < roomCount
          ? `${bookQty} of ${roomCount} rooms available now`
          : `${bookQty} room${bookQty === 1 ? '' : 's'} · up to ${perRoom} guests each`;
      const article = document.createElement('article');
      article.className = `guest-offer-card${item.preferred ? ' is-preferred' : ''}`;
      article.innerHTML = `
        <div class="guest-offer-card-top">
          <div class="guest-offer-media">
            ${
              image
                ? `<img src="${safeImage}" alt="" loading="lazy" />`
                : `<div class="guest-room-placeholder" aria-hidden="true"><span>${(item.roomType || 'R').trim().charAt(0).toUpperCase()}</span></div>`
            }
            <span class="guest-offer-availability">${item.available} available</span>
          </div>
          <div class="guest-offer-copy">
            <p class="guest-eyebrow">Guest room</p>
            <h3>${safeName}</h3>
            <ul class="guest-offer-meta">
              <li>Up to ${perRoom} guests / room</li>
              <li>${item.beds || '—'} bed${item.beds === 1 ? '' : 's'}</li>
            </ul>
            ${tags ? `<ul class="guest-offer-tags">${tags}${more}</ul>` : ''}
            <p class="guest-offer-desc">${escapeHtml(desc) || 'A comfortable stay with everything you need.'}</p>
          </div>
        </div>
        <div class="guest-offer-rates">
          <div class="guest-offer-group">
            <div class="guest-offer-group-head">
              <strong>Best deal</strong>
              <span>Best Available Rate — Room Only</span>
            </div>
            <div class="guest-offer-row">
              <div class="guest-offer-includes">
                <span>Room only</span>
                <span>Meals not included</span>
                <span>Wi‑Fi and hotel facilities</span>
              </div>
              <div class="guest-offer-price-block">
                <span class="guest-offer-price-label">Price for 1 night</span>
                <strong class="guest-offer-price">${formatMoney(item.price)}</strong>
                <span class="guest-offer-price-note">${qtyNote}</span>
                <button type="button"
                        class="guest-btn guest-btn-primary guest-offer-select"
                        data-offer-select="">
                  Select
                </button>
              </div>
            </div>
          </div>
          <div class="guest-offer-group is-special">
            <div class="guest-offer-group-head">
              <strong>Special offers</strong>
              <span>Limited-time rates</span>
            </div>
            <p class="guest-offer-special-empty">No limited offers right now.</p>
          </div>
        </div>
      `;
      const selectBtn = article.querySelector('[data-offer-select]');
      if (selectBtn) selectBtn.setAttribute('data-offer-select', item.roomType);
      list.appendChild(article);
    });
  }

  function openOfferStep() {
    const error = validateGuestRooms();
    if (error) {
      showGuestsHint(error);
      showToast(error, false);
      return;
    }
    if (guestRoomsOverCapacity()) {
      const message = `Guests exceed room capacity (max ${MAX_GUESTS_PER_ROOM} per room). Add another room or reduce guests to continue.`;
      showGuestsHint(message);
      showToast(message, false);
      syncGuestsContinueState();
      return;
    }
    showGuestsHint('');
    syncGuestFlowSummary();
    renderOfferPanel();
    openModal(offerSelectModal);
  }

  function updateBookPartySummary() {
    const el = document.getElementById('bookPartySummary');
    if (!el) return;
    const text = partySummaryText();
    el.hidden = !text;
    el.textContent = text;
  }

  function selectOfferAndOpenBooking(roomType) {
    const requestedQty = guestRooms.length;
    const meta = getRoomMeta(roomType);
    if (!meta?.roomType) {
      showToast('Please choose a room.', false);
      return;
    }
    if (meta.available < 1) {
      showToast(`${meta.roomType} is not available right now.`, false);
      return;
    }

    const qty = Math.min(requestedQty, meta.available);
    const listed = meta.occupancy > 0 ? meta.occupancy : MAX_GUESTS_PER_ROOM;
    const perRoom = Math.min(listed, MAX_GUESTS_PER_ROOM);
    const hold = qty * perRoom;
    const guests = guestPartyCount();
    if (guests > hold) {
      const message = `Guests (${guests}) exceed this room’s capacity (${hold}). Add another room in Guests, or pick a setup that fits, before continuing.`;
      showToast(message, false);
      return;
    }

    clearCart();
    const result = addToCart(roomType, qty);
    if (!result.ok) {
      showToast(result.message, false);
      return;
    }

    fillBookRoom(roomType);
    preferredRoomType = roomType;
    applyDateLimits(modalCheckIn, modalCheckOut);
    updateBookPartySummary();
    setPaymentOption('Full');
    refreshStayTimeOptions(true);
    updateLeadHint(modalCheckIn, modalLeadHint, bookModalForm);
    syncModalQtyMax();
    updatePaymentPreview();
    openModal(bookModal);

    if (qty < requestedQty) {
      showToast(
        `${qty} × ${roomType} added (only ${meta.available} available). You can still complete the booking.`,
        true
      );
    } else {
      showToast(`${qty} × ${roomType} ready in your booking.`, true);
    }
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-modal]')) {
      closeAllModals();
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
      selectOfferAndOpenBooking(offerSelect.getAttribute('data-offer-select') || '');
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
      fillDetails(roomName);
      openModal(detailsModal);
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
    openOfferStep();
  });

  document.getElementById('offerBackToGuestsBtn')?.addEventListener('click', () => {
    openGuestsStep(preferredRoomType);
  });

  syncGuestFlowSummary();
  renderGuestsRooms();

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
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
    const result = validateBookRequiredFields();
    if (result.ok) setMessage(formMsg, '', false);
    else setMessage(formMsg, result.message, false);
  }

  modalCheckIn?.addEventListener('change', () => {
    updateLeadHint(modalCheckIn, modalLeadHint, bookModalForm);
    refreshLiveAvailability(modalCheckIn.value, modalCheckOut?.value || '');
    renderCart();
    refreshRequiredErrorsIfShown();
  });
  modalCheckOut?.addEventListener('change', () => {
    refreshLiveAvailability(modalCheckIn?.value || '', modalCheckOut.value);
    renderCart();
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
  refreshStayTimeOptions(true);

  document.querySelectorAll('[data-payment-option]').forEach((button) => {
    button.addEventListener('click', () => {
      setPaymentOption(button.getAttribute('data-payment-option') || '');
    });
  });

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
    const max = meta ? Math.max(1, remainingCapacity(meta.roomType, meta.available) || meta.available) : 12;
    modalRoomQty.max = String(max);
    if (Number(modalRoomQty.value || 1) > max) modalRoomQty.value = String(max);
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
    const btn = event.target.closest('[data-remove-room]');
    if (!btn) return;
    removeFromCart(btn.getAttribute('data-remove-room') || '');
    showToast('Room removed from booking.');
    syncModalQtyMax();
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
      setMessage(bookPageMsg, 'Enter a valid email address.', false);
      return;
    }
    if (!isValidPhone(phone)) {
      setMessage(bookPageMsg, 'Enter a valid phone number.', false);
      return;
    }
    const dateError = validateDates(checkIn, checkOut);
    if (dateError) {
      setMessage(bookPageMsg, dateError, false);
      showToast(dateError);
      return;
    }
    if (!roomType) {
      setMessage(bookPageMsg, 'Please select a room.', false);
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
    const name = document.getElementById('guestName')?.value.trim() || '';
    const email = document.getElementById('guestEmail')?.value.trim() || '';
    const phone = document.getElementById('guestPhone')?.value.trim() || '';
    const checkIn = modalCheckIn?.value || '';
    const checkOut = document.getElementById('modalCheckOut')?.value || '';

    const required = validateBookRequiredFields();
    if (!required.ok) {
      setMessage(bookMsg, required.message, false);
      return;
    }
    if (!bookingCart.length) {
      setMessage(bookMsg, 'Add at least one room to your booking.', false);
      return;
    }
    if (isGuestCapacityExceeded()) {
      updateBookRoomsCapacityWarning();
      const guestCount = guestPartyCount();
      const hold = cartGuestHoldCapacity();
      const message = `Guests (${guestCount}) exceed this room’s capacity (${hold}). Add more rooms or reduce guests to continue.`;
      setMessage(bookMsg, message, false);
      document.getElementById('bookRoomsSection')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (!acceptStayTerms?.checked) {
      setMessage(bookMsg, 'Please read and accept the Terms of Stay before submitting.', false);
      acceptStayTerms?.focus();
      return;
    }
    const paymentOption = selectedPaymentOption();
    if (paymentOption !== 'Full' && paymentOption !== 'Half') {
      setMessage(bookMsg, 'Choose full payment or half payment.', false);
      document.querySelector('[data-payment-option]')?.focus();
      return;
    }

    clearBookRequiredErrors();
    const submitButton = document.getElementById('bookModalSubmit');
    const token = bookModalForm.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.originalText = submitButton.textContent || '';
      submitButton.textContent = 'Sending…';
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
          checkIn,
          checkOut,
          paymentOption,
          acceptTerms: true,
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
            ? 'Too many booking attempts. Please wait a minute and try again.'
            : 'We could not submit your booking. Please try again.')
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
      showSuccess(
        {
          kind,
          label: kind === 'reservation' ? 'Reservation' : 'Booking',
        },
        `Thanks, ${name}. Your ${kind} request ${payload.reference} is Pending review for ${roomSummary} (${checkIn} ${checkInTime} → ${checkOut} ${checkOutTime}). Amount due now: ${formatMoney(dueNow)} (no online charge yet).${feeNote} We will contact you by phone or email to confirm your stay.`
      );
      bookModalForm.reset();
      clearBookRequiredErrors();
      clearCart();
      setPaymentOption('Full');
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

    const cards = () => Array.from(track.querySelectorAll('.guest-room, .guest-gallery-room'));

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
      const scrollable = maxScroll > 2;
      root.classList.toggle('is-scrollable', scrollable);
      prevBtn.hidden = !scrollable;
      nextBtn.hidden = !scrollable;
      // Keep both controls enabled while scrollable so the carousel can loop.
      prevBtn.disabled = !scrollable;
      nextBtn.disabled = !scrollable;
    }

    function scrollByDir(dir) {
      const maxScroll = maxScrollLeft();
      if (maxScroll <= 2) return;

      const atStart = track.scrollLeft <= 2;
      const atEnd = track.scrollLeft >= maxScroll - 2;

      if (dir > 0 && atEnd) {
        track.scrollTo({ left: 0, behavior: 'smooth' });
        return;
      }

      if (dir < 0 && atStart) {
        track.scrollTo({ left: maxScroll, behavior: 'smooth' });
        return;
      }

      track.scrollBy({ left: dir * stepSize(), behavior: 'smooth' });
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

    const countEl = pager.querySelector('[data-feature-count]');
    const prevBtn = pager.querySelector('[data-feature-prev]');
    const nextBtn = pager.querySelector('[data-feature-next]');

    function show(i) {
      index = ((i % photos.length) + photos.length) % photos.length;
      img.src = photos[index];
      if (countEl) countEl.textContent = `${index + 1} / ${photos.length}`;
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

  document.querySelectorAll('.guest-room-feature[data-images]').forEach(initFeatureMediaPager);
})();
