(function () {
    function setOpen(section, open) {
        const toggle = section.querySelector('.hotel-accordion-toggle');
        const body = section.querySelector('.hotel-accordion-body');
        if (!toggle || !body) {
            return;
        }

        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        section.classList.toggle('is-open', open);
        body.classList.toggle('is-collapsed', !open);
        body.hidden = false;
        if (open) {
            body.style.removeProperty('display');
        }
    }

    function sectionHasVisibleError(section) {
        const candidates = section.querySelectorAll(
            '.field-validation-error, .input-validation-error, .text-danger, :invalid');

        for (const el of candidates) {
            if (el.matches(':invalid') || el.classList.contains('input-validation-error')) {
                return true;
            }

            if (el.classList.contains('field-validation-error') || el.classList.contains('text-danger')) {
                const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (text) {
                    return true;
                }
            }
        }

        return false;
    }

    function openSectionsWithErrors(root) {
        root.querySelectorAll('.hotel-accordion').forEach(section => {
            if (sectionHasVisibleError(section)) {
                setOpen(section, true);
            }
        });
    }

    function openSectionsByNames(root, sectionNames) {
        if (!root || !Array.isArray(sectionNames) || !sectionNames.length) {
            return;
        }

        const wanted = new Set(sectionNames.map(name => String(name || '').toLowerCase()));
        root.querySelectorAll('.hotel-accordion[data-section]').forEach(section => {
            const name = (section.dataset.section || '').toLowerCase();
            if (wanted.has(name)) {
                setOpen(section, true);
            }
        });
    }

    function isRoomNumberRelatedMessage(message) {
        return /room number|assign(?:ed)? room|each room must|how many rooms|room count/i
            .test(String(message || ''));
    }

    window.openHotelAccordionSectionsForElements = function (elements) {
        const opened = new Set();
        elements.forEach(el => {
            const section = el.closest?.('.hotel-accordion');
            if (!section || opened.has(section)) {
                return;
            }
            setOpen(section, true);
            opened.add(section);
        });
    };

    window.openHotelAccordionRoomNumberSections = function (rootOrForm) {
        const root = rootOrForm?.querySelector?.('.hotel-accordion-list') || rootOrForm;
        if (!root) {
            return;
        }

        openSectionsByNames(root, ['rooms', 'room-numbers', 'room']);
    };

    window.openHotelAccordionForMessages = function (rootOrForm, messages) {
        const root = rootOrForm?.querySelector?.('.hotel-accordion-list') || rootOrForm;
        if (!root) {
            return;
        }

        const list = Array.isArray(messages) ? messages : [messages];
        if (list.some(isRoomNumberRelatedMessage)) {
            openSectionsByNames(root, ['rooms', 'room-numbers', 'room']);
        }
    };

    window.initHotelAccordion = function (rootId, options) {
        const root = document.getElementById(rootId || 'createRoomAccordion');
        if (!root) {
            return;
        }

        root.querySelectorAll('.hotel-accordion').forEach(section => {
            const toggle = section.querySelector('.hotel-accordion-toggle');
            if (!toggle) {
                return;
            }

            setOpen(section, false);

            toggle.addEventListener('click', () => {
                const isOpen = toggle.getAttribute('aria-expanded') === 'true';
                setOpen(section, !isOpen);
            });
        });

        openSectionsWithErrors(root);
        openSectionsByNames(root, options?.openSections || []);

        if (Array.isArray(options?.messages) && options.messages.length) {
            window.openHotelAccordionForMessages(root, options.messages);
        }

        const form = root.closest('form');
        form?.addEventListener('submit', () => {
            window.setTimeout(() => openSectionsWithErrors(root), 0);
        }, true);
    };

    window.initCreateAccordion = function () {
        window.initHotelAccordion('createRoomAccordion');
    };
})();
