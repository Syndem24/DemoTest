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
  const confirmLabel = document.getElementById('walkInConfirmLabel');
  const confirmTotal = document.getElementById('walkInConfirmTotal');
  const feeBreakdown = document.getElementById('walkInFeeBreakdown');
  const backBtn = document.getElementById('walkInWizardBackBtn');
  const nextBtn = document.getElementById('walkInWizardNextBtn');
  const submitBtn = document.getElementById('walkInSubmitBtn');
  const successMessage = document.getElementById('walkInSuccessMessage');
  const successDoneBtn = document.getElementById('walkInSuccessDoneBtn');
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
  const FREE_CHECKIN_TIMES = ['14:00', '14:30', '15:00', '15:30', '16:00'];
  const STEPS = ['guest', 'dates', 'rooms', 'confirm'];

  /** @type {{ adults: number, children: number, childAges: (number|null)[] }[]} */
  let guestRooms = [{ adults: 2, children: 0, childAges: [] }];
  /** @type {Array<{id:number,roomTypeId:number,roomNumber:string,pricePerNight:number,status:string,maxOccupancy:number}>} */
  let rooms = [];
  /** @type {Array<{roomTypeId:number,name:string,pricePerNight:number,maxOccupancy:number}>} */
  let roomTypes = [];
  /** @type {Map<number, number>} */
  let remainingByType = new Map();
  let wizardStep = 'guest';
  let lastFocused = null;
  let guestsHintTimer = null;
  let inventoryReady = false;

  function money(value) {
    return `₱${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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
    if (!roomSlots) return [];
    return Array.from(roomSlots.querySelectorAll('[data-slot]')).map((slot, index) => {
      const typeId = Number(slot.querySelector('[data-slot-type]')?.value || 0);
      const roomId = Number(slot.querySelector('[data-slot-room]')?.value || 0);
      return { index, typeId, roomId };
    });
  }

  async function refreshDateAvailability() {
    if (!checkInDate?.value || !checkOutDate?.value) {
      remainingByType = new Map();
      return;
    }
    try {
      const query = new URLSearchParams({
        checkInAtUtc: toManilaIso(checkInDate.value, checkInTime?.value || DEFAULT_CHECKIN_TIME),
        checkoutTimeUtc: toManilaIso(checkOutDate.value, checkOutTime?.value || DEFAULT_CHECKOUT_TIME),
      });
      const items = await apiFetch(`/api/bookings/availability?${query}`);
      remainingByType = new Map(
        (Array.isArray(items) ? items : []).map((item) => [
          Number(item.roomTypeId),
          Number(item.remaining || 0),
        ])
      );
    } catch {
      remainingByType = new Map();
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
    const typeSelect = slot.querySelector('[data-slot-type]');
    const roomSelect = slot.querySelector('[data-slot-room]');
    if (!typeSelect || !roomSelect) return;
    const typeId = Number(typeSelect.value || 0);
    const selectedElsewhere = selectedAssignments()
      .filter((item) => item.index !== Number(slot.dataset.slotIndex))
      .map((item) => item.roomId)
      .filter(Boolean);
    const current = preferredRoomId || Number(roomSelect.value || 0);
    const options = availableRoomsForType(typeId, selectedElsewhere.filter((id) => id !== current));
    roomSelect.innerHTML = typeId
      ? '<option value="">Select room number…</option>'
      : '<option value="">Select a type first…</option>';
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
    slot.querySelector('[data-slot-type]')?.addEventListener('change', () => {
      refreshSlotRoomOptions(slot);
      refreshAllSlotOptions();
      refreshTotals();
    });
    slot.querySelector('[data-slot-room]')?.addEventListener('change', () => {
      refreshAllSlotOptions();
      refreshTotals();
    });
  }

  function renderRoomSlots() {
    if (!roomSlots) return;
    const previous = selectedAssignments();
    const count = roomsNeeded();
    const types = roomTypes.filter((type) => typeRemaining(type.roomTypeId) > 0
      || rooms.some((room) => room.roomTypeId === type.roomTypeId && room.status === 'Available'));

    roomSlots.replaceChildren();
    for (let i = 0; i < count; i += 1) {
      const prev = previous[i];
      const slot = document.createElement('article');
      slot.className = 'guest-guests-room admin-walkin-slot';
      slot.dataset.slot = 'true';
      slot.dataset.slotIndex = String(i);
      slot.innerHTML = `
        <div class="guest-guests-room-head">
          <h3>Room ${i + 1}</h3>
        </div>
        <div class="guest-form-grid guest-form-grid-2">
          <label>
            <span>Room type</span>
            <select data-slot-type required>
              <option value="">Select type…</option>
            </select>
          </label>
          <label>
            <span>Room number</span>
            <select data-slot-room required>
              <option value="">Select a type first…</option>
            </select>
          </label>
        </div>
      `;
      const typeSelect = slot.querySelector('[data-slot-type]');
      types.forEach((type) => {
        const remaining = typeRemaining(type.roomTypeId);
        const option = document.createElement('option');
        option.value = String(type.roomTypeId);
        option.textContent = `${type.name} · ${money(type.pricePerNight)}/night · ${remaining} left for dates · max ${type.maxOccupancy}`;
        option.disabled = remaining < 1;
        typeSelect.append(option);
      });
      if (prev?.typeId && !typeSelect.querySelector(`option[value="${prev.typeId}"]`)?.disabled) {
        typeSelect.value = String(prev.typeId);
      }
      bindSlot(slot);
      roomSlots.append(slot);
      refreshSlotRoomOptions(slot, prev?.roomId || null);
    }
    if (!types.length || types.every((type) => typeRemaining(type.roomTypeId) < 1)) {
      roomSlots.innerHTML =
        '<p class="guest-guests-rule">No room types left for these dates — another booking or reservation may already hold them.</p>';
    }
    if (roomsIntro) {
      roomsIntro.textContent = `Assign ${count} available room${count === 1 ? '' : 's'} for this party of ${guestCount()}. Remaining counts include pending and confirmed holds.`;
    }
  }

  function capacityHold() {
    return selectedAssignments().reduce((sum, item) => {
      if (!item.roomId) return sum;
      const room = rooms.find((r) => r.id === item.roomId);
      const type = roomTypes.find((t) => t.roomTypeId === (room?.roomTypeId || item.typeId));
      return sum + Number(type?.maxOccupancy || room?.maxOccupancy || MAX_GUESTS_PER_ROOM);
    }, 0);
  }

  function refreshTotals() {
    const count = roomsNeeded();
    const nights = nightCount();
    const assignments = selectedAssignments().filter((item) => item.roomId);
    let stay = 0;
    assignments.forEach((item) => {
      const room = rooms.find((r) => r.id === item.roomId);
      const type = roomTypes.find((t) => t.roomTypeId === (room?.roomTypeId || item.typeId));
      const rate = Number(room?.pricePerNight || type?.pricePerNight || 0);
      stay += rate * Math.max(1, nights);
    });
    const feeRooms = Math.max(count, assignments.length);
    const early = earlyFee(feeRooms);
    const late = lateFee(feeRooms);
    syncExtraPersonOption();
    const extra = extraPersonFee();
    const total = stay + early + late + extra;

    if (feeBreakdown) {
      const lines = [];
      if (nights > 0) {
        lines.push(`<div><span>Stay (${nights} night${nights === 1 ? '' : 's'} × ${assignments.length || count} room${(assignments.length || count) === 1 ? '' : 's'})</span><strong>${assignments.length ? money(stay) : '—'}</strong></div>`);
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
      if (assignments.length === count && hold > 0 && guests > hold) {
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
    const isLast = step === 'confirm';
    if (backBtn) {
      backBtn.hidden = false;
      backBtn.textContent = isFirst ? 'Back to guests' : 'Back';
    }
    if (nextBtn) nextBtn.hidden = isLast;
    if (submitBtn) submitBtn.hidden = !isLast;
    showFormMessage('');

    if (step === 'rooms' || step === 'confirm' || step === 'dates') {
      await refreshDateAvailability();
    }
    if (step === 'rooms') {
      renderRoomSlots();
      refreshTotals();
    }
    if (step === 'confirm' || step === 'dates') refreshTotals();
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
    const [typePayload, roomPayload] = await Promise.all([
      apiFetch('/api/rooms/types'),
      apiFetch('/api/rooms'),
    ]);

    roomTypes = (Array.isArray(typePayload) ? typePayload : []).map((type) => ({
      roomTypeId: Number(type.roomTypeId ?? type.id),
      name: type.name || type.roomTypeName || 'Room',
      pricePerNight: Number(type.pricePerNight || 0),
      maxOccupancy: Number(type.maxOccupancy || MAX_GUESTS_PER_ROOM),
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
    if (partySummary) partySummary.textContent = partySummaryText();
    setWizardStep('guest');
    openModal(bookModal);
    refreshTotals();
  }

  openBtn?.addEventListener('click', () => openWalkInFlow());

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
      if (wizardStep === 'rooms') renderRoomSlots();
      refreshTotals();
    });
  });

  extraPersonInput?.addEventListener('change', () => refreshTotals());

  bookForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateStep('guest') || !validateStep('dates') || !validateStep('rooms')) {
      if (!validateStep('guest')) setWizardStep('guest');
      else if (!validateStep('dates')) setWizardStep('dates');
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
        }),
      });

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
