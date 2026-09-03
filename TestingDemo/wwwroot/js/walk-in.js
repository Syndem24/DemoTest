(() => {
  const openBtn = document.querySelector('[data-walkin-open]');
  const guestsModal = document.getElementById('walkInGuestsModal');
  const bookModal = document.getElementById('walkInBookModal');
  const successModal = document.getElementById('walkInSuccessModal');
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
  const roomsIntro = document.getElementById('walkInRoomsIntro');
  const roomSlots = document.getElementById('walkInRoomSlots');
  const capacityWarn = document.getElementById('walkInCapacityWarn');
  const availabilityNotice = document.getElementById('walkInAvailabilityNotice');
  const confirmLabel = document.getElementById('walkInConfirmLabel');
  const confirmTotal = document.getElementById('walkInConfirmTotal');
  const feeBreakdown = document.getElementById('walkInFeeBreakdown');
  const backBtn = document.getElementById('walkInWizardBackBtn');
  const nextBtn = document.getElementById('walkInWizardNextBtn');
  const submitBtn = document.getElementById('walkInSubmitBtn');
  const successMessage = document.getElementById('walkInSuccessMessage');
  const successDoneBtn = document.getElementById('walkInSuccessDoneBtn');
  const paymentMethod = document.getElementById('walkInPaymentMethod');
  const paymentDue = document.getElementById('walkInPaymentDue');
  const paymentTendered = document.getElementById('walkInPaymentTendered');
  const paymentDigitalAmount = document.getElementById('walkInPaymentDigitalAmount');
  const paymentChange = document.getElementById('walkInPaymentChange');
  const paymentCashDueWrap = document.getElementById('walkInPaymentCashDueWrap');
  const paymentCashTenderWrap = document.getElementById('walkInPaymentCashTenderWrap');
  const paymentDigitalWrap = document.getElementById('walkInPaymentDigitalWrap');
  const paymentDigitalHint = document.getElementById('walkInPaymentDigitalHint');
  const roomTypePicker = document.getElementById('walkInRoomTypePicker');
  const typesLede = document.getElementById('walkInTypesLede');
  const stepTabs = Array.from(document.querySelectorAll('[data-walkin-step-tab]'));

  const token = document.querySelector(
    '#adminAntiForgery input[name="__RequestVerificationToken"]'
  )?.value
    || bookForm?.querySelector('input[name="__RequestVerificationToken"]')?.value
    || '';

  const BASE_GUESTS_PER_ROOM = 2;
  const MAX_GUESTS_PER_ROOM = 3;
  const MAX_EXTRA_PERSONS = 1;
  const MAX_CHILD_AGE = 12;
  const MAX_GUEST_ROOMS = 8;
  const EARLY_CHECKIN_TIME = '11:30';
  const DEFAULT_CHECKIN_TIME = '14:00';
  const DEFAULT_CHECKOUT_TIME = '12:00';
  const EARLY_FEE = 500;
  const LATE_FEE_PER_HOUR = 100;
  const MAX_LATE_HOURS = 3;
  const FREE_CHECKIN_TIMES = [
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
    '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
    '20:00', '20:30', '21:00', '21:30', '22:00', '22:30',
    '23:00', '23:30',
  ];
  const STEPS = ['guest', 'dates', 'types', 'payment', 'rooms'];
  const WALK_IN_ARRIVAL_DISCOUNT_RATE = 0.2;

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

  function money(value) {
    return `₱${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function isThirdPartyChannel() {
    const channel = String(document.getElementById('walkInChannel')?.value || '');
    return channel === 'Agoda' || channel === 'RedDoorz';
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

  function walkInSelectButtonLabel(roomIndex, roomCount, isSelected, soldOut) {
    if (soldOut) return 'Fully booked';
    if (!isSelected) return 'Select room';
    return roomCount > 1 ? `Selected · Room ${roomIndex + 1}` : 'In your stay';
  }

  function selectWalkInType(roomIndex, typeId) {
    syncWalkInTypeSelectionLength();
    walkInTypeSelections[roomIndex] = Number(typeId) || 0;
    renderWalkInTypePicker();
    refreshTotals();
    syncWalkInTypesStepState();
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

  function renderWalkInTypeCard(item, roomIndex, roomCount, selectedId) {
    const base = Number(item.pricePerNight || 0);
    const limited = walkInLimitedOfferForType(item.roomTypeId);
    const activeOffer = walkInOfferForType(item.roomTypeId);
    const effective = effectiveNightlyRate(item.roomTypeId, base);
    const regular = limited
      ? Math.max(base, Number(limited.regularPrice || 0))
      : base;
    const showCompare = Boolean(activeOffer && effective < regular);
    const soldOut = item.available < 1;
    const isSelected = selectedId === item.roomTypeId;
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
      ? `<span class="guest-offer-selected-badge" data-walkin-selected-badge>In your stay</span>`
      : '';
    const selectLabel = walkInSelectButtonLabel(roomIndex, roomCount, isSelected, soldOut);

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
                class="guest-btn guest-btn-primary guest-offer-select admin-walkin-pick-type${isSelected ? ' is-selected-room' : ''}"
                data-walkin-pick-type="${item.roomTypeId}"
                data-walkin-room-index="${roomIndex}"
                aria-pressed="${isSelected ? 'true' : 'false'}"
                ${soldOut ? 'disabled' : ''}>
                ${
                  isSelected
                    ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>`
                    : ''
                }
                <span>${selectLabel}</span>
              </button>
            </div>
          </div>
          ${stayLongerSection}
        </div>
      </article>
    `;
  }

  function renderWalkInTypeSlot(roomIndex, items, roomCount) {
    const selectedId = Number(walkInTypeSelections[roomIndex] || 0);
    const head =
      roomCount > 1
        ? `<h4 class="admin-walkin-type-slot-head">Room ${roomIndex + 1}</h4>`
        : '<h4 class="admin-walkin-type-slot-head">Select room type</h4>';
    const cards = items.map((item) => renderWalkInTypeCard(item, roomIndex, roomCount, selectedId)).join('');
    return `
      <div class="admin-walkin-type-slot" data-walkin-type-slot="${roomIndex}">
        ${head}
        <div class="admin-walkin-type-cards">${cards}</div>
      </div>
    `;
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
          ? `Choose room types for each of the ${count} rooms in the party. Prices shown are per night.`
          : 'Choose a room type for this stay. Prices shown are per night.';
    }

    if (!items.length) {
      roomTypePicker.innerHTML =
        '<p class="admin-walkin-hint">No room types are available for these dates — try different check-in or check-out dates.</p>';
      syncWalkInTypesStepState();
      return;
    }

    roomTypePicker.innerHTML = Array.from({ length: count }, (_, index) =>
      renderWalkInTypeSlot(index, items, count)
    ).join('');

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
    updateWalkInAvailabilityNotice();
    if (nextBtn && wizardStep === 'types') {
      nextBtn.disabled = !canProceedFromTypesStep();
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

  function isWalkInChannel() {
    return String(document.getElementById('walkInChannel')?.value || '') === 'WalkIn';
  }

  function walkInArrivalDiscountSelection() {
    return String(document.getElementById('walkInArrivalDiscount')?.value || 'None');
  }

  function isOnWalkInPromoRate() {
    if (isThirdPartyChannel()) return false;
    return getWalkInTypeSelections().filter(Boolean).some((typeId) => Boolean(walkInOfferForType(typeId)));
  }

  function walkInArrivalDiscountActive() {
    if (!isWalkInChannel()) return false;
    if (isOnWalkInPromoRate()) return false;
    const selection = walkInArrivalDiscountSelection();
    return selection === 'SeniorCitizen' || selection === 'Pwd';
  }

  function walkInArrivalDiscountAmount(staySubtotal) {
    if (!walkInArrivalDiscountActive() || !(staySubtotal > 0)) return 0;
    return Math.round(staySubtotal * WALK_IN_ARRIVAL_DISCOUNT_RATE * 100) / 100;
  }

  function walkInArrivalDiscountLabel() {
    const selection = walkInArrivalDiscountSelection();
    if (selection === 'SeniorCitizen') return 'Senior Citizen discount (20%)';
    if (selection === 'Pwd') return 'PWD discount (20%)';
    return '';
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
          'Senior / PWD 20% discount applies to Walk-in channel only. Agoda and RedDoorz use standard OTA rates.';
      } else if (onPromo) {
        hint.textContent = 'Senior / PWD cannot combine with an active walk-in promo rate.';
      } else {
        hint.textContent =
          'Walk-in channel: 20% is deducted from the stay when Senior or PWD is selected (verify ID on arrival).';
      }
    }
  }

  function parseMoneyInput(value) {
    const cleaned = String(value || '').replace(/[^\d.]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isCashPaymentMethod(method) {
    return String(method || 'Cash') === 'Cash';
  }

  function syncWalkInPaymentPanels() {
    const method = String(paymentMethod?.value || 'Cash');
    const cash = isCashPaymentMethod(method);
    const promoCashOnly =
      !isThirdPartyChannel()
      && roomTypes.some(
        (type) => typeRemaining(type.roomTypeId) > 0 && Boolean(walkInOfferForType(type.roomTypeId))
      );
    if (paymentMethod && promoCashOnly) {
      paymentMethod.value = 'Cash';
      paymentMethod.querySelectorAll('option').forEach((option) => {
        if (option.value !== 'Cash') option.disabled = true;
      });
    } else if (paymentMethod) {
      paymentMethod.querySelectorAll('option').forEach((option) => {
        option.disabled = false;
      });
    }
    const effectiveCash = isCashPaymentMethod(paymentMethod?.value || 'Cash');
    if (paymentCashDueWrap) paymentCashDueWrap.hidden = !effectiveCash;
    if (paymentCashTenderWrap) paymentCashTenderWrap.hidden = !effectiveCash;
    if (paymentChange) paymentChange.hidden = !effectiveCash;
    if (paymentDigitalWrap) paymentDigitalWrap.hidden = effectiveCash;
    if (paymentDigitalHint) paymentDigitalHint.hidden = effectiveCash;
    syncWalkInPaymentChange();
  }

  function syncWalkInPaymentChange() {
    const total = computeGrandTotal();
    if (paymentDue) paymentDue.value = money(total).replace('₱', '');
    const method = String(paymentMethod?.value || 'Cash');
    if (!isCashPaymentMethod(method)) {
      if (paymentDigitalAmount && !paymentDigitalAmount.value.trim()) {
        paymentDigitalAmount.value = total > 0 ? total.toFixed(2) : '';
      }
      return;
    }
    const tendered = parseMoneyInput(paymentTendered?.value);
    const change = Math.max(0, tendered - total);
    if (paymentChange) {
      paymentChange.hidden = false;
      paymentChange.textContent = `Change: ${money(change)}`;
    }
  }

  function estimatedStayTotal() {
    const count = roomsNeeded();
    const nights = nightCount();
    if (count < 1 || nights < 1) return 0;
    const available = roomTypes.filter((type) => typeRemaining(type.roomTypeId) > 0);
    if (!available.length) return 0;
    const cheapest = Math.min(
      ...available.map((type) => effectiveNightlyRate(type.roomTypeId, type.pricePerNight))
    );
    return cheapest * nights * count;
  }

  function computeStaySubtotal() {
    const nights = nightCount();
    const assignments = selectedAssignments().filter((item) => item.roomId);
    if (assignments.length) {
      let stay = 0;
      assignments.forEach((item) => {
        const room = rooms.find((r) => r.id === item.roomId);
        const type = roomTypes.find((t) => t.roomTypeId === (room?.roomTypeId || item.typeId));
        const typeId = Number(type?.roomTypeId || room?.roomTypeId || item.typeId || 0);
        const listPrice = Number(room?.pricePerNight || type?.pricePerNight || 0);
        const rate = effectiveNightlyRate(typeId, listPrice);
        stay += rate * Math.max(1, nights);
      });
      return stay;
    }
    const selections = getWalkInTypeSelections().filter((id) => id > 0);
    if (selections.length) {
      let stay = 0;
      selections.forEach((typeId) => {
        const type = roomTypes.find((t) => t.roomTypeId === typeId);
        if (!type) return;
        stay += effectiveNightlyRate(typeId, type.pricePerNight) * Math.max(1, nights);
      });
      return stay;
    }
    return estimatedStayTotal();
  }

  function computeGrandTotal() {
    const count = roomsNeeded();
    const nights = nightCount();
    const assignments = selectedAssignments().filter((item) => item.roomId);
    const stay = computeStaySubtotal();
    const typeCount = getWalkInTypeSelections().filter(Boolean).length;
    const feeRooms = Math.max(count, assignments.length || typeCount);
    const early = earlyFee(feeRooms);
    const late = lateFee(feeRooms);
    const extra = extraPersonFee();
    const arrivalDiscount = walkInArrivalDiscountAmount(stay);
    return stay - arrivalDiscount + early + late + extra;
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

  function syncGuestsContinueState() {
    const over = guestRoomsOverCapacity();
    if (guestsSubmitBtn) {
      guestsSubmitBtn.disabled = over;
      guestsSubmitBtn.title = over
        ? 'Guests exceed room capacity. Add another room or reduce guests to continue.'
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
        const wouldUseExtra = total >= BASE_GUESTS_PER_ROOM;
        const extraBlocked = wouldUseExtra && !roomHasExtraGuest(room) && bookingAlreadyUsesExtra(index);
        const canInc = total < MAX_GUESTS_PER_ROOM && !extraBlocked;
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
                <span class="guest-guests-ages-label">${room.children} child${room.children === 1 ? '' : "ren"}'s age</span>
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
        const tooltipMsg = extraBlocked
          ? 'Only one extra guest (₱200/night) is allowed per booking.'
          : `Maximum ${MAX_GUESTS_PER_ROOM} guests per room. Please add another room for additional guests.`;
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
    if (delta > 0 && currentTotal >= BASE_GUESTS_PER_ROOM && !roomHasExtraGuest(room) && bookingAlreadyUsesExtra(roomIndex)) {
      showGuestsHint('Only one extra guest (₱200/night) is allowed per booking.');
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
    const inDate = checkInDate?.value || '';
    const outDate = checkOutDate?.value || '';
    if (!inDate || !outDate) return 0;
    const start = new Date(`${inDate}T12:00:00`);
    const end = new Date(`${outDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  }

  function earlyFee(count) {
    if (count < 1) return 0;
    return checkInTime?.value === EARLY_CHECKIN_TIME ? EARLY_FEE * count : 0;
  }

  function lateHours() {
    const time = checkOutTime?.value || DEFAULT_CHECKOUT_TIME;
    if (!time || time <= DEFAULT_CHECKOUT_TIME) return 0;
    const [h, m] = time.split(':').map(Number);
    const [bh, bm] = DEFAULT_CHECKOUT_TIME.split(':').map(Number);
    const minutes = h * 60 + m - (bh * 60 + bm);
    if (minutes <= 0) return 0;
    return Math.min(MAX_LATE_HOURS, Math.round(minutes / 60));
  }

  function lateFee(count) {
    if (count < 1) return 0;
    return lateHours() * LATE_FEE_PER_HOUR * count;
  }

  function roomHasExtraGuest(room) {
    const total = (Number(room?.adults) || 0) + (Number(room?.children) || 0);
    return total > BASE_GUESTS_PER_ROOM;
  }

  function bookingAlreadyUsesExtra(exceptRoomIndex = -1) {
    return guestRooms.some((room, index) => {
      if (index === exceptRoomIndex) return false;
      return roomHasExtraGuest(room);
    });
  }

  function extraPersonsFromGuests() {
    const raw = guestRooms.reduce((sum, room) => {
      const total = (Number(room.adults) || 0) + (Number(room.children) || 0);
      return sum + Math.max(0, total - BASE_GUESTS_PER_ROOM);
    }, 0);
    return Math.min(MAX_EXTRA_PERSONS, raw);
  }

  function extraPersonFee() {
    if (!extraPersonInput?.checked) return 0;
    return 200 * Math.max(1, nightCount());
  }

  function syncExtraPersonOption() {
    const fromGuests = extraPersonsFromGuests() > 0;
    if (extraPersonWrap) extraPersonWrap.hidden = false;
    if (extraPersonInput) {
      if (fromGuests) extraPersonInput.checked = true;
      extraPersonInput.disabled = fromGuests;
    }
  }

  function fillTimeOptions() {
    const count = Math.max(1, roomsNeeded());
    if (checkInTime) {
      const prev = checkInTime.value || DEFAULT_CHECKIN_TIME;
      checkInTime.innerHTML = [
        `<option value="${EARLY_CHECKIN_TIME}">${EARLY_CHECKIN_TIME} — ${money(EARLY_FEE * count)} early (${money(EARLY_FEE)} × ${count})</option>`,
        ...FREE_CHECKIN_TIMES.map((t) => `<option value="${t}">${t} — free of charge</option>`),
      ].join('');
      checkInTime.value = [...checkInTime.options].some((o) => o.value === prev)
        ? prev
        : DEFAULT_CHECKIN_TIME;
    }
    if (checkOutTime) {
      const prev = checkOutTime.value || DEFAULT_CHECKOUT_TIME;
      const options = [
        `<option value="${DEFAULT_CHECKOUT_TIME}">${DEFAULT_CHECKOUT_TIME} — free of charge</option>`,
      ];
      for (let hour = 1; hour <= MAX_LATE_HOURS; hour += 1) {
        const [bh, bm] = DEFAULT_CHECKOUT_TIME.split(':').map(Number);
        const total = bh * 60 + bm + hour * 60;
        const hh = String(Math.floor(total / 60)).padStart(2, '0');
        const mm = String(total % 60).padStart(2, '0');
        const time = `${hh}:${mm}`;
        const fee = LATE_FEE_PER_HOUR * hour * count;
        options.push(
          `<option value="${time}">${time} — ${money(fee)} late (+${hour}h × ${count} room${count === 1 ? '' : 's'})</option>`
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
    if (early) parts.push(`Early check-in ${money(early)}`);
    if (late) parts.push(`Late check-out ${money(late)}`);
    timeFeesHint.hidden = false;
    timeFeesHint.textContent = `${parts.join(' · ')} (${count} room${count === 1 ? '' : 's'})`;
  }

  function selectedAssignments() {
    const count = roomsNeeded();
    return Array.from({ length: count }, (_, index) => {
      let roomId = 0;
      if (roomSlots) {
        const slot = roomSlots.querySelector(`[data-slot][data-slot-index="${index}"]`);
        roomId = Number(slot?.querySelector('[data-slot-room]')?.value || 0);
      }
      return {
        index,
        typeId: Number(walkInTypeSelections[index] || 0),
        roomId,
      };
    });
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
    if (!isoDate) return '';
    const parts = String(isoDate).split('-').map(Number);
    if (parts.length < 3) return isoDate;
    const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

    if (totalRemaining < needed) {
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

  function syncWalkInRoomsStepState() {
    updateWalkInAvailabilityNotice();
    const canAssign = totalRemainingInventory() >= roomsNeeded();
    if (nextBtn && wizardStep === 'rooms') {
      nextBtn.disabled = !canAssign;
    }
  }

  function typeRemaining(typeId) {
    if (remainingByType.has(typeId)) return Number(remainingByType.get(typeId) || 0);
    // Fallback before availability loads: count Available physical rooms.
    return rooms.filter((room) => room.roomTypeId === typeId && room.status === 'Available').length;
  }

  function availableRoomsForType(typeId, excludeIds = []) {
    return rooms.filter(
      (room) =>
        room.roomTypeId === typeId
        && room.status === 'Available'
        && !excludeIds.includes(room.id)
    );
  }

  function refreshSlotRoomOptions(slot, preferredRoomId = null) {
    const slotIndex = Number(slot.dataset.slotIndex || 0);
    const roomSelect = slot.querySelector('[data-slot-room]');
    if (!roomSelect) return;
    const typeId = Number(walkInTypeSelections[slotIndex] || slot.querySelector('[data-slot-type]')?.value || 0);
    const selectedElsewhere = selectedAssignments()
      .filter((item) => item.index !== slotIndex)
      .map((item) => item.roomId)
      .filter(Boolean);
    const current = preferredRoomId || Number(roomSelect.value || 0);
    const options = availableRoomsForType(typeId, selectedElsewhere.filter((id) => id !== current));
    roomSelect.innerHTML = typeId
      ? '<option value="">Select room number…</option>'
      : '<option value="">Select a room type first…</option>';
    options.forEach((room) => {
      const option = document.createElement('option');
      option.value = String(room.id);
      option.textContent = room.roomNumber;
      roomSelect.append(option);
    });
    if (current && options.some((room) => room.id === current)) {
      roomSelect.value = String(current);
    } else if (typeId && !options.length) {
      roomSelect.innerHTML = '<option value="">No available rooms</option>';
    }
  }

  function refreshAllSlotOptions() {
    roomSlots?.querySelectorAll('[data-slot]').forEach((slot) => {
      const roomSelect = slot.querySelector('[data-slot-room]');
      refreshSlotRoomOptions(slot, Number(roomSelect?.value || 0));
    });
  }

  function bindSlot(slot) {
    slot.querySelector('[data-slot-room]')?.addEventListener('change', () => {
      refreshAllSlotOptions();
      refreshTotals();
    });
  }

  function formatWalkInSlotTypeLabel(typeId) {
    const type = roomTypes.find((item) => item.roomTypeId === typeId);
    if (!type) return 'Room type not selected';
    const rate = effectiveNightlyRate(type.roomTypeId, type.pricePerNight);
    return `${type.name} · ${money(rate)}/night · max ${type.maxOccupancy}`;
  }

  function renderRoomSlots() {
    if (!roomSlots) return;
    const previous = selectedAssignments();
    const count = roomsNeeded();
    syncWalkInTypeSelectionLength();

    roomSlots.replaceChildren();
    for (let i = 0; i < count; i += 1) {
      const prev = previous[i];
      const typeId = Number(walkInTypeSelections[i] || prev?.typeId || 0);
      const slot = document.createElement('article');
      slot.className = 'guest-guests-room admin-walkin-slot';
      slot.dataset.slot = 'true';
      slot.dataset.slotIndex = String(i);
      slot.innerHTML = `
        <div class="guest-guests-room-head">
          <h3>Room ${i + 1}</h3>
        </div>
        <p class="admin-walkin-slot-type-label">${escapeHtml(formatWalkInSlotTypeLabel(typeId))}</p>
        <input type="hidden" data-slot-type value="${typeId || ''}" />
          <label>
            <span>Room number</span>
            <select data-slot-room required>
            <option value="">Select room number…</option>
            </select>
          </label>
      `;
      bindSlot(slot);
      roomSlots.append(slot);
      refreshSlotRoomOptions(slot, prev?.roomId || null);
    }
    if (!allWalkInTypesSelected() || totalRemainingInventory() < count) {
      const soldOutMessages = buildSoldOutTypeMessages();
      if (!allWalkInTypesSelected()) {
      roomSlots.innerHTML =
          '<p class="guest-guests-rule">Go back to Room type and select a room type for each room in the party.</p>';
      } else if (soldOutMessages.length) {
        roomSlots.innerHTML = `<p class="guest-guests-rule">${escapeHtml(soldOutMessages.join(' '))}</p>`;
      } else if (totalRemainingInventory() < count) {
        roomSlots.innerHTML =
          '<p class="guest-guests-rule">No room types are available for these dates — try different check-in or check-out dates.</p>';
      }
    }
    if (roomsIntro) {
      roomsIntro.textContent = `Assign ${count} available room${count === 1 ? '' : 's'} for this party of ${guestCount()}. Remaining counts include pending and confirmed holds.`;
    }
    syncWalkInRoomsStepState();
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
      const item = selectedAssignments()[i];
      if (item?.roomId) {
      const room = rooms.find((r) => r.id === item.roomId);
      const type = roomTypes.find((t) => t.roomTypeId === (room?.roomTypeId || item.typeId));
        sum += Number(type?.maxOccupancy || room?.maxOccupancy || MAX_GUESTS_PER_ROOM);
        continue;
      }
      const typeId = Number(walkInTypeSelections[i] || 0);
      if (!typeId) continue;
      sum += effectiveRoomTypeCapacity(typeId);
    }
    return sum;
  }

  function refreshTotals() {
    rebuildWalkInOffersByType();
    const count = roomsNeeded();
    const nights = nightCount();
    const assignments = selectedAssignments().filter((item) => item.roomId);
    const stay = computeStaySubtotal();
    const typeCount = getWalkInTypeSelections().filter(Boolean).length;
    const feeRooms = Math.max(count, assignments.length || typeCount);
    const early = earlyFee(feeRooms);
    const late = lateFee(feeRooms);
    syncExtraPersonOption();
    const extra = extraPersonFee();
    const arrivalDiscount = walkInArrivalDiscountAmount(stay);
    const total = computeGrandTotal();
    const usingEstimate = !allWalkInTypesSelected() && assignments.length === 0 && wizardStep !== 'payment';
    const typeIdsForPromo = assignments.length
      ? assignments.map((item) =>
          Number(item.typeId || rooms.find((r) => r.id === item.roomId)?.roomTypeId || 0)
        )
      : getWalkInTypeSelections();

    if (feeBreakdown) {
      const lines = [];
      if (nights > 0) {
        const promoNote =
          !isThirdPartyChannel()
          && typeIdsForPromo.some((typeId) => Boolean(walkInOfferForType(typeId)))
            ? ' · special offer'
            : '';
        const roomLabel = assignments.length || typeCount || count;
        const stayLabel = usingEstimate
          ? `Stay estimate (${nights} night${nights === 1 ? '' : 's'} × ${roomLabel} room${roomLabel === 1 ? '' : 's'}${promoNote})`
          : `Stay (${nights} night${nights === 1 ? '' : 's'} × ${roomLabel} room${roomLabel === 1 ? '' : 's'}${promoNote})`;
        lines.push(
          `<div><span>${stayLabel}</span><strong>${stay > 0 ? money(stay) : '—'}</strong></div>`
        );
      }
      if (arrivalDiscount > 0) {
        lines.push(
          `<div class="admin-walkin-discount-row"><span>${walkInArrivalDiscountLabel()}</span><strong>−${money(arrivalDiscount).replace(/^₱/, '')}</strong></div>`
        );
      }
      if (early > 0) lines.push(`<div><span>Early check-in (11:30 AM)</span><strong>${money(early)}</strong></div>`);
      if (late > 0) lines.push(`<div><span>Late check-out (+${lateHours()}h)</span><strong>${money(late)}</strong></div>`);
      if (extra > 0) lines.push(`<div><span>Extra person</span><strong>${money(extra)}</strong></div>`);
      if (!lines.length) lines.push('<div><span>Set stay dates to see pricing</span><strong>—</strong></div>');
      feeBreakdown.innerHTML = lines.join('');
    }

    const hold = capacityHold();
    const guests = guestCount();
    if (capacityWarn) {
      const roomsAssigned = assignments.length === count;
      const typesReady = allWalkInTypesSelected();
      if ((roomsAssigned || typesReady) && hold > 0 && guests > hold) {
        capacityWarn.hidden = false;
        capacityWarn.textContent = `Party of ${guests} exceeds selected rooms’ capacity (${hold}). Choose larger types or add rooms.`;
      } else {
        capacityWarn.hidden = true;
      }
    }

    if (confirmLabel) confirmLabel.textContent = `${partySummaryText()} · PH time fees included`;
    if (confirmTotal) confirmTotal.textContent = money(total);
    if (partySummary) partySummary.textContent = partySummaryText();
    refreshFeeHint();
    syncWalkInArrivalDiscountUi();
    syncWalkInPaymentPanels();
  }

  async function setWizardStep(step) {
    if (!STEPS.includes(step)) return;
    wizardStep = step;
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
    const isLast = step === 'rooms';
    if (backBtn) {
      backBtn.hidden = false;
      backBtn.textContent = isFirst ? 'Back to guests' : 'Back';
    }
    if (nextBtn) nextBtn.hidden = isLast;
    if (submitBtn) submitBtn.hidden = !isLast;
    if (nextBtn && step !== 'rooms') nextBtn.disabled = false;
    showFormMessage('');

    if (step === 'rooms' || step === 'payment' || step === 'types' || step === 'dates') {
      await refreshDateAvailability();
    }
    if (step === 'types') {
      renderWalkInTypePicker();
      refreshTotals();
    }
    if (step === 'payment') {
      refreshTotals();
      syncWalkInPaymentPanels();
    }
    if (step === 'rooms') {
      renderRoomSlots();
      refreshTotals();
      syncWalkInRoomsStepState();
    }
    if (step === 'dates') refreshTotals();
  }

  function validateStep(step) {
    if (step === 'guest') {
      const name = String(document.getElementById('walkInGuestName')?.value || '').trim();
      const email = String(document.getElementById('walkInGuestEmail')?.value || '').trim();
      const phone = String(document.getElementById('walkInGuestPhone')?.value || '').trim();
      if (!name || !email || !phone) {
        showFormMessage('Enter lead guest name, email, and phone.', true);
        return false;
      }
      return true;
    }
    if (step === 'dates') {
      if (nightCount() < 1) {
        showFormMessage('Check-out must be after check-in.', true);
        return false;
      }
      return true;
    }
    if (step === 'types') {
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
    if (step === 'payment') {
      const channel = String(document.getElementById('walkInChannel')?.value || '');
      if (!channel) {
        showFormMessage('Select a booking channel (Walk-in, Agoda, or RedDoorz).', true);
        return false;
      }
      if (totalRemainingInventory() < roomsNeeded()) {
        updateWalkInAvailabilityNotice();
        const notice = document.querySelector('[data-walkin-availability-notice]');
        showFormMessage(
          notice?.textContent ||
            'No rooms are available for these dates. Try different dates or room types.',
          true
        );
        return false;
      }
      const total = computeGrandTotal();
      if (total <= 0) {
        showFormMessage('Set valid stay dates to see the amount due.', true);
        return false;
      }
      const method = String(paymentMethod?.value || 'Cash');
      if (isCashPaymentMethod(method)) {
        const tendered = parseMoneyInput(paymentTendered?.value);
        if (tendered < total - 0.009) {
          showFormMessage(`Cash tender must cover ${money(total)} due.`, true);
          return false;
        }
      } else {
        const digital = parseMoneyInput(paymentDigitalAmount?.value);
        if (digital <= 0) {
          showFormMessage('Enter the amount received from the guest.', true);
          return false;
        }
      }
      return true;
    }
    if (step === 'rooms') {
      const assignments = selectedAssignments();
      if (assignments.length !== roomsNeeded() || assignments.some((item) => !item.roomId || !item.typeId)) {
        showFormMessage(`Select a room number for all ${roomsNeeded()} room${roomsNeeded() === 1 ? '' : 's'}.`, true);
        return false;
      }
      const hold = capacityHold();
      if (guestCount() > hold) {
        showFormMessage(`Party of ${guestCount()} exceeds selected rooms’ capacity (${hold}).`, true);
        return false;
      }
      const selectedByType = new Map();
      assignments.forEach((item) => {
        selectedByType.set(item.typeId, (selectedByType.get(item.typeId) || 0) + 1);
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
    renderGuestsRooms();
    closeModal(bookModal);
    closeModal(successModal);
    openModal(guestsModal);
    loadInventory().catch((error) => {
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
    closeModal(guestsModal);
    resetDates();
    walkInTypeSelections = [];
    const channelEl = document.getElementById('walkInChannel');
    if (channelEl) channelEl.value = '';
    if (partySummary) partySummary.textContent = partySummaryText();
    setWizardStep('guest');
    if (paymentTendered) paymentTendered.value = '';
    if (paymentDigitalAmount) paymentDigitalAmount.value = '';
    if (paymentMethod) paymentMethod.value = 'Cash';
    openModal(bookModal);
    refreshTotals();
  }

  openBtn?.addEventListener('click', () => openWalkInFlow());

  roomTypePicker?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-walkin-pick-type]');
    if (!btn || btn.disabled) return;
    event.preventDefault();
    const roomIndex = Number(btn.getAttribute('data-walkin-room-index'));
    const typeId = Number(btn.getAttribute('data-walkin-pick-type'));
    if (!typeId) return;
    selectWalkInType(roomIndex, typeId);
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
  });

  document.querySelectorAll('[data-walkin-close]').forEach((el) => {
    el.addEventListener('click', () => closeAllWalkInModals());
  });

  successDoneBtn?.addEventListener('click', () => closeAllWalkInModals());

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
    el?.addEventListener('change', async () => {
      if (el === checkInDate && checkOutDate && checkOutDate.value < checkInDate.value) {
        checkOutDate.value = checkInDate.value;
      }
      fillTimeOptions();
      await refreshDateAvailability();
      if (wizardStep === 'types') {
        renderWalkInTypePicker();
      }
      if (wizardStep === 'rooms') {
        renderRoomSlots();
        syncWalkInRoomsStepState();
      }
      refreshTotals();
    });
  });

  extraPersonInput?.addEventListener('change', () => refreshTotals());

  document.getElementById('walkInChannel')?.addEventListener('change', () => {
    if (wizardStep === 'types') renderWalkInTypePicker();
    if (wizardStep === 'rooms') renderRoomSlots();
    refreshTotals();
    syncWalkInPaymentPanels();
  });

  document.getElementById('walkInArrivalDiscount')?.addEventListener('change', () => refreshTotals());

  paymentMethod?.addEventListener('change', () => {
    syncWalkInPaymentPanels();
    refreshTotals();
  });
  paymentTendered?.addEventListener('input', () => syncWalkInPaymentChange());
  paymentDigitalAmount?.addEventListener('input', () => syncWalkInPaymentChange());

  bookForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (
      !validateStep('guest')
      || !validateStep('dates')
      || !validateStep('types')
      || !validateStep('payment')
      || !validateStep('rooms')
    ) {
      if (!validateStep('guest')) setWizardStep('guest');
      else if (!validateStep('dates')) setWizardStep('dates');
      else if (!validateStep('types')) setWizardStep('types');
      else if (!validateStep('payment')) setWizardStep('payment');
      else setWizardStep('rooms');
      return;
    }

    const assignments = selectedAssignments();
    const byType = new Map();
    assignments.forEach((item) => {
      const list = byType.get(item.typeId) || [];
      list.push(item.roomId);
      byType.set(item.typeId, list);
    });
    const payloadAssignments = Array.from(byType.entries()).map(([roomTypeId, roomIds]) => ({
      roomTypeId,
      roomIds,
    }));

    const finalTotal = computeGrandTotal();
    const payMethod = String(paymentMethod?.value || 'Cash');
    if (isCashPaymentMethod(payMethod)) {
      const tendered = parseMoneyInput(paymentTendered?.value);
      if (tendered < finalTotal - 0.009) {
        showFormMessage(
          `Room assignment changed the total to ${money(finalTotal)}. Go back to Payment and update cash tender.`,
          true
        );
        await setWizardStep('payment');
        return;
      }
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.originalText = submitBtn.textContent || '';
      submitBtn.textContent = 'Saving…';
    }

    try {
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
          extraPersons: extraPersonInput?.checked ? 1 : 0,
          assignments: payloadAssignments,
          channel: String(document.getElementById('walkInChannel')?.value || ''),
          arrivalDiscountRequest: String(document.getElementById('walkInArrivalDiscount')?.value || 'None'),
        }),
      });

      const balanceDue = Math.max(0, Number(booking.totalAmount || 0));
      let payAmount = balanceDue;
      if (!isCashPaymentMethod(payMethod)) {
        payAmount = Math.min(balanceDue, parseMoneyInput(paymentDigitalAmount?.value));
      }
      if (payAmount > 0) {
        await apiFetch('/api/admin/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingId: booking.id,
            eventType: 'ArrivalPayment',
            method: payMethod,
            amount: payAmount,
          }),
        });
      }

      closeModal(bookModal);
      if (successMessage) {
        successMessage.textContent = `${booking.reference} confirmed · ${roomsNeeded()} room${roomsNeeded() === 1 ? '' : 's'} · ${money(booking.totalAmount)}.`;
      }
      openModal(successModal);
      window.setTimeout(() => {
        window.location.href = `/AdminBookings?booking=${booking.id}`;
      }, 900);
    } catch (error) {
      showFormMessage(error instanceof Error ? error.message : 'Unable to save walk-in.', true);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.originalText || 'Confirm walk-in';
      }
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
