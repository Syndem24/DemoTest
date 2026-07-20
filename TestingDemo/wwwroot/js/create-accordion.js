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

    function openSectionsWithErrors(root) {
        root.querySelectorAll('.hotel-accordion').forEach(section => {
            const hasError = section.querySelector(
                '.field-validation-error:not(:empty), .input-validation-error, .text-danger:not(:empty), :invalid');
            if (hasError) {
                const text = hasError.textContent?.trim();
                if (hasError.matches(':invalid') || hasError.classList.contains('input-validation-error') || text) {
                    setOpen(section, true);
                }
            }
        });
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

    window.initHotelAccordion = function (rootId) {
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

        const form = root.closest('form');
        form?.addEventListener('submit', () => {
            window.setTimeout(() => openSectionsWithErrors(root), 0);
        }, true);
    };

    window.initCreateAccordion = function () {
        window.initHotelAccordion('createRoomAccordion');
    };
})();
