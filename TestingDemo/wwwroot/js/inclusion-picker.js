(function () {
    function toSafeId(name) {
        return btoa(unescape(encodeURIComponent(name)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }

    function syncCustomEmptyState() {
        const customItems = document.getElementById('customInclusionItems');
        if (!customItems) {
            return;
        }

        const hasCustom = customItems.querySelectorAll('[data-inclusion-name]').length > 0;
        const empty = document.getElementById('inclusionEmptyState');

        if (hasCustom) {
            empty?.remove();
            return;
        }

        if (!empty) {
            const placeholder = document.createElement('div');
            placeholder.id = 'inclusionEmptyState';
            placeholder.className = 'text-muted small';
            placeholder.textContent = 'No custom inclusions yet.';
            customItems.appendChild(placeholder);
        }
    }

    function appendCheckbox(name, checked) {
        const list = document.getElementById('inclusionList');
        const customItems = document.getElementById('customInclusionItems');
        if (!list || !customItems) {
            return;
        }

        const existing = Array.from(list.querySelectorAll('[data-inclusion-name]'))
            .find(el => el.dataset.inclusionName.toLowerCase() === name.toLowerCase());

        if (existing) {
            const checkbox = existing.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.checked = !!checked;
            }
            return;
        }

        document.getElementById('inclusionEmptyState')?.remove();

        const wrapper = document.createElement('div');
        wrapper.className = 'form-check inclusion-custom-row';
        wrapper.dataset.inclusionName = name;
        wrapper.dataset.inclusionDefault = 'false';

        const inputId = `inclusion_${toSafeId(name)}`;

        const checkbox = document.createElement('input');
        checkbox.className = 'form-check-input';
        checkbox.type = 'checkbox';
        checkbox.name = 'SelectedInclusions';
        checkbox.value = name;
        checkbox.id = inputId;
        checkbox.checked = !!checked;

        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.htmlFor = inputId;
        label.textContent = name;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm btn-outline-danger delete-inclusion-btn';
        button.dataset.name = name;
        button.title = 'Delete this custom inclusion';
        button.setAttribute('aria-label', `Delete ${name}`);
        button.textContent = 'Delete';

        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        wrapper.appendChild(button);
        customItems.appendChild(wrapper);
        syncCustomEmptyState();
    }

    window.initInclusionPicker = function () {
        const inclusionInput = document.getElementById('newInclusionName');
        const inclusionBtn = document.getElementById('addInclusionBtn');
        const inclusionList = document.getElementById('inclusionList');
        const inclusionError = document.getElementById('inclusionError');
        const form = inclusionList?.closest('form');

        if (!inclusionBtn || !inclusionList || !inclusionInput) {
            return;
        }

        const addInclusion = () => {
            const name = inclusionInput.value.trim();
            if (!name) {
                inclusionError.textContent = 'Enter an inclusion name.';
                return;
            }

            appendCheckbox(name, true);
            inclusionInput.value = '';
            inclusionError.textContent = '';
        };

        inclusionList.addEventListener('click', event => {
            const button = event.target.closest('.delete-inclusion-btn');
            if (!button) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const name = button.dataset.name;
            if (!name) {
                return;
            }

            const row = Array.from(inclusionList.querySelectorAll('[data-inclusion-name]'))
                .find(el =>
                    el.dataset.inclusionDefault === 'false' &&
                    el.dataset.inclusionName.toLowerCase() === name.toLowerCase());

            row?.remove();
            syncCustomEmptyState();
            inclusionError.textContent = '';
        });

        // Only checked SelectedInclusions are posted.
        form?.addEventListener('submit', () => {
            inclusionList.querySelectorAll('input[name="SelectedInclusions"]').forEach(input => {
                if (!input.checked) {
                    input.disabled = true;
                }
            });
        });

        inclusionBtn.addEventListener('click', addInclusion);

        inclusionInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addInclusion();
            }
        });
    };
})();
