const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'wwwroot/js/walk-in.js'), 'utf8');
const view = fs.readFileSync(path.join(__dirname, 'Views/Shared/_AdminWalkInModals.cshtml'), 'utf8');
const names = [
  'syncWalkInTypeSelectionLength', 'getWalkInTypeSelections', 'allWalkInTypesSelected',
  'clearUnavailableTypeSelections', 'walkInQuantityLimit', 'commitWalkInTypeSelections',
  'setWalkInTypeQuantity', 'effectiveRoomTypeCapacity', 'partyFitsSelectedTypes',
  'canProceedFromTypesStep', 'renderWalkInSelectionSummary', 'escapeHtml',
  'buildWalkInOfferTypeItems', 'renderWalkInTypeCard', 'renderWalkInTypePicker',
  'syncWalkInTypesStepState', 'typeRemaining', 'focusWalkInType',
  'closeWalkInQuantity', 'syncWalkInQuantityControls', 'openWalkInQuantity',
];
const functions = names.map((name) => {
  const start = source.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}).join('\n');

function element() {
  return {
    value: '', hidden: false, disabled: false, innerHTML: '', textContent: '', style: {},
    classList: { toggle() {} },
    handlers: {},
    addEventListener(type, callback) { this.handlers[type] = callback; },
    setAttribute(name, value) { this[name] = value; },
    removeAttribute(name) { delete this[name]; },
    focus() { this.focused = true; },
    select() {},
  };
}

