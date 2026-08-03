(function () {
    let overlay = null;
    let imageEl = null;
    let captionEl = null;
    let counterEl = null;
    let prevBtn = null;
    let nextBtn = null;
    let currentGroup = [];
    let currentIndex = 0;
    let lastFocusedElement = null;

    function ensureModal() {
        if (overlay) {
            return;
        }

        overlay = document.createElement('div');
        overlay.className = 'hotel-photo-zoom';
        overlay.hidden = true;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Photo zoom');
        overlay.innerHTML = `
            <div class="hotel-photo-zoom-backdrop" data-photo-zoom-close="1"></div>
            <div class="hotel-photo-zoom-dialog">
                <button type="button" class="hotel-photo-zoom-close" data-photo-zoom-close="1" aria-label="Close photo gallery">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
                <button type="button" class="hotel-photo-zoom-nav is-prev" aria-label="Previous photo">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <img class="hotel-photo-zoom-image" alt="" />
                <button type="button" class="hotel-photo-zoom-nav is-next" aria-label="Next photo">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
                </button>
                <div class="hotel-photo-zoom-meta">
                    <span class="hotel-photo-zoom-caption"></span>
                    <span class="hotel-photo-zoom-counter"></span>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        imageEl = overlay.querySelector('.hotel-photo-zoom-image');
        captionEl = overlay.querySelector('.hotel-photo-zoom-caption');
        counterEl = overlay.querySelector('.hotel-photo-zoom-counter');
        prevBtn = overlay.querySelector('.hotel-photo-zoom-nav.is-prev');
        nextBtn = overlay.querySelector('.hotel-photo-zoom-nav.is-next');

        overlay.addEventListener('click', (event) => {
            const target = event.target;
            if (target instanceof Element && target.closest('[data-photo-zoom-close="1"]')) {
                closeZoom();
            }
        });

        overlay.querySelector('.hotel-photo-zoom-close')?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeZoom();
        });

        prevBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            showIndex(currentIndex - 1);
        });

        nextBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            showIndex(currentIndex + 1);
        });

        document.addEventListener('keydown', (event) => {
            if (!overlay || overlay.hidden) {
                return;
            }
            if (event.key === 'Escape') {
                closeZoom();
            } else if (event.key === 'ArrowLeft') {
                showIndex(currentIndex - 1);
            } else if (event.key === 'ArrowRight') {
                showIndex(currentIndex + 1);
            } else if (event.key === 'Tab') {
                const controls = Array.from(
                    overlay.querySelectorAll('button:not([disabled]):not([hidden])')
                ).filter((control) => control.getClientRects().length > 0);
                if (!controls.length) {
                    return;
                }
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        });
    }

    function showIndex(index) {
        if (!currentGroup.length || !imageEl) {
            return;
        }

        currentIndex = (index + currentGroup.length) % currentGroup.length;
        const item = currentGroup[currentIndex];
        imageEl.src = item.src;
        imageEl.alt = item.alt || '';
        if (captionEl) {
            captionEl.textContent = item.alt || '';
        }
        if (counterEl) {
            counterEl.textContent = currentGroup.length > 1
                ? `${currentIndex + 1} / ${currentGroup.length}`
                : '';
        }

        const multi = currentGroup.length > 1;
        if (prevBtn) {
            prevBtn.hidden = !multi;
        }
        if (nextBtn) {
            nextBtn.hidden = !multi;
        }
    }

    function openZoom(items, startIndex) {
        ensureModal();
        currentGroup = items.filter((item) => item && item.src);
        if (!currentGroup.length || !overlay) {
            return;
        }

        showIndex(startIndex || 0);
        if (document.activeElement instanceof HTMLElement) {
            lastFocusedElement = document.activeElement;
        }
        overlay.hidden = false;
        document.body.classList.add('hotel-photo-zoom-open');
        requestAnimationFrame(() => overlay?.querySelector('.hotel-photo-zoom-close')?.focus());
    }

    function closeZoom() {
        if (!overlay) {
            return;
        }
        overlay.hidden = true;
        document.body.classList.remove('hotel-photo-zoom-open');
        if (imageEl) {
            imageEl.removeAttribute('src');
        }
        currentGroup = [];
        currentIndex = 0;
        if (lastFocusedElement?.isConnected) {
            lastFocusedElement.focus();
        }
        lastFocusedElement = null;
    }

    function collectGroup(trigger) {
        const rawItems = trigger.getAttribute('data-photo-zoom-items');
        if (rawItems) {
            try {
                const parsed = JSON.parse(rawItems);
                if (Array.isArray(parsed)) {
                    return parsed.map((item) => ({
                        src: item.src || item.Src || '',
                        alt: item.alt || item.Alt || '',
                    })).filter((item) => item.src);
                }
            } catch {
                // Fall through to the standard single-photo/group behavior.
            }
        }

        const groupName = trigger.getAttribute('data-photo-zoom-group');
        if (!groupName) {
            const src = trigger.getAttribute('data-photo-zoom-src') || trigger.getAttribute('src') || '';
            const alt = trigger.getAttribute('alt') || trigger.getAttribute('data-photo-zoom-alt') || '';
            return [{ src, alt }];
        }

        const nodes = Array.from(
            document.querySelectorAll(`[data-photo-zoom][data-photo-zoom-group="${CSS.escape(groupName)}"]`)
        );

        return nodes.map((node) => ({
            src: node.getAttribute('data-photo-zoom-src') || node.getAttribute('src') || '',
            alt: node.getAttribute('alt') || node.getAttribute('data-photo-zoom-alt') || '',
        })).filter((item) => item.src);
    }

    function startIndexFor(trigger, items) {
        const src = trigger.getAttribute('data-photo-zoom-src') || trigger.getAttribute('src') || '';
        const index = items.findIndex((item) => item.src === src);
        return index >= 0 ? index : 0;
    }

    function bindTrigger(el) {
        if (!(el instanceof HTMLElement) || el.dataset.photoZoomBound === '1') {
            return;
        }
        el.dataset.photoZoomBound = '1';
        el.classList.add('hotel-photo-zoomable');
        el.setAttribute('role', el.getAttribute('role') || 'button');
        el.setAttribute('tabindex', el.getAttribute('tabindex') || '0');
        el.setAttribute('title', el.getAttribute('title') || 'Click to zoom');

        const openFrom = (event) => {
            event.preventDefault();
            event.stopPropagation();
            const items = collectGroup(el);
            openZoom(items, startIndexFor(el, items));
        };

        el.addEventListener('click', openFrom);
        el.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                openFrom(event);
            }
        });
    }

    window.initPhotoZoom = function (root) {
        const scope = root instanceof Element ? root : document;
        scope.querySelectorAll('[data-photo-zoom]').forEach(bindTrigger);
    };

    window.openPhotoZoom = function (sources, startIndex) {
        const items = (sources || []).map((src) =>
            typeof src === 'string' ? { src, alt: '' } : src
        );
        openZoom(items, startIndex || 0);
    };

    document.addEventListener('DOMContentLoaded', () => {
        window.initPhotoZoom(document);
    });
})();
