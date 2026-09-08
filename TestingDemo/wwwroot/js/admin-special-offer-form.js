(() => {
  function money(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '—';
    return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @param {HTMLFormElement|null} form
   * @param {Record<string, number>} pricesByRoomTypeId
   */
  function initOfferPricingForm(form, pricesByRoomTypeId) {
    if (!form) return;

    const picker = form.querySelector('[data-offer-room-picker]');
    const toggle = form.querySelector('[data-offer-room-toggle]');
    const menu = form.querySelector('[data-offer-room-menu]');
    const label = form.querySelector('[data-offer-room-label]');
    const checks = () => Array.from(form.querySelectorAll('[data-offer-room-check]'));
    const selectAll = form.querySelector('[data-offer-room-select-all]');
    const kindSelect = form.querySelector('[data-offer-kind]');
    const discountInput = form.querySelector('[data-offer-discount]');
    const amountInput = form.querySelector('[data-offer-amount]');
    const discountWrap = form.querySelector('[data-discount-wrap]');
    const amountWrap = form.querySelector('[data-amount-wrap]');
    const applyWrap = form.querySelector('[data-loyalty-apply-wrap]');
    const minNightsInput = form.querySelector('[data-offer-min-nights]');
    const minNightsWrap = form.querySelector('[data-min-nights-wrap]');
    const cashOnlyInput = form.querySelector('[data-offer-cash-only]');
    const cashOnlyWrap = form.querySelector('[data-cash-only-wrap]');
    const channelsSelect = form.querySelector('[data-offer-channels]');
    const channelsWrap = form.querySelector('[data-channels-wrap]');
    const descriptionWrap = form.querySelector('[data-description-wrap]');
    const descriptionInput = form.querySelector('[name="Description"]');
    const endsWrap = form.querySelector('[data-offer-ends-wrap]');
    const openEndedInput = form.querySelector('[data-offer-open-ended]');
    const ratePanel = form.querySelector('[data-kind-panel="rate"]');
    const panelTitle = form.querySelector('[data-rate-panel-title]');
    const summaryCol = form.querySelector('[data-summary-col]');
    const limitedKind = String(kindSelect?.getAttribute('data-limited-kind') || '0');
    const stayLongerKind = String(kindSelect?.getAttribute('data-stay-longer-kind') || '3');
    const googleLoyaltyKind = String(kindSelect?.getAttribute('data-google-loyalty-kind') || '5');
    const onlineOnlyChannels = String(channelsSelect?.getAttribute('data-online-only') || '1');
    const rowsEl = form.querySelector('[data-summary-rows]');
    const noteEl = form.querySelector('[data-summary-note]');

    function kindValue() {
      return String(kindSelect?.value ?? '');
    }

    function isLimitedTime() {
      return kindValue() === limitedKind;
    }

    function isStayLonger() {
      return kindValue() === stayLongerKind;
    }

    function isGoogleLoyalty() {
      return kindValue() === googleLoyaltyKind;
    }

    function isRateOffer() {
      return isLimitedTime() || isStayLonger() || isGoogleLoyalty();
    }

    function selectedRooms() {
      return checks()
        .filter((el) => el.checked)
        .map((el) => ({
          id: el.value,
          name: el.getAttribute('data-room-name') || el.value,
          price: Number(
            el.getAttribute('data-room-price')
            || pricesByRoomTypeId[String(el.value)]
            || 0
          ),
        }));
    }

    function syncRoomLabel() {
      if (!label) return;
      const selected = selectedRooms();
      if (!selected.length) {
        label.textContent = 'Select room types…';
        return;
      }
      if (selected.length === 1) {
        label.textContent = selected[0].name;
        return;
      }
      label.textContent = `${selected.length} room types selected`;
    }

    function syncSelectAll() {
      if (!(selectAll instanceof HTMLInputElement)) return;
      const all = checks();
      if (!all.length) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        selectAll.disabled = true;
        return;
      }
      selectAll.disabled = false;
      const n = all.filter((el) => el.checked).length;
      selectAll.checked = n === all.length;
      selectAll.indeterminate = n > 0 && n < all.length;
    }

    function setMenuOpen(open) {
      if (!menu || !toggle) return;
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function syncKindPanels() {
      const rate = isRateOffer();
      const stay = isStayLonger();
      const loyalty = isGoogleLoyalty();
      if (ratePanel) ratePanel.hidden = !rate;
      if (minNightsWrap) minNightsWrap.hidden = !stay;
      if (discountWrap) discountWrap.hidden = !rate || loyalty;
      if (amountWrap) amountWrap.hidden = !loyalty;
      if (applyWrap) applyWrap.hidden = !loyalty;
      if (cashOnlyWrap) cashOnlyWrap.hidden = loyalty;
      if (channelsWrap) channelsWrap.hidden = loyalty;
      if (descriptionWrap) descriptionWrap.hidden = loyalty;
      if (loyalty && descriptionInput) descriptionInput.value = '';
      if (summaryCol) {
        summaryCol.classList.toggle('col-md-8', !stay);
        summaryCol.classList.toggle('col-md-4', stay);
      }

      if (loyalty && channelsSelect) {
        channelsSelect.value = onlineOnlyChannels;
      }
      if (loyalty && cashOnlyInput) {
        cashOnlyInput.checked = false;
      }

      if (panelTitle) {
        panelTitle.textContent = stay
          ? 'Stay Longer pricing'
          : loyalty
            ? 'Loyalty Coupon pricing'
            : 'Limited Time pricing';
      }

      if (discountInput) {
        if (rate && !loyalty) discountInput.setAttribute('required', 'required');
        else {
          discountInput.removeAttribute('required');
          if (loyalty) discountInput.value = '';
        }
      }

      if (amountInput) {
        if (loyalty) amountInput.setAttribute('required', 'required');
        else {
          amountInput.removeAttribute('required');
          amountInput.value = '';
        }
      }

      if (minNightsInput) {
        if (stay) minNightsInput.setAttribute('required', 'required');
        else {
          minNightsInput.removeAttribute('required');
          minNightsInput.value = '';
        }
      }

      if (cashOnlyInput && !rate) {
        cashOnlyInput.checked = false;
      }
    }

    function refresh() {
      syncKindPanels();
      syncRoomLabel();
      syncSelectAll();

      if (!isRateOffer() || !rowsEl) return;

      const selected = selectedRooms();
      const loyalty = isGoogleLoyalty();
      const stay = isStayLonger();
      const pct = Number(discountInput?.value || 0);
      const amount = Number(amountInput?.value || 0);
      const minNights = Number(minNightsInput?.value || 0);

      if (!selected.length) {
        rowsEl.innerHTML =
          '<p class="offer-price-summary-empty mb-0" data-summary-empty>Select room types to preview rates.</p>';
        if (noteEl) noteEl.textContent = 'Check one or more room types in the dropdown.';
        return;
      }

      if (loyalty) {
        if (!(amount >= 0.01)) {
          rowsEl.innerHTML = selected
            .map(
              (room) => `<div class="offer-price-summary-room">
              <strong>${escapeHtml(room.name)}</strong>
              <span>${money(room.price)} base · enter ₱ amount off</span>
            </div>`
            )
            .join('');
          if (noteEl) {
            noteEl.textContent = 'Enter a peso amount to deduct (e.g. 240). Same amount off each selected room type.';
          }
          return;
        }

        const tooHigh = selected.filter((room) => !(room.price - amount > 0));
        rowsEl.innerHTML = selected
          .map((room) => {
            const base = room.price;
            const promo = Math.round((base - amount) * 100) / 100;
            if (!(promo > 0)) {
              return `<div class="offer-price-summary-room">
                <strong>${escapeHtml(room.name)}</strong>
                <span>${money(base)} base · amount must be less than the nightly rate</span>
              </div>`;
            }
            return `<div class="offer-price-summary-room">
              <strong>${escapeHtml(room.name)}</strong>
              <span><s>${money(base)}</s> → <em>${money(promo)}</em> (−${money(amount)})</span>
            </div>`;
          })
          .join('');
        if (noteEl) {
          noteEl.hidden = false;
          const mode = form.querySelector('input[name="LoyaltyApplyMode"]:checked')?.value;
          const when =
            mode === '1'
              ? 'Deducts once on the first night only.'
              : mode === '2'
                ? 'Deducts once every 7 nights of the stay.'
                : mode === '3'
                  ? 'Deducts on this Google guest’s first online booking only, then every night of that stay.'
                  : 'Deducts the peso amount on every night of the stay.';
          noteEl.textContent = tooHigh.length
            ? 'Amount off must be less than each selected room type’s nightly rate.'
            : `Applies after the guest signs in with Google. ${when}`;
        }
        return;
      }

      if (!(pct >= 0.01 && pct <= 99.99)) {
        rowsEl.innerHTML = selected
          .map(
            (room) => `<div class="offer-price-summary-room">
              <strong>${escapeHtml(room.name)}</strong>
              <span>${money(room.price)} base · enter % to preview</span>
            </div>`
          )
          .join('');
        if (noteEl) {
          noteEl.textContent = stay
            ? 'Enter minimum nights and a discount % (e.g. 5 nights · 15%).'
            : 'Enter a discount % between 0.01 and 99.99 (decimals OK).';
        }
        return;
      }

      const pctLabel = Number.isInteger(pct)
        ? String(pct)
        : String(Math.round(pct * 100) / 100);
      const minLabel =
        stay && minNights >= 2
          ? ` · ${minNights}+ nights`
          : stay
            ? ' · set min nights'
            : '';

      rowsEl.innerHTML = selected
        .map((room) => {
          const base = room.price;
          const promo = Math.round(base * (1 - pct / 100) * 100) / 100;
          return `<div class="offer-price-summary-room">
            <strong>${escapeHtml(room.name)}</strong>
            <span><s>${money(base)}</s> → <em>${money(promo)}</em> (−${pctLabel}%${minLabel})</span>
          </div>`;
        })
        .join('');

      if (noteEl) {
        noteEl.hidden = false;
        noteEl.textContent = stay
          ? 'Applies when stay meets min nights.'
          : 'Promo replaces the sellable nightly rate.';
      }
    }

    toggle?.addEventListener('click', (event) => {
      event.preventDefault();
      setMenuOpen(Boolean(menu?.hidden));
    });

    document.addEventListener('click', (event) => {
      if (!picker || !menu || menu.hidden) return;
      if (picker.contains(event.target)) return;
      setMenuOpen(false);
    });

    cashOnlyInput?.addEventListener('change', () => {
      if (cashOnlyInput) cashOnlyInput.dataset.userTouched = '1';
    });

    checks().forEach((el) => el.addEventListener('change', refresh));
    if (selectAll instanceof HTMLInputElement) {
      selectAll.addEventListener('change', () => {
        const on = selectAll.checked;
        checks().forEach((el) => {
          el.checked = on;
        });
        refresh();
      });
    }
    kindSelect?.addEventListener('change', () => {
      if (isGoogleLoyalty()) {
        if (channelsSelect) channelsSelect.value = onlineOnlyChannels;
        if (cashOnlyInput) cashOnlyInput.checked = false;
        if (descriptionInput) descriptionInput.value = '';
      }
      refresh();
    });
    discountInput?.addEventListener('input', refresh);
    discountInput?.addEventListener('change', refresh);
    amountInput?.addEventListener('input', refresh);
    amountInput?.addEventListener('change', refresh);
    form.querySelectorAll('input[name="LoyaltyApplyMode"]').forEach((el) => {
      el.addEventListener('change', refresh);
    });
    openEndedInput?.addEventListener('change', refresh);
    minNightsInput?.addEventListener('input', refresh);
    minNightsInput?.addEventListener('change', refresh);
    const loyaltyRadios = form.querySelectorAll('input[name="LoyaltyApplyMode"]');
    if (![...loyaltyRadios].some((el) => el instanceof HTMLInputElement && el.checked)
        && loyaltyRadios[0] instanceof HTMLInputElement) {
      loyaltyRadios[0].checked = true;
    }

    preventWheelValueChange(form);
    initOfferWindowFields(form);
    refresh();
  }

  function friendlyOfferValidationMessages(messages) {
    const list = Array.isArray(messages) ? messages : messages ? [messages] : [];
    return list
      .map((raw) => {
        const text = String(raw || '').replace(/\s+/g, ' ').trim();
        if (
          /LoyaltyApplyMode|Loyalty Apply Mode/i.test(text)
          || (/when to deduct/i.test(text) && /required/i.test(text))
        ) {
          return 'Choose when the Loyalty Coupon should deduct.';
        }
        return text;
      })
      .filter(Boolean);
  }

  function initOfferValidationToasts(formId, serverErrors) {
    if (typeof window.initFormValidationToasts !== 'function') return;
    const original = window.showHotelWarning;
    if (typeof original === 'function' && !window.__offerWarningWrapped) {
      window.__offerWarningWrapped = true;
      window.showHotelWarning = function (messages) {
        original(friendlyOfferValidationMessages(messages));
      };
    }
    window.initFormValidationToasts(formId, friendlyOfferValidationMessages(serverErrors));
  }

  /**
   * Prevent accidental value changes from mouse wheel on form controls.
   * Keeps inputs as basic controls but disables wheel increment/decrement behavior.
   * @param {HTMLFormElement} form
   */
  function preventWheelValueChange(form) {
    const wheelSensitive = form.querySelectorAll(
      'input[type="number"], input[type="date"], input[type="time"], input[type="datetime-local"]'
    );

    const stopWheel = (event) => {
      event.preventDefault();
    };

    wheelSensitive.forEach((input) => {
      input.addEventListener('wheel', stopWheel, { passive: false });
    });
  }

  /** Manila wall clock as yyyy-MM-ddTHH:mm for datetime-local min. */
  function manilaDateTimeLocal(date = new Date(), addMinutes = 0) {
    const shifted = new Date(date.getTime() + addMinutes * 60 * 1000);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(shifted);
    const get = (type) => parts.find((p) => p.type === type)?.value || '00';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
  }

  /**
   * Prevent past start/end and end-before-start on the admin offer form.
   * Edit of a live offer: keeping the original start (already begun) is allowed.
   * @param {HTMLFormElement} form
   */
  function initOfferWindowFields(form) {
    const starts = form.querySelector('[data-offer-starts]');
    const ends = form.querySelector('[data-offer-ends]');
    const endsWrap = form.querySelector('[data-offer-ends-wrap]');
    const openEndedInput = form.querySelector('[data-offer-open-ended]');
    const errorEl = form.querySelector('[data-offer-date-error]');
    if (!(starts instanceof HTMLInputElement) || !(ends instanceof HTMLInputElement)) return;

    const originalStart = starts.getAttribute('data-original-value') || starts.value || '';
    const originalEnd = ends.getAttribute('data-original-value') || ends.value || '';

    function isOpenEnded() {
      return openEndedInput instanceof HTMLInputElement && openEndedInput.checked;
    }

    function showError(message) {
      if (!errorEl) return;
      if (!message) {
        errorEl.hidden = true;
        errorEl.textContent = '';
        return;
      }
      errorEl.hidden = false;
      errorEl.textContent = message;
    }

    function syncOpenEnded() {
      const on = isOpenEnded();
      if (endsWrap) endsWrap.hidden = on;
      ends.disabled = on;
      if (on) {
        ends.removeAttribute('required');
        ends.setCustomValidity('');
      }
    }

    function syncMins() {
      syncOpenEnded();
      const nowLocal = manilaDateTimeLocal();
      const startKept = Boolean(originalStart && starts.value === originalStart);
      const endKept = Boolean(originalEnd && ends.value === originalEnd);

      // Allow the original past start when editing a live offer; block newly chosen past starts.
      starts.min = startKept && originalStart < nowLocal ? originalStart : nowLocal;

      let startMsg = '';
      let endMsg = '';
      if (starts.value && starts.value < nowLocal && !startKept) {
        startMsg = 'Start cannot be in the past (Manila time).';
      }

      if (!isOpenEnded()) {
        const endFloor =
          starts.value && starts.value > nowLocal ? starts.value : nowLocal;
        ends.min = endKept && originalEnd && originalEnd < endFloor ? originalEnd : endFloor;
        if (ends.value && ends.value < nowLocal && !endKept) {
          endMsg = 'End cannot be in the past (Manila time).';
        } else if (starts.value && ends.value && ends.value <= starts.value) {
          endMsg = 'End must be after start.';
        } else if (!ends.value) {
          endMsg = 'Set an end date, or check Stay live until deactivated.';
        }
      }

      starts.setCustomValidity(startMsg);
      ends.setCustomValidity(endMsg);
      showError(startMsg || endMsg);
    }

    starts.addEventListener('change', syncMins);
    starts.addEventListener('input', syncMins);
    ends.addEventListener('change', syncMins);
    ends.addEventListener('input', syncMins);
    openEndedInput?.addEventListener('change', syncMins);
    form.addEventListener('submit', (event) => {
      syncMins();
      if (!starts.checkValidity() || (!isOpenEnded() && !ends.checkValidity())) {
        event.preventDefault();
        starts.reportValidity();
        if (!isOpenEnded()) ends.reportValidity();
      }
    });
    syncMins();
  }

  window.initOfferPricingForm = initOfferPricingForm;
  window.initOfferValidationToasts = initOfferValidationToasts;
})();