function setup(count = 3) {
  const plus = element();
  const minus = element();
  const cancel = element();
  plus.hasAttribute = (name) => name === 'data-walkin-quantity-plus';
  minus.hasAttribute = () => false;
  const roomTypePicker = element();
  roomTypePicker.querySelector = () => ({ querySelector: () => cancel });
  const context = vm.createContext({
    guestRooms: Array.from({ length: count }, () => ({ adults: 2, children: 0 })),
    roomTypes: [
      { roomTypeId: 1, name: 'Twin', pricePerNight: 1780, maxOccupancy: 2, bedCount: 2 },
      { roomTypeId: 2, name: 'Queen', pricePerNight: 3000, maxOccupancy: 3, bedCount: 1 },
    ],
    rooms: [], remainingByType: new Map([[1, 2], [2, 7]]), walkInTypeSelections: [],
    MAX_GUESTS_PER_ROOM: 3, wizardStep: 'types', quantityTypeId: 0, quantityMode: 'add',
    roomTypePicker, typeSelectionSummary: element(), typeSelectionProgress: element(),
    selectionDialog: element(), selectionGroups: element(), selectionTypes: element(),
    selectionCount: element(), selectionBarFill: element(),
    typesLede: element(), nextBtn: element(), backBtn: cancel,
    quantityForm: element(), quantityInput: element(), quantityTitle: element(),
    quantityHint: element(), quantityError: element(), quantityConfirm: element(),
    quantityDialog: Object.assign(element(), {
      open: false, showModal() { this.open = true; }, close() { this.open = false; },
      querySelector: (selector) => selector.includes('minus') ? minus : plus,
      querySelectorAll: (selector) => selector.includes('close') ? [cancel] : [minus, plus],
    }),
    clearedAssignments: 0, totalsUpdated: 0,
    walkInLimitedOfferForType: () => null, walkInOfferForType: () => null,
    effectiveNightlyRate: (_, price) => price, renderWalkInStayLongerRows: () => '',
    walkInOfferRatePriceHtml: (price) => String(price), isThirdPartyChannel: () => false,
    updateWalkInAvailabilityNotice() {},
  });
  vm.runInContext(`
    function roomsNeeded() { return guestRooms.length; }
    function guestCount() { return guestRooms.reduce((sum, room) => sum + room.adults + room.children, 0); }
    function totalRemainingInventory() { return [...remainingByType.values()].reduce((sum, n) => sum + n, 0); }
    function refreshTotals() { totalsUpdated += 1; }
    const roomSlots = { replaceChildren() { clearedAssignments += 1; } };
    ${functions}
  `, context);
  const start = source.indexOf("  roomTypePicker?.addEventListener('click'");
  const end = source.indexOf("  guestsAddRoomBtn?.addEventListener", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  context.renderWalkInTypePicker();
  return context;
}

const selections = (ctx) => Array.from(ctx.getWalkInTypeSelections());
function click(ctx, data) {
  const button = { dataset: data, disabled: false, hasAttribute(name) {
    return (name === 'data-walkin-edit-type' && 'walkinEditType' in data)
      || (name === 'data-walkin-remove-type' && 'walkinRemoveType' in data);
  } };
  ctx.roomTypePicker.handlers.click({ preventDefault() {}, target: { closest: () => button } });
}
function submit(ctx, value) {
  ctx.quantityInput.value = String(value);
  ctx.quantityForm.handlers.submit({ preventDefault() {} });
}

test('one card per type regardless of requested room count, with visible empty slots', () => {
  const ctx = setup(8);
  assert.equal((ctx.roomTypePicker.innerHTML.match(/data-walkin-type-card=/g) || []).length, 2);
  assert.equal((ctx.typeSelectionSummary.innerHTML.match(/Not selected/g) || []).length, 8);
  assert.equal(ctx.typeSelectionProgress.textContent, '0 of 8 selected · 8 remaining');
  assert.equal(ctx.nextBtn.disabled, true);
  assert.doesNotMatch(source, /renderWalkInTypeSlot|Selected · Room/);
});

test('same type can be added twice and mixed with another type', () => {
  const ctx = setup();
  click(ctx, { walkinPickType: '1' });
  assert.equal(ctx.quantityDialog.open, true);
  assert.equal(ctx.quantityInput.max, '2');
  submit(ctx, 1);
  click(ctx, { walkinPickType: '1' });
  assert.equal(ctx.quantityInput.max, '1');
  submit(ctx, 1);
  click(ctx, { walkinPickType: '2' });
  assert.equal(ctx.quantityInput.max, '1');
  submit(ctx, 1);
  assert.deepEqual(selections(ctx), [1, 1, 2]);
  assert.equal(ctx.nextBtn.disabled, false);
  assert.equal(ctx.typeSelectionProgress.textContent, '3 of 3 selected · 0 remaining');
  assert.match(ctx.roomTypePicker.innerHTML, /2 selected/);
  assert.equal(ctx.quantityDialog.open, false);
});

test('edit quantity down or to zero, preserving unrelated selections and clearing assignments', () => {
  const ctx = setup();
  ctx.setWalkInTypeQuantity(1, 2);
  ctx.setWalkInTypeQuantity(2, 1);
  click(ctx, { walkinEditType: '1' });
  submit(ctx, 1);
  assert.deepEqual(selections(ctx), [1, 0, 2]);
  assert.equal(ctx.nextBtn.disabled, true);
  click(ctx, { walkinEditType: '1' });
  submit(ctx, 0);
  assert.deepEqual(selections(ctx), [0, 0, 2]);
  assert.equal(ctx.clearedAssignments, 4);
  assert.equal(ctx.totalsUpdated, 4);
});

test('remove buttons clear individual slots or all of a type and allow reselecting', () => {
  const ctx = setup();
  ctx.setWalkInTypeQuantity(1, 2);
  ctx.setWalkInTypeQuantity(2, 1);
  ctx.typeSelectionSummary.handlers.click({ target: { closest: () => ({ dataset: { walkinRemoveSlot: '0' } }) } });
  assert.deepEqual(selections(ctx), [0, 1, 2]);
  click(ctx, { walkinRemoveType: '1' });
  assert.deepEqual(selections(ctx), [0, 0, 2]);
  assert.equal(ctx.setWalkInTypeQuantity(2, 3), true);
  assert.deepEqual(selections(ctx), [2, 2, 2]);
});

test('quantity limits reject over-capacity, fractions, negatives and unknown types atomically', () => {
  const ctx = setup();
  for (const value of [3, 1.5, -1, NaN, Infinity]) {
    assert.equal(ctx.setWalkInTypeQuantity(1, value), false);
  }
  assert.equal(ctx.setWalkInTypeQuantity(99, 1), false);
  assert.deepEqual(selections(ctx), [0, 0, 0]);
  assert.equal(ctx.clearedAssignments, 0);
  ctx.guestRooms[0].adults = 4;
  assert.equal(ctx.setWalkInTypeQuantity(1, 2), true);
  assert.deepEqual(selections(ctx), [0, 1, 1]);
  assert.equal(ctx.setWalkInTypeQuantity(2, 1), false);
});

test('cancel leaves the draft unchanged; submit rechecks changed availability', () => {
  const ctx = setup();
  click(ctx, { walkinPickType: '1' });
  ctx.quantityInput.value = '2';
  ctx.quantityDialog.handlers.cancel({ preventDefault() {} });
  assert.deepEqual(selections(ctx), [0, 0, 0]);
  assert.equal(ctx.quantityDialog.open, false);
  click(ctx, { walkinPickType: '1' });
  ctx.remainingByType.set(1, 1);
  submit(ctx, 2);
  assert.deepEqual(selections(ctx), [0, 0, 0]);
  assert.equal(ctx.quantityDialog.open, true);
  assert.equal(ctx.quantityError.hidden, false);
  submit(ctx, 1);
  assert.deepEqual(selections(ctx), [1, 0, 0]);
});

test('single-room selection stays direct and supports replacement and removal', () => {
  const ctx = setup(1);
  click(ctx, { walkinPickType: '1' });
  assert.deepEqual(selections(ctx), [1]);
  assert.equal(ctx.quantityDialog.open, false);
  click(ctx, { walkinPickType: '2' });
  assert.deepEqual(selections(ctx), [2]);
  click(ctx, { walkinRemoveType: '2' });
  assert.deepEqual(selections(ctx), [0]);
  assert.equal(ctx.nextBtn.disabled, true);
});

test('native quantity dialog and footer status exist once; Escape stays in the picker', () => {
  const ctx = setup();
  let stopped = false;
  ctx.quantityDialog.handlers.keydown({ key: 'Escape', stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  for (const id of ['walkInTypeQuantityDialog', 'walkInTypeSelectionProgress', 'walkInTypeSelectionSummary']) {
    assert.equal((view.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
  assert.match(view, /<dialog id="walkInTypeQuantityDialog"/);
  ctx.wizardStep = 'payment';
  ctx.renderWalkInSelectionSummary();
  assert.equal(ctx.typeSelectionProgress.hidden, true);
});
