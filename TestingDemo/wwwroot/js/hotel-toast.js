(function () {
    function normalizeMessage(message) {
        return String(message || '').replace(/\s+/g, ' ').trim();
    }

    function uniqueMessages(messages) {
        const seen = new Set();
        const result = [];
        messages.forEach(raw => {
            const text = normalizeMessage(raw);
            if (!text || seen.has(text.toLowerCase())) {
                return;
            }
            seen.add(text.toLowerCase());
            result.push(text);
        });
        return result;
    }

    function ensureOverlay() {
        let overlay = document.getElementById('hotelWarningOverlay');
        if (overlay) {
            return overlay;
        }

        overlay = document.createElement('div');
        overlay.id = 'hotelWarningOverlay';
        overlay.className = 'hotel-warning-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
            <div class="hotel-warning-dialog" role="alertdialog" aria-modal="true" aria-labelledby="hotelWarningTitle">
                <div class="hotel-warning-dialog-icon" aria-hidden="true">!</div>
                <h2 id="hotelWarningTitle" class="hotel-warning-dialog-title">Missing required details</h2>
                <p class="hotel-warning-dialog-lede">Please complete the items below, then try again.</p>
                <ul class="hotel-warning-dialog-list" id="hotelWarningList"></ul>
                <button type="button" class="btn btn-hotel-danger hotel-warning-dialog-btn" id="hotelWarningOk">
                    Got it
                </button>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => window.hideHotelWarning();
        overlay.querySelector('#hotelWarningOk')?.addEventListener('click', close);
        overlay.addEventListener('click', event => {
            if (event.target === overlay) {
                close();
            }
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !overlay.hidden) {
                close();
            }
        });

        return overlay;
    }

    function openSectionsForInvalidFields(form, messages) {
        if (typeof window.openHotelAccordionSectionsForElements === 'function') {
            const invalid = form.querySelectorAll(
                '.input-validation-error, :invalid, .field-validation-error:not(:empty)');
            window.openHotelAccordionSectionsForElements(invalid);
        } else {
            form.querySelectorAll('.hotel-accordion').forEach(section => {
                const hasError = section.querySelector(
                    '.input-validation-error, :invalid, .field-validation-error:not(:empty)');
                if (!hasError) {
                    return;
                }
                const toggle = section.querySelector('.hotel-accordion-toggle');
                const body = section.querySelector('.hotel-accordion-body');
                if (!toggle || !body) {
                    return;
                }
                toggle.setAttribute('aria-expanded', 'true');
                section.classList.add('is-open');
                body.classList.remove('is-collapsed');
                body.hidden = false;
            });
        }

        const fromDom = Array.from(
            form.querySelectorAll('.field-validation-error, .validation-summary-errors li'))
            .map(el => el.textContent);
        window.openHotelAccordionForMessages?.(form, [...(messages || []), ...fromDom]);
    }

    window.hideHotelWarning = function () {
        const overlay = document.getElementById('hotelWarningOverlay');
        if (!overlay) {
            return;
        }
        overlay.classList.remove('is-visible');
        window.setTimeout(() => {
            overlay.hidden = true;
            document.body.classList.remove('hotel-warning-open');
        }, 180);
    };

    window.showHotelWarning = function (messages) {
        const list = uniqueMessages(Array.isArray(messages) ? messages : [messages]);
        if (!list.length) {
            return;
        }

        const overlay = ensureOverlay();
        const ul = overlay.querySelector('#hotelWarningList');
        if (ul) {
            ul.innerHTML = '';
            list.forEach(message => {
                const li = document.createElement('li');
                li.textContent = message;
                ul.appendChild(li);
            });
        }

        overlay.hidden = false;
        document.body.classList.add('hotel-warning-open');
        window.requestAnimationFrame(() => overlay.classList.add('is-visible'));
        overlay.querySelector('#hotelWarningOk')?.focus();
    };

    window.showHotelToast = function (message) {
        window.showHotelWarning([message]);
    };

    window.showHotelToasts = function (messages) {
        window.showHotelWarning(messages);
    };

    window.initFormValidationToasts = function (formId, serverErrors) {
        const form = document.getElementById(formId);
        if (!form) {
            return;
        }

        const showForMessages = (messages) => {
            const unique = uniqueMessages(messages);
            if (!unique.length) {
                unique.push('Please complete the required fields before saving.');
            }
            openSectionsForInvalidFields(form, unique);
            window.showHotelWarning(unique);

            window.setTimeout(() => {
                const roomSection = form.querySelector(
                    '[data-section="rooms"].is-open, [data-section="room-numbers"].is-open, [data-section="room"].is-open');
                const firstInvalid = form.querySelector(
                    '.input-validation-error, :invalid, .field-validation-error:not(:empty)');
                const scrollTarget = firstInvalid
                    || roomSection
                    || form.querySelector('#roomNumberAssignments, #editTypeRoomNumberAssignments');
                scrollTarget?.scrollIntoView({ behavior: 'smooth', block: 'center' });

                const focusTarget = form.querySelector('.room-number-input, #RoomNumber')
                    || firstInvalid;
                if (focusTarget && typeof focusTarget.focus === 'function') {
                    try { focusTarget.focus({ preventScroll: true }); } catch { focusTarget.focus(); }
                }
            }, 120);
        };

        if (Array.isArray(serverErrors) && serverErrors.length) {
            showForMessages(serverErrors);
        }

        const $form = window.jQuery?.(form);
        if (!$form || !$form.length || !window.jQuery.validator) {
            form.addEventListener('submit', event => {
                if (form.checkValidity()) {
                    return;
                }
                event.preventDefault();
                const messages = [];
                form.querySelectorAll(':invalid').forEach(el => {
                    const label = el.id ? form.querySelector(`label[for="${el.id}"]`) : null;
                    const name = label?.textContent?.trim() || el.getAttribute('name') || 'Field';
                    messages.push(el.validationMessage || `The ${name} field is required.`);
                });
                showForMessages(messages);
            });
            return;
        }

        $form.on('invalid-form.validate', function (_event, validator) {
            const messages = (validator.errorList || [])
                .map(item => item.message)
                .filter(Boolean);

            form.querySelectorAll('.field-validation-error').forEach(span => {
                const text = normalizeMessage(span.textContent);
                if (text) {
                    messages.push(text);
                }
            });

            showForMessages(messages);
        });
    };
})();
