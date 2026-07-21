(function () {
    function toSafeId(name) {
        return btoa(unescape(encodeURIComponent(name)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }

    function getCategoryRoot(categoryName) {
        const list = document.getElementById('inclusionList');
        if (!list) {
            return null;
        }

        return Array.from(list.querySelectorAll('.inclusion-category'))
            .find(el => (el.dataset.category || '').toLowerCase() === categoryName.toLowerCase())
            || null;
    }

    function getCategoryItemsContainer(categoryName) {
        return getCategoryRoot(categoryName)?.querySelector('.inclusion-category-items') || null;
    }

    function getCategoryItemCheckboxes(categoryRoot) {
        return Array.from(categoryRoot.querySelectorAll('.inclusion-category-items input[name="SelectedInclusions"]'));
    }

    function syncCategorySelectAll(categoryRoot) {
        if (!categoryRoot) {
            return;
        }

        const selectAll = categoryRoot.querySelector('.inclusion-select-all');
        if (!selectAll) {
            return;
        }

        const boxes = getCategoryItemCheckboxes(categoryRoot);
        if (boxes.length === 0) {
            selectAll.checked = false;
            selectAll.indeterminate = false;
            selectAll.disabled = true;
            return;
        }

        selectAll.disabled = false;
        const checkedCount = boxes.filter(box => box.checked).length;
        selectAll.checked = checkedCount === boxes.length;
        selectAll.indeterminate = checkedCount > 0 && checkedCount < boxes.length;
    }

    function syncAllCategorySelectAll() {
        document.querySelectorAll('#inclusionList .inclusion-category').forEach(syncCategorySelectAll);
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
            syncCategorySelectAll(getCategoryRoot('Custom'));
            return;
        }

        if (!empty) {
            const placeholder = document.createElement('div');
            placeholder.id = 'inclusionEmptyState';
            placeholder.className = 'text-muted small';
            placeholder.textContent = 'No custom inclusions yet.';
            customItems.appendChild(placeholder);
        }

        syncCategorySelectAll(getCategoryRoot('Custom'));
    }

    function appendCheckbox(name, checked, categoryName) {
        const list = document.getElementById('inclusionList');
        if (!list) {
            return;
        }

        const targetCategory = (categoryName || 'Custom').trim() || 'Custom';
        const existing = Array.from(list.querySelectorAll('[data-inclusion-name]'))
            .find(el => el.dataset.inclusionName.toLowerCase() === name.toLowerCase());

        if (existing) {
            const checkbox = existing.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.checked = !!checked;
            }
            syncCategorySelectAll(existing.closest('.inclusion-category'));
            return;
        }

        const container = getCategoryItemsContainer(targetCategory)
            || document.getElementById('customInclusionItems');
        if (!container) {
            return;
        }

        if (container.id === 'customInclusionItems') {
            document.getElementById('inclusionEmptyState')?.remove();
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'form-check inclusion-custom-row';
        wrapper.dataset.inclusionName = name;
        wrapper.dataset.inclusionDefault = 'false';
        wrapper.dataset.inclusionCategory = targetCategory;

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
        container.appendChild(wrapper);
        syncCustomEmptyState();
        syncCategorySelectAll(container.closest('.inclusion-category'));
    }

    window.initInclusionPicker = function () {
        const inclusionInput = document.getElementById('newInclusionName');
        const inclusionBtn = document.getElementById('addInclusionBtn');
        const inclusionList = document.getElementById('inclusionList');
        const inclusionError = document.getElementById('inclusionError');
        const categorySelect = document.getElementById('newInclusionCategory');
        const form = inclusionList?.closest('form');

        if (!inclusionBtn || !inclusionList || !inclusionInput) {
            return;
        }

        // Apply server-rendered indeterminate state for partial selections.
        inclusionList.querySelectorAll('.inclusion-select-all[data-indeterminate="true"]').forEach(input => {
            input.indeterminate = true;
            input.removeAttribute('data-indeterminate');
        });
        syncAllCategorySelectAll();

        const addInclusion = () => {
            const name = inclusionInput.value.trim();
            if (!name) {
                inclusionError.textContent = 'Enter an inclusion name.';
                return;
            }

            const category = categorySelect?.value?.trim() || 'Custom';
            appendCheckbox(name, true, category);
            inclusionInput.value = '';
            inclusionError.textContent = '';
            inclusionInput.focus();
        };

        inclusionList.addEventListener('change', event => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
                return;
            }

            if (target.classList.contains('inclusion-select-all')) {
                const categoryRoot = target.closest('.inclusion-category');
                if (!categoryRoot) {
                    return;
                }

                getCategoryItemCheckboxes(categoryRoot).forEach(box => {
                    box.checked = target.checked;
                });
                target.indeterminate = false;
                return;
            }

            if (target.name === 'SelectedInclusions') {
                syncCategorySelectAll(target.closest('.inclusion-category'));
            }
        });

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

            const categoryRoot = row?.closest('.inclusion-category');
            row?.remove();
            syncCustomEmptyState();
            syncCategorySelectAll(categoryRoot);
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
