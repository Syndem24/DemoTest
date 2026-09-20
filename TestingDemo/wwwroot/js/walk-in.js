(() => {
  const openBtn = document.querySelector('[data-walkin-open]');
  const guestsModal = document.getElementById('walkInGuestsModal');
  const bookModal = document.getElementById('walkInBookModal');
  const successModal = document.getElementById('walkInSuccessModal');
  const sourceModal = document.getElementById('walkInSourceModal');
  const sourceNextBtn = document.getElementById('walkInSourceNextBtn');
  const sourceSelect = document.getElementById('walkInSourceSelect');
  if (!guestsModal || !bookModal) return;

  const guestsList = document.getElementById('walkInGuestsRoomList');
  const guestsHint = document.getElementById('walkInGuestsHint');
  const guestsCapacity = document.getElementById('walkInGuestsCapacityBanner');
  const guestsSubmitBtn = document.getElementById('walkInGuestsSubmitBtn');
  const guestsAddRoomBtn = document.getElementById('walkInGuestsAddRoomBtn');
  const bookForm = document.getElementById('walkInBookForm');
  const partySummary = document.getElementById('walkInBookPartySummary');
  const formMessage = document.getElementById('walkInFormMessage');
  const checkInDate = document.getElementById('walkInCheckInDate');
  const checkOutDate = document.getElementById('walkInCheckOutDate');
  const checkInTime = document.getElementById('walkInCheckInTime');
  const checkOutTime = document.getElementById('walkInCheckOutTime');
  const timeFeesHint = document.getElementById('walkInTimeFeesHint');
  const extraPersonWrap = document.getElementById('walkInExtraPersonWrap');
  const extraPersonInput = document.getElementById('walkInExtraPerson');
  const capacityWarn = document.getElementById('walkInCapacityWarn');
  const backBtn = document.getElementById('walkInWizardBackBtn');
  const nextBtn = document.getElementById('walkInWizardNextBtn');
  const submitBtn = document.getElementById('walkInSubmitBtn');
  const roomTypePicker = document.getElementById('walkInRoomTypePicker');
  const typesLede = document.getElementById('walkInTypesLede');
  const typeSelectionSummary = document.getElementById('walkInTypeSelectionSummary');
  const typeSelectionProgress = document.getElementById('walkInTypeSelectionProgress');
  const selectionDialog = document.getElementById('walkInSelectionDialog');
  const selectionGroups = document.getElementById('walkInSelectionGroups');
  const selectionTypes = document.getElementById('walkInSelectionTypes');
  const selectionCount = document.getElementById('walkInSelectionCount');
  const selectionBarFill = document.getElementById('walkInSelectionBarFill');
  const quantityDialog = document.getElementById('walkInTypeQuantityDialog');
  const quantityForm = document.getElementById('walkInTypeQuantityForm');
  const quantityInput = document.getElementById('walkInTypeQuantity');
  const quantityTitle = document.getElementById('walkInTypeQuantityTitle');
  const quantityHint = document.getElementById('walkInTypeQuantityHint');
  const quantityError = document.getElementById('walkInTypeQuantityError');
  const quantityConfirm = document.getElementById('walkInTypeQuantityConfirm');
  let quantityTypeId = 0;
  let quantityMode = 'add';
  const stepTabs = Array.from(document.querySelectorAll('[data-walkin-step-tab]'));

  const token = document.querySelector(
    '#adminAntiForgery input[name="__RequestVerificationToken"]'
  )?.value
    || bookForm?.querySelector('input[name="__RequestVerificationToken"]')?.value
    || '';

  const BASE_GUESTS_PER_ROOM = 2;
  const MAX_GUESTS_PER_ROOM = 3;
  const MAX_EXTRA_PERSONS_PER_ROOM = 1;
  const MAX_CHILD_AGE = 12;
  const MAX_GUEST_ROOMS = 8;
  const EARLY_CHECKIN_START_TIME = '05:00';
  const EARLY_CHECKIN_END_TIME = '11:00';
  const DEFAULT_CHECKIN_TIME = '14:00';
  const DEFAULT_CHECKOUT_TIME = '12:00';
  const EARLY_FEE = 500;
  const LATE_FEE_PER_HOUR = 100;
  const MAX_LATE_HOURS = 3;
  const FREE_CHECKIN_TIMES = [
    '14:00', '15:00', '15:30', '16:00', '16:30',
    '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
    '20:00', '20:30', '21:00', '21:30', '22:00', '22:30',
    '23:00', '23:30',
  ];
  const STEPS = ['guest', 'dates', 'types'];

  /** @type {{ adults: number, children: number, childAges: (number|null)[] }[]} */
  let guestRooms = [{ adults: 2, children: 0, childAges: [] }];
  /** @type {Array<{id:number,roomTypeId:number,roomNumber:string,pricePerNight:number,status:string,maxOccupancy:number}>} */
  let rooms = [];
  /** @type {Array<{roomTypeId:number,name:string,pricePerNight:number,maxOccupancy:number}>} */
  let roomTypes = [];
  /** @type {Map<number, {id:number, promoPrice:number, regularPrice:number, title:string, kind:string, minNights:number|null}>} */
  let walkInOffersByType = new Map();
  /** @type {Array<{id:number, roomTypeId:number, promoPrice:number, regularPrice:number, title:string, kind:string, minNights:number|null}>} */
  let walkInOfferCandidates = [];
  /** @type {Map<number, number>} */
  let remainingByType = new Map();
  /** @type {Map<number, string[]>} */
  let soldOutByType = new Map();
  let wizardStep = 'guest';
  /** @type {number[]} */
  let walkInTypeSelections = [];
  let lastFocused = null;
  let guestsHintTimer = null;
  let inventoryReady = false;
  let inventoryFailed = false;

  function money(value) {
    return `₱${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function isThirdPartyChannel() {
    const channel = String(document.getElementById('walkInChannel')?.value || '');
    // Named OTAs: always excluded from promos.
    // OtherThirdParty: treated as offer-eligible on the UI side (server excludes it when no offer is selected).
    return channel === 'Agoda' || channel === 'Expedia' || channel === 'RedDoorz';
  }

  function syncWalkInTypeSelectionLength() {
    const count = roomsNeeded();
    while (walkInTypeSelections.length < count) walkInTypeSelections.push(0);
    walkInTypeSelections.length = count;
  }

  function getWalkInTypeSelections() {
    return walkInTypeSelections.slice(0, roomsNeeded());
  }

  function allWalkInTypesSelected() {
    const needed = roomsNeeded();
    const selections = getWalkInTypeSelections();
    return selections.length >= needed && selections.every((id) => id > 0);
  }

  function clearUnavailableTypeSelections() {
    const count = roomsNeeded();
    for (let i = 0; i < count; i += 1) {
      const current = Number(walkInTypeSelections[i] || 0);
      if (current > 0 && typeRemaining(current) < 1) {
        walkInTypeSelections[i] = 0;
      }
    }
  }

  function walkInQuantityLimit(typeId) {
    const selections = getWalkInTypeSelections();
    const existing = selections.filter((id) => id === typeId).length;
    const slots = [];
    for (let index = 0; index < roomsNeeded(); index += 1) {
      const room = guestRooms[index];
      if (selections[index] || !room) continue;
      const guests = (Number(room.adults) || 0) + (Number(room.children) || 0);
      if (guests <= effectiveRoomTypeCapacity(typeId)) slots.push(index);
    }
    const available = Math.max(0, Math.floor(typeRemaining(typeId)));
    return { existing, slots, maximum: Math.min(existing + slots.length, available) };
  }

  function commitWalkInTypeSelections(selections) {
    walkInTypeSelections = selections;
    renderWalkInTypePicker();
    refreshTotals();
    syncWalkInTypesStepState();
  }

  function setWalkInTypeQuantity(typeId, quantity) {
    if (!roomTypes.some((type) => type.roomTypeId === typeId)) return false;
    syncWalkInTypeSelectionLength();
    const { existing, slots, maximum } = walkInQuantityLimit(typeId);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > maximum) return false;
    const selections = getWalkInTypeSelections();
    let remove = Math.max(0, existing - quantity);
    for (let index = selections.length - 1; index >= 0 && remove > 0; index -= 1) {
      if (selections[index] !== typeId) continue;
      selections[index] = 0;
      remove -= 1;
    }
    slots.slice(0, Math.max(0, quantity - existing)).forEach((index) => {
      selections[index] = typeId;
    });
    commitWalkInTypeSelections(selections);
    return true;
  }

  function focusWalkInType(typeId) {
    if (selectionDialog?.open) {
      const inDialog =
        selectionDialog.querySelector(`[data-walkin-edit-type="${typeId}"]`)
        || selectionDialog.querySelector('[data-walkin-remove-slot], [data-walkin-edit-type], [data-walkin-selection-close]');
      (inDialog || selectionDialog.querySelector('.admin-walkin-quantity-close'))?.focus({ preventScroll: true });
      return;
    }
    const card = roomTypePicker?.querySelector(`[data-walkin-type-card="${typeId}"]`);
    const target = card?.querySelector('button:not(:disabled)') || backBtn;
    target?.focus({ preventScroll: true });
  }

  function closeWalkInQuantity() {
    if (!quantityDialog?.open) return;
    const typeId = quantityTypeId;
    quantityDialog.close();
    quantityTypeId = 0;
    focusWalkInType(typeId);
  }

  function syncWalkInQuantityControls() {
    if (!quantityInput || !quantityTypeId) return;
    const { existing, maximum } = walkInQuantityLimit(quantityTypeId);
    const min = quantityMode === 'add' ? 1 : 0;
    const max = quantityMode === 'add' ? Math.max(0, maximum - existing) : maximum;
    quantityInput.min = String(min);
    quantityInput.max = String(max);
    const value = Number(quantityInput.value);
    const valid = quantityInput.value.trim() !== '' && Number.isInteger(value) && value >= min && value <= max;
    quantityConfirm.disabled = !valid;
    quantityDialog.querySelector('[data-walkin-quantity-minus]').disabled = value <= min;
    quantityDialog.querySelector('[data-walkin-quantity-plus]').disabled = value >= max;
    quantityHint.textContent = `${roomsNeeded()} rooms requested · ${getWalkInTypeSelections().filter(Boolean).length} selected. `
      + (quantityMode === 'add'
        ? `You can add up to ${max} more of this type for the unselected guest rooms.`
        : `Set the total for this type (0–${max}). Use 0 to remove it from this draft.`);
  }

  function openWalkInQuantity(typeId, mode) {
    const type = roomTypes.find((item) => item.roomTypeId === typeId);
    if (!type || !quantityDialog || !quantityInput) return;
    quantityTypeId = typeId;
    quantityMode = mode;
    const { existing, maximum } = walkInQuantityLimit(typeId);
    quantityTitle.textContent = mode === 'add' ? `How many ${type.name} rooms?` : `Edit ${type.name} quantity`;
    quantityInput.value = String(mode === 'add' ? 1 : Math.min(existing, maximum));
    const confirmLabel = quantityConfirm.querySelector?.('[data-quantity-label]') || quantityConfirm;
    confirmLabel.textContent = mode === 'add' ? 'Add rooms' : 'Save quantity';
    quantityError.hidden = true;
    quantityInput.removeAttribute('aria-invalid');
    syncWalkInQuantityControls();
    quantityDialog.showModal();
    quantityInput.focus();
    quantityInput.select();
  }

  function openWalkInSelection() {
    if (!selectionDialog || selectionDialog.open) return;
    selectionDialog.showModal();
    selectionDialog.querySelector('[data-walkin-selection-close]')?.focus({ preventScroll: true });
  }

  function closeWalkInSelection(refocus = true) {
    if (!selectionDialog?.open) return;
    selectionDialog.close();
    if (refocus) typeSelectionProgress?.focus({ preventScroll: true });
  }

  function walkInDiscountPercent(regular, promo) {
    const r = Number(regular || 0);
    const p = Number(promo || 0);
    if (!(r > p) || !(p > 0)) return 0;
    return Math.max(1, Math.round((1 - p / r) * 100));
  }

  function walkInLimitedOfferForType(roomTypeId) {
    if (isThirdPartyChannel()) return null;
    return walkInOfferCandidates.find(
      (offer) =>
        Number(offer.roomTypeId) === Number(roomTypeId)
        && offer.kind === 'LimitedTime'
        && Number(offer.promoPrice) > 0
    ) || null;
  }

  function walkInStayLongerOffersForType(roomTypeId) {
    if (isThirdPartyChannel()) return [];
    const nights = nightCount();
    return walkInOfferCandidates
      .filter(
        (offer) =>
          Number(offer.roomTypeId) === Number(roomTypeId)
          && offer.kind === 'StayLongerSaveMore'
          && Number(offer.promoPrice) > 0
          && Number(offer.minNights || 0) >= 2
      )
      .sort((a, b) => Number(a.promoPrice) - Number(b.promoPrice));
  }

  function walkInOfferRatePriceHtml(effective, regular, showCompare) {
    const pct = showCompare ? walkInDiscountPercent(regular, effective) : 0;
    if (showCompare) {
      return `
        <span class="guest-offer-price-compare">
          ${pct > 0 ? `<span class="guest-room-discount-badge">-${pct}%</span>` : ''}
          <s class="guest-offer-price-was">${money(regular)}</s>
        </span>
        <strong class="guest-offer-price is-promo">${money(effective)}</strong>
      `;
    }
    return `<strong class="guest-offer-price">${money(effective)}</strong>`;
  }

  function renderWalkInStayLongerRows(item) {
    const offers = walkInStayLongerOffersForType(item.roomTypeId);
    if (!offers.length) return '';

    const nights = nightCount();
    const rows = offers
      .map((offer) => {
        const promoAmt = Number(offer.promoPrice || 0);
        const regularAmt = Number(offer.regularPrice || item.pricePerNight || 0);
        const pct = walkInDiscountPercent(regularAmt, promoAmt);
        const minNights = Number(offer.minNights || 0);
        const eligible = nights >= minNights;
        const title = escapeHtml(offer.title || 'Stay longer, save more');
        return `
          <div class="guest-offer-rate is-special${eligible ? ' is-eligible' : ''}">
            <div class="guest-offer-rate-copy">
              <strong class="guest-offer-rate-name">${title}</strong>
              <p class="guest-offer-rate-kind">Stay longer, save more · ${minNights}+ nights</p>
              <ul class="guest-offer-rate-includes">
                <li>${minNights}+ nights required</li>
                <li>Cash only</li>
                ${eligible ? '<li>Eligible for your stay dates</li>' : `<li>Need ${minNights}+ nights (you have ${nights})</li>`}
              </ul>
            </div>
            <div class="guest-offer-rate-price">
              <span class="guest-offer-price-label">Price for 1 night</span>
              ${walkInOfferRatePriceHtml(promoAmt, regularAmt, regularAmt > promoAmt)}
              <span class="guest-offer-price-note">Cash only · / night</span>
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <div class="guest-offer-specials">
        <h4 class="guest-offer-specials-title">Special offers</h4>
        ${rows}
      </div>
    `;
  }

  function buildWalkInOfferTypeItems() {
    const selectedIds = new Set(getWalkInTypeSelections().filter(Boolean));
    return roomTypes
      .map((type) => ({
        ...type,
        available: typeRemaining(type.roomTypeId),
      }))
      .filter((type) => type.available > 0 || selectedIds.has(type.roomTypeId))
      .sort((a, b) => {
        if (a.available <= 0 && b.available > 0) return 1;
        if (b.available <= 0 && a.available > 0) return -1;
        return a.pricePerNight - b.pricePerNight;
      });
  }

  function renderWalkInTypeCard(item) {
    const base = Number(item.pricePerNight || 0);
    const limited = walkInLimitedOfferForType(item.roomTypeId);
    const activeOffer = walkInOfferForType(item.roomTypeId);
    const effective = effectiveNightlyRate(item.roomTypeId, base);
    const regular = limited
      ? Math.max(base, Number(limited.regularPrice || 0))
      : base;
    const showCompare = Boolean(activeOffer && effective < regular);
    const soldOut = item.available < 1;
    const { existing: quantity, maximum } = walkInQuantityLimit(item.roomTypeId);
    const isSelected = quantity > 0;
    const canAdd = roomsNeeded() === 1 ? !soldOut && !isSelected : maximum > quantity;
    const image = item.images?.[0] || '';
    const safeName = escapeHtml(item.name);
    const safeImage = escapeHtml(image);
    const beds = Number(item.bedCount || 0);
    const bedsLabel = beds === 1 ? `${beds} bed` : `${beds || '—'} beds`;
    const inclusions = (item.inclusions || []).slice(0, 3);
    const tags = inclusions.map((inc) => `<li>${escapeHtml(inc)}</li>`).join('');
    const desc = String(item.description || '').trim();
    const shortDesc =
      desc.length > 120 ? `${desc.slice(0, 120).trimEnd()}…` : desc;
    const limitedTitle = limited?.title ? escapeHtml(limited.title) : 'Limited time offer';
    const bestRateLabel = limited ? limitedTitle : 'Best available rate';
    const bestRateKind = limited
      ? 'Limited time offer · Cash only'
      : activeOffer?.kind === 'StayLongerSaveMore'
        ? `Stay longer rate · ${activeOffer.minNights || 2}+ nights`
        : 'Room only';
    const stayLongerSection = renderWalkInStayLongerRows(item);
    const promoBanner =
      limited && !isThirdPartyChannel()
        ? `<span class="guest-offer-promo-flag">Special offer</span>`
        : '';
    const selectedBadge = isSelected
      ? `<span class="guest-offer-selected-badge" data-walkin-selected-badge>${quantity} selected</span>`
      : '';
    const selectLabel = soldOut ? 'Fully booked' : 'Select room';
    const pickIcon = soldOut
      ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m5.5 5.5 13 13"/></svg>'
      : '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
    const editIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
    const trashIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

    return `
      <article
        class="guest-offer-card admin-walkin-type-card${isSelected ? ' is-selected' : ''}${soldOut ? ' is-sold-out' : ''}${limited ? ' has-limited-offer' : ''}"
        data-walkin-type-card="${item.roomTypeId}">
        ${promoBanner}
        <div class="guest-offer-card-top">
          <div class="guest-offer-media">
            ${
              image
                ? `<img src="${safeImage}" alt="" loading="lazy" />`
                : `<div class="guest-room-placeholder" aria-hidden="true"><span>${(item.name || 'R').trim().charAt(0).toUpperCase()}</span></div>`
            }
            <span class="guest-offer-availability${soldOut ? ' is-sold-out' : ''}">${
              soldOut ? 'Fully booked' : `${item.available} available`
            }</span>
            ${selectedBadge}
          </div>
          <div class="guest-offer-copy">
            <p class="guest-eyebrow">Guest room</p>
            <h3>${safeName}</h3>
            <ul class="guest-offer-meta">
              <li>Up to ${item.maxOccupancy} guests / room</li>
              <li>${bedsLabel}</li>
            </ul>
            ${tags ? `<ul class="guest-offer-tags">${tags}</ul>` : ''}
            ${shortDesc ? `<p class="guest-offer-desc">${escapeHtml(shortDesc)}</p>` : ''}
          </div>
        </div>
        <div class="guest-offer-rates">
          <div class="guest-offer-rate is-best">
            <div class="guest-offer-rate-copy">
              <strong class="guest-offer-rate-name">${bestRateLabel}</strong>
              <p class="guest-offer-rate-kind">${bestRateKind}</p>
              <ul class="guest-offer-rate-includes">
                <li>Room only</li>
                <li>Meals not included</li>
                ${limited ? '<li>Cash only when promo applies</li>' : ''}
              </ul>
            </div>
            <div class="guest-offer-rate-price">
              <span class="guest-offer-price-label">Price for 1 night</span>
              ${walkInOfferRatePriceHtml(effective, regular, showCompare)}
              ${limited ? '<span class="guest-offer-price-note">Cash only</span>' : ''}
              <button
                type="button"
                class="guest-btn guest-btn-primary guest-offer-select admin-walkin-pick-type"
                data-walkin-pick-type="${item.roomTypeId}"
                ${roomsNeeded() > 1 ? 'aria-haspopup="dialog"' : ''}
                ${canAdd ? '' : 'disabled'}>
                ${pickIcon}<span>${selectLabel}</span>
              </button>
              ${isSelected ? `
                <div class="admin-walkin-selection-actions">
                  <button type="button" data-walkin-edit-type="${item.roomTypeId}" aria-haspopup="dialog">${editIcon}<span>Edit quantity (${quantity})</span></button>
                  <button type="button" data-walkin-remove-type="${item.roomTypeId}" aria-label="Remove all ${safeName} selections">${trashIcon}<span>Remove</span></button>
                </div>` : ''}
            </div>
          </div>
          ${stayLongerSection}
        </div>
      </article>
    `;
  }

  function renderWalkInSelectionSummary() {
    const selections = getWalkInTypeSelections();
    const needed = roomsNeeded();
    const selected = selections.filter(Boolean).length;
    const selectedIcon =
      '<svg class="admin-walkin-slot-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
    const pendingIcon =
      '<svg class="admin-walkin-slot-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/></svg>';
    const editIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
    const trashIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
    if (typeSelectionSummary) {
      typeSelectionSummary.innerHTML = Array.from({ length: needed }, (_, index) => {
        const type = roomTypes.find((item) => item.roomTypeId === selections[index]);
        return `<li class="${type ? 'is-selected' : 'is-pending'}">
          ${type ? selectedIcon : pendingIcon}
          <span><strong>Room ${index + 1}</strong> · ${type ? escapeHtml(type.name) : 'Not selected'}</span>
          ${type ? `<button type="button" data-walkin-remove-slot="${index}" aria-label="Remove selection for Room ${index + 1}">${trashIcon}<span>Remove</span></button>` : ''}
        </li>`;
      }).join('');
    }
    const groups = new Map();
    selections.forEach((typeId) => {
      if (typeId) groups.set(typeId, (groups.get(typeId) || 0) + 1);
    });
    if (selectionGroups) selectionGroups.hidden = groups.size === 0;
    if (selectionTypes) {
      selectionTypes.innerHTML = Array.from(groups, ([typeId, qty]) => {
        const type = roomTypes.find((item) => item.roomTypeId === typeId);
        const name = escapeHtml(type?.name || 'Room type');
        return `<li class="is-selected">
          ${selectedIcon}
          <span><strong>${name}</strong> · ${qty} room${qty === 1 ? '' : 's'}</span>
          <span class="admin-walkin-selection-actions">
            <button type="button" data-walkin-edit-type="${typeId}" aria-haspopup="dialog">${editIcon}<span>Edit quantity</span></button>
            <button type="button" data-walkin-remove-type="${typeId}" aria-label="Remove all ${name} selections">${trashIcon}<span>Remove all</span></button>
          </span>
        </li>`;
      }).join('');
    }
    if (selectionCount) selectionCount.textContent = `${selected} of ${needed} rooms selected`;
    if (selectionBarFill) selectionBarFill.style.width = `${needed ? Math.round((selected / needed) * 100) : 0}%`;
    if (typeSelectionProgress) {
      const label = typeSelectionProgress.querySelector?.('[data-progress-text]') || typeSelectionProgress;
      label.textContent = `${selected} of ${needed} selected · ${needed - selected} remaining`;
      typeSelectionProgress.hidden = wizardStep !== 'types';
      typeSelectionProgress.classList.toggle('is-complete', canProceedFromTypesStep());
    }
  }

  function renderWalkInTypePicker() {
    if (!roomTypePicker) return;
    syncWalkInTypeSelectionLength();
    clearUnavailableTypeSelections();
    const count = roomsNeeded();
    const items = buildWalkInOfferTypeItems();

    if (typesLede) {
      typesLede.textContent =
        count > 1
          ? `Select a room type, then choose how many of your ${count} rooms to add. The counter below tracks your draft — select it to review or undo picks.`
          : 'Choose a room type for this stay. Prices shown are per night.';
    }

    if (!items.length) {
      roomTypePicker.innerHTML =
        '<p class="admin-walkin-hint">No room types are available for these dates — try different check-in or check-out dates.</p>';
      syncWalkInTypesStepState();
      return;
    }

    roomTypePicker.innerHTML = `<div class="admin-walkin-type-cards">${items.map((item) => renderWalkInTypeCard(item)).join('')}</div>`;

    syncWalkInTypesStepState();
  }

  function effectiveRoomTypeCapacity(typeId) {
    const type = roomTypes.find((item) => item.roomTypeId === Number(typeId));
    const listed = Number(type?.maxOccupancy || 0);
    return Math.max(listed, MAX_GUESTS_PER_ROOM);
  }

  function partyFitsSelectedTypes() {
    const count = roomsNeeded();
    for (let i = 0; i < count; i += 1) {
      const room = guestRooms[i];
      if (!room) return false;
      const roomGuests = (Number(room.adults) || 0) + (Number(room.children) || 0);
      const typeId = Number(walkInTypeSelections[i] || 0);
      if (!typeId) continue;
      if (roomGuests > effectiveRoomTypeCapacity(typeId)) return false;
    }
    return true;
  }

  function canProceedFromTypesStep() {
    if (totalRemainingInventory() < roomsNeeded()) return false;
    if (!allWalkInTypesSelected()) return false;
    const selectedByType = new Map();
    getWalkInTypeSelections().forEach((typeId) => {
      selectedByType.set(typeId, (selectedByType.get(typeId) || 0) + 1);
    });
    for (const [typeId, qty] of selectedByType.entries()) {
      if (qty > typeRemaining(typeId)) return false;
    }
    return partyFitsSelectedTypes();
  }

  function syncWalkInTypesStepState() {
    renderWalkInSelectionSummary();
    updateWalkInAvailabilityNotice();
    if (submitBtn && wizardStep === 'types') {
      submitBtn.disabled = !canProceedFromTypesStep();
    }
  }

  function rebuildWalkInOffersByType() {
    const nights = nightCount();
    walkInOffersByType = new Map();
    walkInOfferCandidates.forEach((offer) => {
      const kind = offer.kind;
      const min = Number(offer.minNights || 0);
      const eligible =
        kind === 'LimitedTime'
        || (kind === 'StayLongerSaveMore' && min >= 2 && nights >= min);
      if (!eligible) return;
      const roomTypeId = Number(offer.roomTypeId);
      const promo = Number(offer.promoPrice);
      if (!(roomTypeId > 0) || !(promo > 0)) return;
      const existing = walkInOffersByType.get(roomTypeId);
      if (!existing || promo < existing.promoPrice) {
        walkInOffersByType.set(roomTypeId, offer);
      }
    });
  }

  function walkInOfferForType(roomTypeId) {
    if (isThirdPartyChannel()) return null;
    return walkInOffersByType.get(Number(roomTypeId)) || null;
  }

  function effectiveNightlyRate(roomTypeId, fallbackPrice) {
    const offer = walkInOfferForType(roomTypeId);
    if (offer && Number(offer.promoPrice) > 0) return Number(offer.promoPrice);
    return Number(fallbackPrice || 0);
  }

  function formatTypeRateLabel(type) {
    const base = Number(type.pricePerNight || 0);
    const offer = walkInOfferForType(type.roomTypeId);
    const remaining = typeRemaining(type.roomTypeId);
    if (offer && Number(offer.promoPrice) > 0 && Number(offer.promoPrice) < base) {
      return `${type.name} · ${money(offer.promoPrice)}/night (was ${money(base)}) · ${remaining} left · max ${type.maxOccupancy}`;
    }
    return `${type.name} · ${money(base)}/night · ${remaining} left for dates · max ${type.maxOccupancy}`;
  }

  function isOnWalkInPromoRate() {
    if (isThirdPartyChannel()) return false;
    return getWalkInTypeSelections().filter(Boolean).some((typeId) => Boolean(walkInOfferForType(typeId)));
  }

  function syncWalkInArrivalDiscountUi() {
    const select = document.getElementById('walkInArrivalDiscount');
    const hint = document.getElementById('walkInArrivalDiscountHint');
    const onPromo = isOnWalkInPromoRate();
    const thirdParty = isThirdPartyChannel();
    if (select) {
      select.disabled = onPromo || thirdParty;
      if (onPromo || thirdParty) select.value = 'None';
    }
    if (hint) {
      if (thirdParty) {
        hint.textContent =
          'Senior / PWD 20% discount applies to Walk-in and Other OTA channels only. Agoda, Expedia, and RedDoorz use standard OTA rates.';
      } else if (onPromo) {
        hint.textContent = 'Senior / PWD cannot combine with an active walk-in promo rate.';
      } else {
        hint.textContent =
          'Walk-in channel: 20% is deducted from the stay when Senior or PWD is selected (verify ID on arrival).';
      }
    }
  }

  function todayIso() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function toManilaIso(dateStr, timeStr) {
    const date = String(dateStr || '').slice(0, 10);
    const time = String(timeStr || '00:00').slice(0, 5);
    return `${date}T${time}:00+08:00`;
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

  function guestCount() {
    const totals = guestTotals();
    return totals.adults + totals.children;
  }

  function roomsNeeded() {
    return guestTotals().rooms;
  }

  function partySummaryText() {
    const totals = guestTotals();
    const count = totals.adults + totals.children;
    const detail = [];
    if (totals.adults) detail.push(`${totals.adults} adult${totals.adults === 1 ? '' : 's'}`);
    if (totals.children) detail.push(`${totals.children} child${totals.children === 1 ? '' : 'ren'}`);
    return `${count} guest${count === 1 ? '' : 's'} · ${totals.rooms} room${totals.rooms === 1 ? '' : 's'}${detail.length ? ` · ${detail.join(' · ')}` : ''}`;
  }

  function openModal(modal) {
    if (!modal) return;
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('guest-modal-open');
    const focusTarget = modal.querySelector('button, input, select, [href]');
    focusTarget?.focus();
  }

  function closeModal(modal) {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    const anyOpen = [guestsModal, bookModal, successModal].some((m) => m && !m.hidden);
    if (!anyOpen) document.body.classList.remove('guest-modal-open');
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  function closeAllWalkInModals() {
    closeWalkInQuantity();
    closeWalkInSelection(false);
    closeModal(guestsModal);
    closeModal(bookModal);
    closeModal(successModal);
  }

  function showFormMessage(text, isError = false) {
    if (!formMessage) return;
    formMessage.hidden = !text;
    formMessage.textContent = text || '';
    formMessage.classList.toggle('is-error', Boolean(isError && text));
  }

  function showGuestsHint(message) {
    if (!guestsHint) return;
    guestsHint.hidden = !message;
    guestsHint.textContent = message || '';
    clearTimeout(guestsHintTimer);
    if (message) {
      guestsHintTimer = setTimeout(() => {
        guestsHint.hidden = true;
        guestsHint.textContent = '';
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

  function guestRoomsOverCapacity() {
    return guestRooms.some((room) => {
      const total = (Number(room.adults) || 0) + (Number(room.children) || 0);
      return total > MAX_GUESTS_PER_ROOM;
    });
  }

  function firstMissingChildAge() {
    for (let roomIndex = 0; roomIndex < guestRooms.length; roomIndex += 1) {
      const room = guestRooms[roomIndex];
      const children = Number(room.children) || 0;
      for (let childIndex = 0; childIndex < children; childIndex += 1) {
        const age = room.childAges?.[childIndex];
        if (age === null || age === undefined || Number.isNaN(Number(age))) {
          return { room: roomIndex, child: childIndex };
        }
      }
    }
    return null;
  }

  function syncGuestsContinueState() {
    const over = guestRoomsOverCapacity();
    const missingAge = firstMissingChildAge();
    if (guestsSubmitBtn) {
      guestsSubmitBtn.disabled = over;
      guestsSubmitBtn.classList.toggle('is-pending', !over && Boolean(missingAge));
      guestsSubmitBtn.title = over
        ? 'Guests exceed room capacity. Add another room or reduce guests to continue.'
        : missingAge
          ? 'Select each child’s age to continue.'
          : '';
    }
    if (guestsCapacity) {
      if (over) {
        guestsCapacity.hidden = false;
        guestsCapacity.textContent = `Each room holds up to ${MAX_GUESTS_PER_ROOM} guests. Add another room or reduce guests.`;
      } else {
        guestsCapacity.hidden = true;
      }
    }
  }

  function renderGuestsRooms() {
    if (!guestsList) return;
    guestsList.innerHTML = guestRooms
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
            : `<button type="button" class="guest-guests-remove" data-walkin-remove-room="${index}" aria-label="Remove room ${index + 1}">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
              </button>`;
        const ages =
          (Number(room.children) || 0) > 0
            ? `<div class="guest-guests-ages">
                <span class="guest-guests-ages-label">${room.children} child${room.children === 1 ? '' : "ren"}'s age <em class="guest-guests-required">required</em></span>
                <div class="guest-guests-ages-grid">
                  ${Array.from({ length: room.children }, (_, childIndex) => {
                    const age = room.childAges[childIndex];
                    return `<label class="guest-guests-age-field">
                      <span class="visually-hidden">Child ${childIndex + 1} age</span>
                      <select data-walkin-age="${index}" data-walkin-age-index="${childIndex}">
                        ${ageOptionsHtml(age)}
                      </select>
                    </label>`;
                  }).join('')}
                </div>
              </div>`
            : '';
        const tooltipMsg = `Maximum ${MAX_GUESTS_PER_ROOM} guests per room. Please add another room for additional guests.`;
        const titleAttr = !canInc ? ` title="${tooltipMsg}"` : '';
        const extraNote = hasExtra
          ? `<p class="guest-guests-extra-note">Extra person · ₱200 / night</p>`
          : '';

        return `<article class="guest-guests-room${atCapacity ? ' is-at-capacity' : ''}${overCapacity ? ' is-over-capacity' : ''}${hasExtra ? ' has-extra-person' : ''}" data-walkin-guest-room="${index}">
          <div class="guest-guests-room-head">
            <h3>Room ${index + 1}</h3>
            ${removeBtn}
          </div>
          <div class="guest-guests-counters">
            <div class="guest-guests-counter">
              <span class="guest-guests-counter-label">Adults</span>
              <div class="guest-guests-stepper">
                <div class="guest-stepper-btn-wrap">
                  <button type="button" data-walkin-guest-step="adults" data-walkin-room-index="${index}" data-walkin-delta="-1" aria-label="Fewer adults in room ${index + 1}" ${canDecAdult ? '' : 'disabled'}>−</button>
                </div>
                <span aria-live="polite">${room.adults}</span>
                <div class="guest-stepper-btn-wrap">
                  <button type="button" data-walkin-guest-step="adults" data-walkin-room-index="${index}" data-walkin-delta="1" aria-label="More adults in room ${index + 1}" ${canInc ? '' : 'disabled'}${titleAttr}>+</button>
                </div>
              </div>
            </div>
            <div class="guest-guests-counter">
              <span class="guest-guests-counter-label">Children under 12 years old</span>
              <div class="guest-guests-stepper">
                <div class="guest-stepper-btn-wrap">
                  <button type="button" data-walkin-guest-step="children" data-walkin-room-index="${index}" data-walkin-delta="-1" aria-label="Fewer children in room ${index + 1}" ${canDecChild ? '' : 'disabled'}>−</button>
                </div>
                <span aria-live="polite">${room.children}</span>
                <div class="guest-stepper-btn-wrap">
                  <button type="button" data-walkin-guest-step="children" data-walkin-room-index="${index}" data-walkin-delta="1" aria-label="More children in room ${index + 1}" ${canInc ? '' : 'disabled'}${titleAttr}>+</button>
                </div>
              </div>
            </div>
          </div>
          ${ages}
          ${extraNote}
        </article>`;
      })
      .join('');
    syncGuestsContinueState();
    syncExtraPersonOption();
  }

  function adjustGuestCount(roomIndex, field, delta) {
    const room = guestRooms[roomIndex];
    if (!room) return;
    const adults = Number(room.adults) || 0;
    const children = Number(room.children) || 0;
    const currentTotal = adults + children;
    if (delta > 0 && currentTotal >= MAX_GUESTS_PER_ROOM) {
      showGuestsHint(`Each room holds up to ${MAX_GUESTS_PER_ROOM} guests. Please add another room for additional guests.`);
      return;
    }
    if (field === 'adults') {
      const next = adults + delta;
      if (next < 1) return;
      if (next + children > MAX_GUESTS_PER_ROOM) {
        showGuestsHint(`Each room holds up to ${MAX_GUESTS_PER_ROOM} guests. Please add another room for additional guests.`);
        return;
      }
      room.adults = next;
    } else {
      const next = children + delta;
      if (next < 0) return;
      if (adults + next > MAX_GUESTS_PER_ROOM) {
        showGuestsHint(`Each room holds up to ${MAX_GUESTS_PER_ROOM} guests. Please add another room for additional guests.`);
        return;
      }
      room.children = next;
      if (!Array.isArray(room.childAges)) room.childAges = [];
      room.childAges.length = next;
    }
    renderGuestsRooms();
  }

  function nightCount() {
    const n = window.MoriStayMath?.nightCount?.(checkInDate?.value || '', checkOutDate?.value || '') ?? 0;
    return n < 1 ? 0 : Math.max(1, n);
  }

  function earlyFee(count) {
    if (count < 1) return 0;
    const time = checkInTime?.value;
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    const minutes = h * 60 + (m || 0);
    const startMinutes = 5 * 60; // 5:00 AM
    const endMinutes = 11 * 60; // 11:00 AM
    return (minutes >= startMinutes && minutes <= endMinutes) ? EARLY_FEE * count : 0;
  }

  function lateHours() {
    const time = checkOutTime?.value || DEFAULT_CHECKOUT_TIME;
    if (!time || time <= DEFAULT_CHECKOUT_TIME) return 0;
    const [h, m] = time.split(':').map(Number);
    const [bh, bm] = DEFAULT_CHECKOUT_TIME.split(':').map(Number);
    const minutes = (h * 60 + (m || 0)) - (bh * 60 + (bm || 0));
    if (minutes <= 0) return 0;
    return Math.min(MAX_LATE_HOURS, Math.ceil(minutes / 60));
  }

  function lateFee(count) {
    if (count < 1) return 0;
    return lateHours() * LATE_FEE_PER_HOUR * count;
  }

  function roomHasExtraGuest(room) {
    const total = (Number(room?.adults) || 0) + (Number(room?.children) || 0);
    return total > BASE_GUESTS_PER_ROOM;
  }

  function extraPersonsFromGuests() {
    return guestRooms.reduce((sum, room) => {
      const total = (Number(room.adults) || 0) + (Number(room.children) || 0);
      return sum + Math.min(MAX_EXTRA_PERSONS_PER_ROOM, Math.max(0, total - BASE_GUESTS_PER_ROOM));
    }, 0);
  }

  function syncExtraPersonOption() {
    const fromGuests = extraPersonsFromGuests() > 0;
    if (extraPersonWrap) extraPersonWrap.hidden = !fromGuests;
    if (extraPersonInput) {
      if (fromGuests) extraPersonInput.checked = true;
      extraPersonInput.disabled = fromGuests;
    }
  }

  function fillTimeOptions() {
    const count = Math.max(1, roomsNeeded());
    if (checkInTime) {
      const prev = checkInTime.value || DEFAULT_CHECKIN_TIME;
      const options = [
        `<option value="${DEFAULT_CHECKIN_TIME}">14:00 (2:00 PM) — free of charge</option>`,
      ];
      for (let hour = 5; hour <= 11; hour += 1) {
        const hh = String(hour).padStart(2, '0');
        const time = `${hh}:00`;
        const ampm = `${hour}:00 AM`;
        const fee = EARLY_FEE * count;
        options.push(
          `<option value="${time}">${time} (${ampm}) — ${money(fee)} early check-in (${money(EARLY_FEE)} × ${count} room${count === 1 ? '' : 's'})</option>`
        );
      }
      checkInTime.innerHTML = options.join('');
      checkInTime.value = [...checkInTime.options].some((o) => o.value === prev)
        ? prev
        : DEFAULT_CHECKIN_TIME;
    }
    if (checkOutTime) {
      const prev = checkOutTime.value || DEFAULT_CHECKOUT_TIME;
      const options = [
        `<option value="${DEFAULT_CHECKOUT_TIME}">12:00 (12:00 PM) — free of charge</option>`,
      ];
      for (let hour = 1; hour <= MAX_LATE_HOURS; hour += 1) {
        const total = 12 * 60 + hour * 60;
        const hh = String(Math.floor(total / 60)).padStart(2, '0');
        const time = `${hh}:00`;
        const pmHour = Math.floor(total / 60) > 12 ? Math.floor(total / 60) - 12 : Math.floor(total / 60);
        const ampm = `${pmHour}:00 PM`;
        const fee = LATE_FEE_PER_HOUR * hour * count;
        options.push(
          `<option value="${time}">${time} (${ampm}) — ${money(fee)} late check-out (+${hour}h × ${count} room${count === 1 ? '' : 's'})</option>`
        );
      }
      checkOutTime.innerHTML = options.join('');
      checkOutTime.value = [...checkOutTime.options].some((o) => o.value === prev)
        ? prev
        : DEFAULT_CHECKOUT_TIME;
    }
    refreshFeeHint();
  }

  function refreshFeeHint() {
    const count = roomsNeeded();
    const early = earlyFee(count);
    const late = lateFee(count);
    if (!timeFeesHint) return;
    if (!early && !late) {
      timeFeesHint.hidden = true;
      timeFeesHint.textContent = '';
      return;
    }
    const parts = [];
    if (early) parts.push(`Early check-in ${money(early)} (5:00 AM – 11:00 AM)`);
    if (late) parts.push(`Late check-out ${money(late)} (+${lateHours()}h extend, 1:00 PM – 3:00 PM)`);
    timeFeesHint.hidden = false;
    timeFeesHint.textContent = `${parts.join(' · ')} (${count} room${count === 1 ? '' : 's'})`;
  }

  async function refreshDateAvailability() {
    if (!checkInDate?.value || !checkOutDate?.value) {
      remainingByType = new Map();
      soldOutByType = new Map();
      return;
    }
    try {
      const query = new URLSearchParams({
        checkInAtUtc: toManilaIso(checkInDate.value, checkInTime?.value || DEFAULT_CHECKIN_TIME),
        checkoutTimeUtc: toManilaIso(checkOutDate.value, checkOutTime?.value || DEFAULT_CHECKOUT_TIME),
      });
      const items = await apiFetch(`/api/bookings/availability?${query}`);
      remainingByType = new Map();
      soldOutByType = new Map();
      (Array.isArray(items) ? items : []).forEach((item) => {
        const typeId = Number(item.roomTypeId ?? item.RoomTypeId);
        if (!typeId) return;
        remainingByType.set(typeId, Number(item.remaining ?? item.Remaining ?? 0));
        const soldOut = item.soldOutDates ?? item.SoldOutDates;
        if (Array.isArray(soldOut) && soldOut.length) {
          soldOutByType.set(typeId, soldOut.filter(Boolean));
        }
      });
    } catch {
      remainingByType = new Map();
      soldOutByType = new Map();
    }
  }

  function formatSoldOutDateLabel(isoDate) {
    return window.MoriStayMath?.formatSoldOutDateLabel?.(isoDate) ?? (isoDate || '');
  }

  function totalRemainingInventory() {
    return roomTypes.reduce((sum, type) => sum + typeRemaining(type.roomTypeId), 0);
  }

  function buildSoldOutTypeMessages() {
    const messages = [];
    roomTypes.forEach((type) => {
      const remaining = typeRemaining(type.roomTypeId);
      if (remaining >= 1) return;
      const soldOut = soldOutByType.get(type.roomTypeId) || [];
      if (soldOut.length) {
        const labels = soldOut.map(formatSoldOutDateLabel).join(', ');
        messages.push(`${type.name} is fully booked on ${labels}.`);
      } else {
        messages.push(`${type.name} has no rooms left for these dates.`);
      }
    });
    return messages;
  }

  function updateWalkInAvailabilityNotice() {
    const needed = roomsNeeded();
    const totalRemaining = totalRemainingInventory();
    const soldOutMessages = buildSoldOutTypeMessages();
    let message = '';

    if (!inventoryReady) {
      message = inventoryFailed
        ? 'Room inventory failed to load — reopen the walk-in panel to retry.'
        : 'Loading room inventory…';
    } else if (totalRemaining < needed) {
      const shortage =
        totalRemaining === 0
          ? `No rooms are available for these dates — you need ${needed} room${needed === 1 ? '' : 's'}. Try different dates or room types.`
          : `Only ${totalRemaining} room${totalRemaining === 1 ? '' : 's'} available for these dates — you need ${needed}. Try different dates or room types.`;
      message = soldOutMessages.length
        ? `${shortage} ${soldOutMessages.join(' ')}`
        : shortage;
    } else if (soldOutMessages.length) {
      message = `Heads up — ${soldOutMessages.join(' ')}`;
    }

    document.querySelectorAll('[data-walkin-availability-notice]').forEach((el) => {
      el.textContent = message;
      el.hidden = !message;
    });
  }

  function typeRemaining(typeId) {
    if (remainingByType.has(typeId)) return Number(remainingByType.get(typeId) || 0);
    // Fallback before availability loads: count Available physical rooms.
    return rooms.filter((room) => room.roomTypeId === typeId && room.status === 'Available').length;
  }



  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function capacityHold() {
    const count = roomsNeeded();
    let sum = 0;
    for (let i = 0; i < count; i += 1) {
      const typeId = Number(walkInTypeSelections[i] || 0);
      if (!typeId) continue;
      sum += effectiveRoomTypeCapacity(typeId);
    }
    return sum;
  }

  function refreshTotals() {
    rebuildWalkInOffersByType();
    syncExtraPersonOption();

    const hold = capacityHold();
    const guests = guestCount();
    if (capacityWarn) {
      const typesReady = allWalkInTypesSelected();
      if (typesReady && hold > 0 && guests > hold) {
        capacityWarn.hidden = false;
        capacityWarn.textContent = `Party of ${guests} exceeds selected rooms’ capacity (${hold}). Choose larger types or add rooms.`;
      } else {
        capacityWarn.hidden = true;
      }
    }

    if (partySummary) partySummary.textContent = partySummaryText();
    refreshFeeHint();
    syncWalkInArrivalDiscountUi();
  }

  async function setWizardStep(step) {
    if (!STEPS.includes(step)) return;
    wizardStep = step;
    renderWalkInSelectionSummary();
    bookForm?.setAttribute('data-walkin-step', step);
    document.querySelectorAll('[data-walkin-step-panel]').forEach((panel) => {
      const id = panel.getAttribute('data-walkin-step-panel');
      const active = id === step;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    stepTabs.forEach((tab) => {
      const id = tab.getAttribute('data-walkin-step-tab');
      const active = id === step;
      tab.classList.toggle('is-current', active);
      tab.setAttribute('aria-current', active ? 'step' : 'false');
    });

    const isFirst = step === 'guest';
    const isLast = step === 'types';
    if (backBtn) {
      backBtn.hidden = false;
      backBtn.textContent = isFirst ? 'Back to guests' : 'Back';
    }
    if (nextBtn) nextBtn.hidden = isLast;
    if (submitBtn) submitBtn.hidden = !isLast;
    if (nextBtn) nextBtn.disabled = false;
    showFormMessage('');

    if (step === 'types' || step === 'dates') {
      await refreshDateAvailability();
    }
    if (step === 'types') {
      renderWalkInTypePicker();
      refreshTotals();
      syncWalkInTypesStepState();
    }
    if (step === 'dates') refreshTotals();
  }

  const GUEST_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  const GUEST_PHONE_RE = /^[+\d][\d\s\-().]*$/;

  function markGuestField(input, message, focusField = true) {
    if (!input) return;
    input.setAttribute('aria-invalid', 'true');
    input.classList.add('is-invalid');
    if (focusField) input.focus({ preventScroll: true });
    showFormMessage(message, true);
    const clear = () => {
      input.removeAttribute('aria-invalid');
      input.classList.remove('is-invalid');
      input.removeEventListener('input', clear);
    };
    input.addEventListener('input', clear);
  }

  function validateGuestFields() {
    const nameEl = document.getElementById('walkInGuestName');
    const emailEl = document.getElementById('walkInGuestEmail');
    const phoneEl = document.getElementById('walkInGuestPhone');
    const name = String(nameEl?.value || '').trim();
    const email = String(emailEl?.value || '').trim();
    const phone = String(phoneEl?.value || '').trim();

    if (!name) return markGuestField(nameEl, 'Enter the lead guest’s full name.'), false;
    if (name.length < 2) return markGuestField(nameEl, 'Full name must be at least 2 characters.'), false;
    if (!email) return markGuestField(emailEl, 'Enter the guest’s email address.'), false;
    if (!GUEST_EMAIL_RE.test(email)) {
      const hint = email.includes('@') && !/\.[a-z]{2,}$/i.test(email)
        ? `Email is missing its ending — e.g. ${email.split('@')[0]}@gmail.com`
        : 'Enter a valid email like name@gmail.com.';
      return markGuestField(emailEl, hint), false;
    }
    if (!phone) return markGuestField(phoneEl, 'Enter the guest’s phone number.'), false;
    const digits = phone.replace(/\D/g, '');
    if (!GUEST_PHONE_RE.test(phone) || digits.length < 7) {
      return markGuestField(phoneEl, 'Phone must be digits only (spaces, dashes, or a leading + are fine), e.g. +63 917 123 4567.'), false;
    }
    if (digits.length > 15) return markGuestField(phoneEl, 'Phone number is too long.'), false;
    return true;
  }

  function validateStep(step) {
    if (step === 'guest') {
      return validateGuestFields();
    }
    if (step === 'dates') {
      if (nightCount() < 1) {
        showFormMessage('Check-out must be after check-in.', true);
        return false;
      }
      return true;
    }
    if (step === 'types') {
      const channel = String(document.getElementById('walkInChannel')?.value || '');
      if (!channel) {
        showFormMessage('Select a booking channel (Walk-in, Agoda, Expedia, RedDoorz, or Other OTA).', true);
        return false;
      }
      if (totalRemainingInventory() < roomsNeeded()) {
        updateWalkInAvailabilityNotice();
        const notice = document.getElementById('walkInTypesAvailabilityNotice');
        showFormMessage(
          notice?.textContent ||
            'No rooms are available for these dates. Try different dates or room types.',
          true
        );
        return false;
      }
      if (!allWalkInTypesSelected()) {
        const needed = roomsNeeded();
        showFormMessage(
          `Select a room type for each of the ${needed} room${needed === 1 ? '' : 's'} in the party.`,
          true
        );
        return false;
      }
      const selectedByType = new Map();
      getWalkInTypeSelections().forEach((typeId) => {
        selectedByType.set(typeId, (selectedByType.get(typeId) || 0) + 1);
      });
      for (const [typeId, qty] of selectedByType.entries()) {
        const remaining = typeRemaining(typeId);
        if (qty > remaining) {
          const type = roomTypes.find((item) => item.roomTypeId === typeId);
          showFormMessage(
            `${type?.name || 'Room type'} has only ${remaining} room(s) left for these dates (other bookings may hold them).`,
            true
          );
          return false;
        }
      }
      if (!partyFitsSelectedTypes()) {
        showFormMessage(
          'Party size exceeds the selected room type capacity. Choose a larger type or adjust guests.',
          true
        );
        return false;
      }
      return true;
    }
    return true;
  }

  async function apiFetch(url, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {}),
    };
    if (token) headers.RequestVerificationToken = token;
    const response = await fetch(url, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const validationMessage = payload.errors
        ? Object.values(payload.errors).flat().join(' ')
        : '';
      throw new Error(payload.message || validationMessage || `Request failed (${response.status}).`);
    }
    return payload;
  }

  async function loadInventory() {
    if (inventoryReady) return;
    const [typePayload, roomPayload, offerPayload] = await Promise.all([
      apiFetch('/api/rooms/types'),
      apiFetch('/api/rooms'),
      apiFetch('/api/special-offers/active-walk-in').catch(() => []),
    ]);

    roomTypes = (Array.isArray(typePayload) ? typePayload : []).map((type) => ({
      roomTypeId: Number(type.roomTypeId ?? type.id),
      name: type.name || type.roomTypeName || 'Room',
      pricePerNight: Number(type.pricePerNight || 0),
      maxOccupancy: Number(type.maxOccupancy || MAX_GUESTS_PER_ROOM),
      bedCount: Number(type.bedCount || 0),
      description: String(type.description || '').trim(),
      images: Array.isArray(type.images) ? type.images.filter(Boolean) : [],
      inclusions: Array.isArray(type.inclusions) ? type.inclusions.filter(Boolean) : [],
    }));

    rooms = (Array.isArray(roomPayload) ? roomPayload : []).map((room) => {
      const type = roomTypes.find((item) => item.roomTypeId === Number(room.roomTypeId));
      return {
        id: Number(room.id),
        roomTypeId: Number(room.roomTypeId),
        roomNumber: room.roomNumber || String(room.id),
        pricePerNight: Number(room.pricePerNight || type?.pricePerNight || 0),
        status: String(room.status || ''),
        maxOccupancy: Number(room.maxOccupancy || type?.maxOccupancy || MAX_GUESTS_PER_ROOM),
      };
    });

    walkInOfferCandidates = [];
    (Array.isArray(offerPayload) ? offerPayload : []).forEach((offer) => {
      if (
        (offer.kind !== 'LimitedTime' && offer.kind !== 'StayLongerSaveMore')
        || offer.promoPricePerNight == null
      ) {
        return;
      }
      const roomTypeId = Number(offer.roomTypeId);
      const promo = Number(offer.promoPricePerNight);
      if (!(roomTypeId > 0) || !(promo > 0)) return;
      walkInOfferCandidates.push({
        id: Number(offer.id),
        roomTypeId,
        promoPrice: promo,
        regularPrice: Number(offer.regularPricePerNight || 0),
        title: String(offer.title || ''),
        kind: String(offer.kind || ''),
        minNights: offer.minNights == null ? null : Number(offer.minNights),
      });
    });
    rebuildWalkInOffersByType();

    inventoryReady = true;
  }

  function resetDates() {
    const today = todayIso();
    if (checkInDate) {
      checkInDate.min = today;
      checkInDate.value = today;
    }
    if (checkOutDate) {
      checkOutDate.min = today;
      const tomorrow = new Date(`${today}T12:00:00+08:00`);
      tomorrow.setDate(tomorrow.getDate() + 1);
      checkOutDate.value = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    }
    fillTimeOptions();
  }

  function openWalkInFlow() {
    guestRooms = [{ adults: 2, children: 0, childAges: [] }];
    walkInTypeSelections = [];
    inventoryReady = false;
    inventoryFailed = false;
    renderGuestsRooms();
    closeModal(bookModal);
    closeModal(successModal);
    openModal(guestsModal);
    updateWalkInAvailabilityNotice();
    loadInventory().then(() => {
      updateWalkInAvailabilityNotice();
    }).catch((error) => {
      inventoryFailed = true;
      updateWalkInAvailabilityNotice();
      showGuestsHint(error instanceof Error ? error.message : 'Unable to load rooms.');
    });
  }

  function continueToBookWizard() {
    if (guestRoomsOverCapacity()) {
      showGuestsHint('Guests exceed room capacity. Add another room or reduce guests.');
      return;
    }
    if (guestCount() < 1 || roomsNeeded() < 1) {
      showGuestsHint('Add at least one adult and one room.');
      return;
    }
    const missingAge = firstMissingChildAge();
    if (missingAge) {
      const select = guestsList?.querySelector(
        `[data-walkin-age="${missingAge.room}"][data-walkin-age-index="${missingAge.child}"]`
      );
      select?.setAttribute('aria-invalid', 'true');
      select?.classList.add('is-invalid');
      select?.focus();
      showGuestsHint(
        `Select the age of child ${missingAge.child + 1} in Room ${missingAge.room + 1} before continuing.`
      );
      return;
    }
    closeModal(guestsModal);
    resetDates();
    walkInTypeSelections = [];
    const channelEl = document.getElementById('walkInChannel');
    if (channelEl) channelEl.value = sourceSelect?.value || 'WalkIn';
    if (partySummary) partySummary.textContent = partySummaryText();
    setWizardStep('guest');
    openModal(bookModal);
    refreshTotals();
  }

  openBtn?.addEventListener('click', () => {
    if (sourceModal) {
      if (sourceSelect) sourceSelect.value = 'WalkIn';
      openModal(sourceModal);
    } else {
      openWalkInFlow();
    }
  });

  sourceNextBtn?.addEventListener('click', () => {
    const channelSelect = document.getElementById('walkInChannel');
    if (channelSelect && sourceSelect) {
      channelSelect.value = sourceSelect.value;
    }
    closeModal(sourceModal);
    openWalkInFlow();
  });

  document.querySelectorAll('[data-walkin-source-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(sourceModal));
  });

  roomTypePicker?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-walkin-pick-type], [data-walkin-edit-type], [data-walkin-remove-type]');
    if (!btn || btn.disabled) return;
    event.preventDefault();
    const typeId = Number(btn.dataset.walkinPickType || btn.dataset.walkinEditType || btn.dataset.walkinRemoveType);
    if (!typeId) return;
    if (btn.hasAttribute('data-walkin-remove-type')) {
      setWalkInTypeQuantity(typeId, 0);
      focusWalkInType(typeId);
    } else if (btn.hasAttribute('data-walkin-edit-type')) {
      openWalkInQuantity(typeId, 'edit');
    } else if (roomsNeeded() > 1) {
      openWalkInQuantity(typeId, 'add');
    } else if (typeRemaining(typeId) > 0 && guestCount() <= effectiveRoomTypeCapacity(typeId)) {
      commitWalkInTypeSelections([typeId]);
      focusWalkInType(typeId);
    }
  });

  typeSelectionSummary?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-walkin-remove-slot]');
    if (!btn) return;
    const index = Number(btn.dataset.walkinRemoveSlot);
    const selections = getWalkInTypeSelections();
    if (!Number.isInteger(index) || index < 0 || index >= selections.length) return;
    const typeId = selections[index];
    selections[index] = 0;
    commitWalkInTypeSelections(selections);
    focusWalkInType(typeId);
  });

  quantityDialog?.querySelectorAll('[data-walkin-quantity-close]').forEach((btn) => {
    btn.addEventListener('click', closeWalkInQuantity);
  });
  quantityDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeWalkInQuantity();
  });
  quantityDialog?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') event.stopPropagation();
  });
  quantityDialog?.querySelectorAll('[data-walkin-quantity-minus], [data-walkin-quantity-plus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const delta = btn.hasAttribute('data-walkin-quantity-plus') ? 1 : -1;
      quantityInput.value = String(Math.max(Number(quantityInput.min), Math.min(Number(quantityInput.max), Number(quantityInput.value) + delta)));
      syncWalkInQuantityControls();
    });
  });
  quantityInput?.addEventListener('input', () => {
    quantityError.hidden = true;
    quantityInput.removeAttribute('aria-invalid');
    syncWalkInQuantityControls();
  });
  quantityForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = Number(quantityInput.value);
    const { existing } = walkInQuantityLimit(quantityTypeId);
    const quantity = quantityMode === 'add' ? existing + value : value;
    if (quantityInput.value.trim() === '' || !Number.isInteger(value)
        || value < (quantityMode === 'add' ? 1 : 0)
        || !setWalkInTypeQuantity(quantityTypeId, quantity)) {
      syncWalkInQuantityControls();
      quantityError.textContent = 'Choose a whole number within the available limit. Availability may have changed.';
      quantityError.hidden = false;
      quantityInput.setAttribute('aria-invalid', 'true');
      quantityInput.focus();
      return;
    }
    closeWalkInQuantity();
  });

  guestsAddRoomBtn?.addEventListener('click', () => {
    if (guestRooms.length >= MAX_GUEST_ROOMS) {
      showGuestsHint(`You can add up to ${MAX_GUEST_ROOMS} rooms.`);
      return;
    }
    guestRooms.push({ adults: 1, children: 0, childAges: [] });
    renderGuestsRooms();
  });

  guestsSubmitBtn?.addEventListener('click', () => continueToBookWizard());

  guestsList?.addEventListener('click', (event) => {
    const stepBtn = event.target.closest('[data-walkin-guest-step]');
    if (stepBtn) {
      adjustGuestCount(
        Number(stepBtn.getAttribute('data-walkin-room-index')),
        stepBtn.getAttribute('data-walkin-guest-step'),
        Number(stepBtn.getAttribute('data-walkin-delta'))
      );
      return;
    }
    const removeBtn = event.target.closest('[data-walkin-remove-room]');
    if (removeBtn) {
      const index = Number(removeBtn.getAttribute('data-walkin-remove-room'));
      if (index > 0) {
        guestRooms.splice(index, 1);
        renderGuestsRooms();
      }
    }
  });

  guestsList?.addEventListener('change', (event) => {
    const ageSelect = event.target.closest('[data-walkin-age]');
    if (!ageSelect) return;
    const roomIndex = Number(ageSelect.getAttribute('data-walkin-age'));
    const childIndex = Number(ageSelect.getAttribute('data-walkin-age-index'));
    const room = guestRooms[roomIndex];
    if (!room) return;
    if (!Array.isArray(room.childAges)) room.childAges = [];
    room.childAges[childIndex] = ageSelect.value === '' ? null : Number(ageSelect.value);
    if (ageSelect.value !== '') {
      ageSelect.removeAttribute('aria-invalid');
      ageSelect.classList.remove('is-invalid');
      showGuestsHint('');
    }
    syncGuestsContinueState();
  });

  typeSelectionProgress?.addEventListener('click', openWalkInSelection);

  selectionDialog?.addEventListener('click', (event) => {
    if (event.target === selectionDialog) {
      closeWalkInSelection();
      return;
    }
    const btn = event.target.closest('[data-walkin-edit-type], [data-walkin-remove-type]');
    if (!btn || btn.disabled) return;
    event.preventDefault();
    const typeId = Number(btn.dataset.walkinEditType || btn.dataset.walkinRemoveType);
    if (!typeId) return;
    if (btn.hasAttribute('data-walkin-remove-type')) {
      setWalkInTypeQuantity(typeId, 0);
      focusWalkInType(typeId);
    } else {
      openWalkInQuantity(typeId, 'edit');
    }
  });
  selectionDialog?.querySelectorAll('[data-walkin-selection-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeWalkInSelection());
  });
  selectionDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeWalkInSelection();
  });
  selectionDialog?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') event.stopPropagation();
  });

  document.querySelectorAll('[data-walkin-close]').forEach((el) => {
    el.addEventListener('click', () => closeAllWalkInModals());
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (![guestsModal, bookModal, successModal].some((m) => m && !m.hidden)) return;
    closeAllWalkInModals();
  });

  nextBtn?.addEventListener('click', async () => {
    if (!validateStep(wizardStep)) return;
    const index = STEPS.indexOf(wizardStep);
    if (index < STEPS.length - 1) await setWizardStep(STEPS[index + 1]);
  });

  backBtn?.addEventListener('click', async () => {
    if (wizardStep === 'guest') {
      closeModal(bookModal);
      openModal(guestsModal);
      return;
    }
    const index = STEPS.indexOf(wizardStep);
    if (index > 0) await setWizardStep(STEPS[index - 1]);
  });

  stepTabs.forEach((tab) => {
    tab.addEventListener('click', async () => {
      const target = tab.getAttribute('data-walkin-step-tab');
      if (!target || !STEPS.includes(target)) return;
      const currentIndex = STEPS.indexOf(wizardStep);
      const targetIndex = STEPS.indexOf(target);
      if (targetIndex > currentIndex && !validateStep(wizardStep)) return;
      await setWizardStep(target);
    });
  });

  [checkInDate, checkOutDate, checkInTime, checkOutTime].forEach((el) => {
    const handler = async () => {
      if (el === checkInDate && checkOutDate && checkOutDate.value < checkInDate.value) {
        checkOutDate.value = checkInDate.value;
      }
      fillTimeOptions();
      await refreshDateAvailability();
      if (wizardStep === 'types') {
        renderWalkInTypePicker();
        syncWalkInTypesStepState();
      }
      refreshTotals();
    };
    el?.addEventListener('change', handler);
    el?.addEventListener('input', handler);
  });

  extraPersonInput?.addEventListener('change', () => refreshTotals());

  document.getElementById('walkInChannel')?.addEventListener('change', () => {
    if (wizardStep === 'types') renderWalkInTypePicker();
    refreshTotals();
  });

  document.getElementById('walkInArrivalDiscount')?.addEventListener('change', () => refreshTotals());

  // Inline format feedback on the Guest step as soon as the field is left.
  document.getElementById('walkInGuestEmail')?.addEventListener('blur', (event) => {
    const value = String(event.target.value || '').trim();
    if (value && !GUEST_EMAIL_RE.test(value)) {
      markGuestField(event.target, 'Enter a valid email like name@gmail.com.', false);
    }
  });
  document.getElementById('walkInGuestPhone')?.addEventListener('blur', (event) => {
    const value = String(event.target.value || '').trim();
    if (value && (!GUEST_PHONE_RE.test(value) || value.replace(/\D/g, '').length < 7)) {
      markGuestField(event.target, 'Phone must be digits only, e.g. +63 917 123 4567.', false);
    }
  });

  bookForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateStep('guest') || !validateStep('dates') || !validateStep('types')) {
      if (!validateStep('guest')) setWizardStep('guest');
      else if (!validateStep('dates')) setWizardStep('dates');
      else setWizardStep('types');
      return;
    }

    const itemsByType = new Map();
    getWalkInTypeSelections().filter(Boolean).forEach((typeId) => {
      itemsByType.set(typeId, (itemsByType.get(typeId) || 0) + 1);
    });
    const payloadItems = Array.from(itemsByType.entries()).map(([roomTypeId, quantity]) => ({
      roomTypeId,
      quantity,
    }));

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.originalText = submitBtn.textContent || '';
      submitBtn.textContent = 'Creating…';
    }

    const restoreSubmit = () => {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.originalText || 'Create booking';
      }
    };

    try {
      // Refresh offers + inventory first so creation uses the same prices and
      // availability the server will see (offers can change mid-entry).
      await loadInventory();

      const booking = await apiFetch('/api/admin/bookings/walk-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: String(document.getElementById('walkInGuestName')?.value || '').trim(),
          guestEmail: String(document.getElementById('walkInGuestEmail')?.value || '').trim(),
          guestPhone: String(document.getElementById('walkInGuestPhone')?.value || '').trim(),
          checkInAtUtc: toManilaIso(checkInDate.value, checkInTime.value),
          checkoutTimeUtc: toManilaIso(checkOutDate.value, checkOutTime.value),
          extraPersons: extraPersonsFromGuests() || (extraPersonInput?.checked ? 1 : 0),
          items: payloadItems,
          channel: String(document.getElementById('walkInChannel')?.value || ''),
          arrivalDiscountRequest: String(document.getElementById('walkInArrivalDiscount')?.value || 'None'),
        }),
      });

      closeModal(bookModal);
      // Stay on the page — the new booking lands in the table and its detail
      // modal opens in place so payment + room assignment continue there.
      if (typeof window.MoriOpenAdminBooking === 'function') {
        window.MoriOpenAdminBooking(booking.id, booking, { markRead: true });
        window.dispatchEvent(new CustomEvent('mori:admin-refresh', {
          detail: { scopes: ['bookings'] },
        }));
        return;
      }
      window.location.href = `/AdminBookings?booking=${booking.id}`;
    } catch (error) {
      showFormMessage(error instanceof Error ? error.message : 'Unable to create booking.', true);
      restoreSubmit();
    }
  });

  // Auto-open from /WalkIn redirect or ?walkin=1
  const params = new URLSearchParams(window.location.search);
  if (params.get('walkin') === '1') {
    openWalkInFlow();
    params.delete('walkin');
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', next);
  }
})();
