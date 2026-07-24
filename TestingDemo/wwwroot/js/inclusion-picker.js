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

    function categoryExists(name) {
        return !!getCategoryRoot(name);
    }

    function addCategoryOption(name) {
        const select = document.getElementById('newInclusionCategory');
        if (!select) {
            return;
        }

        const exists = Array.from(select.options)
            .some(opt => opt.value.toLowerCase() === name.toLowerCase());
        if (exists) {
            return;
        }

        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;

        const customOption = Array.from(select.options)
            .find(opt => opt.value.toLowerCase() === 'custom');
        if (customOption) {
            select.insertBefore(option, customOption);
        } else {
            select.appendChild(option);
        }
    }

    function removeCategoryOption(name) {
        const select = document.getElementById('newInclusionCategory');
        if (!select) {
            return;
        }

        Array.from(select.options)
            .filter(opt => opt.value.toLowerCase() === name.toLowerCase())
            .forEach(opt => opt.remove());

        if (!select.value) {
            select.value = 'Custom';
        }
    }

    function createUserCategory(name) {
        const list = document.getElementById('inclusionList');
        const customRoot = document.getElementById('customInclusionCategory');
        if (!list || !customRoot) {
            return null;
        }

        const categoryId = toSafeId(name);
        const root = document.createElement('div');
        root.className = 'inclusion-category';
        root.dataset.category = name;
        root.dataset.userCategory = 'true';

        const header = document.createElement('div');
        header.className = 'inclusion-category-header';

        const selectAllWrap = document.createElement('div');
        selectAllWrap.className = 'form-check inclusion-category-select-all mb-0';

        const selectAll = document.createElement('input');
        selectAll.className = 'form-check-input inclusion-select-all';
        selectAll.type = 'checkbox';
        selectAll.id = `category_all_${categoryId}`;
        selectAll.dataset.categoryToggle = name;
        selectAll.disabled = true;

        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.htmlFor = selectAll.id;
        label.innerHTML =
            `<span class="inclusion-category-name"></span>` +
            `<span class="inclusion-select-all-hint">Select all in this category</span>`;
        label.querySelector('.inclusion-category-name').textContent = name;

        selectAllWrap.appendChild(selectAll);
        selectAllWrap.appendChild(label);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-sm btn-outline-danger delete-category-btn';
        deleteBtn.dataset.category = name;
        deleteBtn.title = 'Delete this category';
        deleteBtn.setAttribute('aria-label', `Delete category ${name}`);
        deleteBtn.textContent = 'Delete category';

        header.appendChild(selectAllWrap);
        header.appendChild(deleteBtn);

        const items = document.createElement('div');
        items.className = 'inclusion-category-items';

        root.appendChild(header);
        root.appendChild(items);
        list.insertBefore(root, customRoot);
        addCategoryOption(name);
        return root;
    }

    function collectCustomCategoriesJson() {
        const list = document.getElementById('inclusionList');
        if (!list) {
            return '[]';
        }

        const categories = Array.from(list.querySelectorAll('.inclusion-category[data-user-category="true"]'))
            .map(root => {
                const name = (root.dataset.category || '').trim();
                const items = Array.from(root.querySelectorAll('[data-inclusion-name]'))
                    .map(el => (el.dataset.inclusionName || '').trim())
                    .filter(Boolean);
                return { Name: name, Items: items };
            })
            .filter(c => c.Name);

        return JSON.stringify(categories);
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

        if (!getCategoryRoot(targetCategory) && targetCategory.toLowerCase() !== 'custom') {
            createUserCategory(targetCategory);
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
        const categoryInput = document.getElementById('newCategoryName');
        const categoryBtn = document.getElementById('addCategoryBtn');
        const customCategoriesJson = document.getElementById('customCategoriesJson');
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

        const addCategory = () => {
            const name = categoryInput?.value.trim() || '';
            if (!name) {
                inclusionError.textContent = 'Enter a category name.';
                return;
            }

            if (name.toLowerCase() === 'custom') {
                inclusionError.textContent = '“Custom” is reserved. Choose another name.';
                return;
            }

            if (categoryExists(name)) {
                inclusionError.textContent = 'That category already exists.';
                categorySelect.value = getCategoryRoot(name)?.dataset.category || name;
                return;
            }

            createUserCategory(name);
            if (categorySelect) {
                categorySelect.value = name;
            }
            if (categoryInput) {
                categoryInput.value = '';
            }
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
            const deleteCategoryBtn = event.target.closest('.delete-category-btn');
            if (deleteCategoryBtn) {
                event.preventDefault();
                event.stopPropagation();

                const categoryName = deleteCategoryBtn.dataset.category;
                const categoryRoot = getCategoryRoot(categoryName || '');
                if (!categoryRoot || categoryRoot.dataset.userCategory !== 'true') {
                    return;
                }

                const customItems = document.getElementById('customInclusionItems');
                categoryRoot.querySelectorAll('[data-inclusion-name]').forEach(row => {
                    row.dataset.inclusionCategory = 'Custom';
                    customItems?.appendChild(row);
                });
                categoryRoot.remove();
                removeCategoryOption(categoryName);
                syncCustomEmptyState();
                inclusionError.textContent = '';
                return;
            }

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

        // Only checked SelectedInclusions are posted; always sync custom categories JSON.
        form?.addEventListener('submit', () => {
            if (customCategoriesJson) {
                customCategoriesJson.value = collectCustomCategoriesJson();
            }

            inclusionList.querySelectorAll('input[name="SelectedInclusions"]').forEach(input => {
                if (!input.checked) {
                    input.disabled = true;
                }
            });
        });

        inclusionBtn.addEventListener('click', addInclusion);
        categoryBtn?.addEventListener('click', addCategory);

        inclusionInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addInclusion();
            }
        });

        categoryInput?.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addCategory();
            }
        });
    };
})();
