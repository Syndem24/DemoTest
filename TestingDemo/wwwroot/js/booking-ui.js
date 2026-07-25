(() => {
  const MIN_LEAD_HOURS_DEFAULT = 24;
  const toastEl = document.getElementById('guestToast');
  const detailsModal = document.getElementById('detailsModal');
  const bookModal = document.getElementById('bookModal');
  const successModal = document.getElementById('successModal');
  const guestNav = document.getElementById('guestNav');
  const guestNavToggle = document.getElementById('guestNavToggle');
  const allModals = [detailsModal, bookModal, successModal];
  let toastTimer = null;

  function setNavOpen(open) {
    if (!guestNav || !guestNavToggle) return;
    guestNav.classList.toggle('is-open', open);
    guestNavToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    guestNavToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  guestNavToggle?.addEventListener('click', () => {
    setNavOpen(!guestNav.classList.contains('is-open'));
  });

  guestNav?.querySelectorAll('.guest-nav-links a').forEach((link) => {
    link.addEventListener('click', () => setNavOpen(false));
  });

  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width: 720px)').matches) {
      setNavOpen(false);
    }
  });

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
    closeAllModals();
    modal.hidden = false;
    document.body.classList.add('guest-modal-open');
  }

  function closeAllModals() {
    allModals.forEach((modal) => {
      if (modal) modal.hidden = true;
    });
    document.body.classList.remove('guest-modal-open');
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

  function buildInclusionGroups(selectedItems, customCategories) {
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

    const customByName = new Map();
    for (const cat of customCategories || []) {
      const name = (cat.name || cat.Name || '').trim();
      if (!name || name.toLowerCase() === 'other') continue;
      const key = name.toLowerCase();
      const rawItems = cat.items || cat.Items || [];
      if (!customByName.has(key)) {
        customByName.set(key, { name, items: [] });
      }
      const bucket = customByName.get(key);
      for (const item of rawItems) {
        const trimmed = String(item || '').trim();
        if (!trimmed) continue;
        if (!bucket.items.some((i) => i.toLowerCase() === trimmed.toLowerCase())) {
          bucket.items.push(trimmed);
        }
      }
    }

    for (const cat of INCLUSION_CATALOG) {
      const extras = customByName.get(cat.name.toLowerCase())?.items || [];
      customByName.delete(cat.name.toLowerCase());
      const items = takeItems([...cat.items, ...extras]);
      if (items.length) groups.push({ name: cat.name, items });
    }

    for (const cat of customByName.values()) {
      const items = takeItems(cat.items);
      if (items.length) groups.push({ name: cat.name, items });
    }

    // Orphans (no saved category) land in Custom — never "Other".
    const leftovers = selected.filter((i) => !used.has(i.toLowerCase()));
    if (leftovers.length) {
      const existing = groups.find((g) => g.name.toLowerCase() === 'custom');
      if (existing) existing.items.push(...leftovers);
      else groups.push({ name: 'Custom', items: leftovers });
    }

    return groups;
  }

  function renderInclusionGroups(container, selectedItems, customCategories) {
    if (!container) return;
    container.innerHTML = '';
    const groups = buildInclusionGroups(selectedItems, customCategories);

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
    const isAvailable = (card.dataset.status || 'Available').toLowerCase() === 'available';

    if (title) title.textContent = roomTypeStr;
    if (price) price.textContent = formattedPrice;
    if (occupancy) occupancy.textContent = `Up to ${card.dataset.occupancy || '—'} guests`;
    if (beds) beds.textContent = `${card.dataset.beds || '—'} bed(s)`;
    if (description) description.textContent = fullDesc || 'No description provided.';
    if (bookBtn) bookBtn.dataset.fillRoom = roomTypeStr;

    if (statusPill) {
      statusPill.textContent = isAvailable ? 'Available' : 'Reserved';
      statusPill.className = `guest-pill ${isAvailable ? 'is-available' : 'is-unavailable'}`;
    }

    // Reset accordions: all closed by default.
    detailsModal.querySelectorAll('.guest-acc').forEach((panel) => {
      panel.removeAttribute('open');
    });

    const inclusions = parseJsonArray(card.dataset.inclusions);
    let categories = [];
    try {
      const parsed = JSON.parse(card.dataset.categories || '[]');
      categories = Array.isArray(parsed) ? parsed : [];
    } catch {
      categories = [];
    }
    renderInclusionGroups(inclusionsEl, inclusions, categories);

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

  /** @type {{ roomType: string, qty: number, price: number, available: number }[]} */
  let bookingCart = [];

  function getRoomMeta(roomType) {
    if (!roomType) return null;
    const modalSelect = document.getElementById('modalRoomType');
    const opt = modalSelect
      ? Array.from(modalSelect.options).find((o) => o.value === roomType)
      : null;
    if (opt?.value) {
      return {
        roomType: opt.value,
        available: Number(opt.dataset.available || 0),
        price: Number(opt.dataset.price || 0),
      };
    }
    const card = findRoomCard(roomType);
    if (!card) return null;
    return {
      roomType: card.dataset.roomType || roomType,
      available: Number(card.dataset.available || 0),
      price: Number(card.dataset.price || 0),
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

  function syncCartSubmitState() {
    const submitBtn = document.getElementById('bookModalSubmit');
    const status = document.getElementById('bookingCartStatus');
    const summary = document.getElementById('bookingCartSummary');
    const summaryLabel = document.getElementById('bookingCartSummaryLabel');
    const summaryTotal = document.getElementById('bookingCartSummaryTotal');
    const totalRooms = bookingCart.reduce((sum, line) => sum + line.qty, 0);
    const nightTotal = bookingCart.reduce((sum, line) => sum + line.qty * line.price, 0);
    const hasRooms = bookingCart.length > 0;

    if (submitBtn) submitBtn.disabled = !hasRooms;

    if (status) {
      status.classList.toggle('is-empty', !hasRooms);
      status.classList.toggle('is-ready', hasRooms);
      status.textContent = hasRooms
        ? `${totalRooms} room${totalRooms === 1 ? '' : 's'} ready`
        : 'Cart empty';
    }

    if (summary) summary.hidden = !hasRooms;
    if (summaryLabel) {
      summaryLabel.textContent = `${totalRooms} room${totalRooms === 1 ? '' : 's'} selected`;
    }
    if (summaryTotal) summaryTotal.textContent = `${formatMoney(nightTotal)} / night`;
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

    bookingCart.forEach((line) => {
      const atCap = line.qty >= line.available;
      const lineTotal = line.qty * line.price;
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
            <span class="guest-cart-rate">${line.qty} × ${formatMoney(line.price)}</span>
            <span class="guest-cart-line-total">${formatMoney(lineTotal)} / night</span>
            <span class="guest-cart-avail ${atCap ? 'is-max' : 'is-ok'}">${atCap ? `Max ${line.available}` : `${line.available} available`}</span>
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
      return { ok: false, message: `${meta.roomType} has no rooms available.` };
    }

    const addQty = Math.max(1, Number(qty) || 1);
    const existing = bookingCart.find((l) => cartLineKey(l.roomType) === cartLineKey(meta.roomType));
    const currentQty = existing ? existing.qty : 0;
    const nextQty = currentQty + addQty;

    if (nextQty > meta.available) {
      const left = remainingCapacity(meta.roomType, meta.available);
      return {
        ok: false,
        message: left < 1
          ? `${meta.roomType} is already at the max available (${meta.available}).`
          : `Only ${left} more ${meta.roomType} room(s) can be added.`,
      };
    }

    if (existing) {
      existing.qty = nextQty;
      existing.price = meta.price;
      existing.available = meta.available;
    } else {
      bookingCart.push({
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

  function wireDateLimits(checkInEl, checkOutEl) {
    if (!checkInEl || !checkOutEl || checkInEl.dataset.dateLimitsWired === '1') {
      applyDateLimits(checkInEl, checkOutEl);
      return;
    }

    checkInEl.dataset.dateLimitsWired = '1';
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

  /** Ahead of min lead time => reservation; within lead time => booking. UI-only. */
  function classifyStay(checkIn, minLeadHours) {
    if (!checkIn) return null;
    const start = new Date(`${checkIn}T15:00:00`);
    if (Number.isNaN(start.getTime())) return null;
    const hoursUntil = (start.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil > minLeadHours) {
      return {
        kind: 'reservation',
        label: 'Reservation',
        hint: `Check-in is more than ${minLeadHours} hours away — this booking will be held as a reservation.`,
        toast: 'Reservation preview ready.',
      };
    }
    return {
      kind: 'booking',
      label: 'Booking',
      hint: `Check-in is within ${minLeadHours} hours — this stays a standard booking.`,
      toast: 'Booking preview ready.',
    };
  }

  function updateLeadHint(checkInInput, hintEl, form) {
    if (!hintEl) return;
    const minLead = Number(form?.dataset.minLeadHours || MIN_LEAD_HOURS_DEFAULT);
    const result = classifyStay(checkInInput?.value || '', minLead);
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
    if (successEyebrow) successEyebrow.textContent = classification.label;
    if (successTitle) {
      successTitle.textContent =
        classification.kind === 'reservation' ? 'Reservation preview' : 'Booking preview';
    }
    if (successMessage) successMessage.textContent = message;
    openModal(successModal);
    showToast(classification.toast, true);
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-modal]')) {
      closeAllModals();
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

    if (kind === 'book') {
      clearCart();
      fillBookRoom(roomName);
      applyDateLimits(modalCheckIn, modalCheckOut);
      openModal(bookModal);
      updateLeadHint(modalCheckIn, modalLeadHint, bookModalForm);
      syncModalQtyMax();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAllModals();
      return;
    }

    const roomCard = event.target.closest?.('.guest-room[data-guest-modal="details"]');
    if (roomCard && (event.key === 'Enter' || event.key === ' ')) {
      if (event.target.closest('button, a, input, select, textarea')) return;
      event.preventDefault();
      roomCard.click();
      return;
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
  modalCheckIn?.addEventListener('change', () => {
    updateLeadHint(modalCheckIn, modalLeadHint, bookModalForm);
  });

  const bookPageMsg = document.getElementById('bookPageFormMessage');
  const clearBookForm = document.getElementById('clearBookForm');
  const bookMsg = document.getElementById('bookFormMessage');
  const addRoomToCartBtn = document.getElementById('addRoomToCartBtn');
  const modalRoomQty = document.getElementById('modalRoomQty');
  const modalRoomType = document.getElementById('modalRoomType');

  function syncModalQtyMax() {
    if (!modalRoomQty || !modalRoomType) return;
    const meta = getRoomMeta(modalRoomType.value);
    const max = meta ? Math.max(1, remainingCapacity(meta.roomType, meta.available) || meta.available) : 12;
    modalRoomQty.max = String(max);
    if (Number(modalRoomQty.value || 1) > max) modalRoomQty.value = String(max);
  }

  modalRoomType?.addEventListener('change', syncModalQtyMax);

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

  bookModalForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = document.getElementById('guestName')?.value.trim() || '';
    const email = document.getElementById('guestEmail')?.value.trim() || '';
    const phone = document.getElementById('guestPhone')?.value.trim() || '';
    const checkIn = modalCheckIn?.value || '';
    const checkOut = document.getElementById('modalCheckOut')?.value || '';
    const minLead = Number(bookModalForm.dataset.minLeadHours || MIN_LEAD_HOURS_DEFAULT);

    if (!name || !email || !phone) {
      setMessage(bookMsg, 'Name, email, and phone are required.', false);
      return;
    }
    if (!email.includes('@')) {
      setMessage(bookMsg, 'Enter a valid email address.', false);
      return;
    }
    if (!isValidPhone(phone)) {
      setMessage(bookMsg, 'Enter a valid phone number.', false);
      return;
    }
    const dateError = validateDates(checkIn, checkOut);
    if (dateError) {
      setMessage(bookMsg, dateError, false);
      return;
    }
    if (!bookingCart.length) {
      setMessage(bookMsg, 'Add at least one room to your booking.', false);
      return;
    }

    const roomSummary = bookingCart
      .map((line) => `${line.qty}× ${line.roomType}`)
      .join(', ');
    const classification = classifyStay(checkIn, minLead);
    setMessage(bookMsg, '', false);
    showSuccess(
      classification,
      `Thanks, ${name}. ${classification.label} for ${roomSummary} (${checkIn} → ${checkOut}). Phone: ${phone}. UI preview only — saving comes later.`
    );
    bookModalForm.reset();
    clearCart();
    applyDateLimits(modalCheckIn, modalCheckOut);
    updateLeadHint(modalCheckIn, modalLeadHint, bookModalForm);
    syncModalQtyMax();
  });

  renderCart();
  syncModalQtyMax();
})();
