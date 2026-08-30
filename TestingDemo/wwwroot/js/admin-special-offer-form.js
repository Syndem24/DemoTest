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
    const kindSelect = form.querySelector('[data-offer-kind]');
    const discountInput = form.querySelector('[data-offer-discount]');
    const minNightsInput = form.querySelector('[data-offer-min-nights]');
    const minNightsWrap = form.querySelector('[data-min-nights-wrap]');
    const cashOnlyInput = form.querySelector('[data-offer-cash-only]');
    const ratePanel = form.querySelector('[data-kind-panel="rate"]');
    const panelTitle = form.querySelector('[data-rate-panel-title]');
    const summaryCol = form.querySelector('[data-summary-col]');
    const limitedKind = String(kindSelect?.getAttribute('data-limited-kind') || '0');
    const stayLongerKind = String(kindSelect?.getAttribute('data-stay-longer-kind') || '3');
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

    function isRateOffer() {
      return isLimitedTime() || isStayLonger();
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

    function setMenuOpen(open) {
      if (!menu || !toggle) return;
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function syncKindPanels() {
      const rate = isRateOffer();
      const stay = isStayLonger();
      if (ratePanel) ratePanel.hidden = !rate;
      if (minNightsWrap) minNightsWrap.hidden = !stay;
      if (summaryCol) {
        summaryCol.classList.toggle('col-md-8', !stay);
        summaryCol.classList.toggle('col-md-4', stay);
      }

      if (panelTitle) {
        panelTitle.textContent = stay
          ? 'Stay Longer pricing'
          : 'Limited Time pricing';
      }

      if (discountInput) {
        if (rate) discountInput.setAttribute('required', 'required');
        else {
          discountInput.removeAttribute('required');
          discountInput.value = '';
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

      if (!isRateOffer() || !rowsEl) return;

      const selected = selectedRooms();
      const pct = Number(discountInput?.value || 0);
      const minNights = Number(minNightsInput?.value || 0);
      const stay = isStayLonger();

      if (!selected.length) {
        rowsEl.innerHTML =
          '<p class="offer-price-summary-empty mb-0" data-summary-empty>Select room types to preview rates.</p>';
        if (noteEl) noteEl.textContent = 'Check one or more room types in the dropdown.';
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
    kindSelect?.addEventListener('change', refresh);
    discountInput?.addEventListener('input', refresh);
    discountInput?.addEventListener('change', refresh);
    minNightsInput?.addEventListener('input', refresh);
    minNightsInput?.addEventListener('change', refresh);
    preventWheelValueChange(form);
    initOfferWindowFields(form);
    refresh();
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
    const errorEl = form.querySelector('[data-offer-date-error]');
    if (!(starts instanceof HTMLInputElement) || !(ends instanceof HTMLInputElement)) return;

    const originalStart = starts.getAttribute('data-original-value') || starts.value || '';
    const originalEnd = ends.getAttribute('data-original-value') || ends.value || '';

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

    function syncMins() {
      const nowLocal = manilaDateTimeLocal();
      const startKept = Boolean(originalStart && starts.value === originalStart);
      const endKept = Boolean(originalEnd && ends.value === originalEnd);

      // Allow the original past start when editing a live offer; block newly chosen past starts.
      starts.min = startKept && originalStart < nowLocal ? originalStart : nowLocal;
      const endFloor =
        starts.value && starts.value > nowLocal ? starts.value : nowLocal;
      ends.min = endKept && originalEnd && originalEnd < endFloor ? originalEnd : endFloor;

      let startMsg = '';
      let endMsg = '';
      if (starts.value && starts.value < nowLocal && !startKept) {
        startMsg = 'Start cannot be in the past (Manila time).';
      }
      if (ends.value && ends.value < nowLocal && !endKept) {
        endMsg = 'End cannot be in the past (Manila time).';
      } else if (starts.value && ends.value && ends.value <= starts.value) {
        endMsg = 'End must be after start.';
      }

      starts.setCustomValidity(startMsg);
      ends.setCustomValidity(endMsg);
      showError(startMsg || endMsg);
    }

    starts.addEventListener('change', syncMins);
    starts.addEventListener('input', syncMins);
    ends.addEventListener('change', syncMins);
    ends.addEventListener('input', syncMins);
    form.addEventListener('submit', (event) => {
      syncMins();
      if (!starts.checkValidity() || !ends.checkValidity()) {
        event.preventDefault();
        starts.reportValidity();
        ends.reportValidity();
      }
    });
    syncMins();
  }

  window.initOfferPricingForm = initOfferPricingForm;
})();
