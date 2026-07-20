(function () {
    const MAX_IMAGES = 10;
    const MAX_BYTES = 5 * 1024 * 1024;
    const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

    function extensionOf(name) {
        const index = name.lastIndexOf('.');
        return index >= 0 ? name.slice(index).toLowerCase() : '';
    }

    function formatBytes(bytes) {
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function fileKey(file) {
        return `${file.name}|${file.size}|${file.lastModified}`;
    }

    function countExistingImages() {
        return document.querySelectorAll('.existing-image-item').length;
    }

    function syncInputFiles(input, files) {
        const transfer = new DataTransfer();
        files.forEach(file => transfer.items.add(file));
        input.files = transfer.files;
    }

    function clearPreviews(list) {
        list.querySelectorAll('img[data-preview]').forEach(img => {
            if (img.src.startsWith('blob:')) {
                URL.revokeObjectURL(img.src);
            }
        });
        list.innerHTML = '';
    }

    function showEmptyState(list) {
        const item = document.createElement('li');
        item.id = 'selectedImageEmpty';
        item.className = 'list-group-item px-0 text-muted';
        item.textContent = 'No new files selected yet. Choose files above to upload.';
        list.appendChild(item);
    }

    window.initRoomImageUploader = function () {
        const input = document.getElementById('roomImageInput');
        const list = document.getElementById('selectedImageFileNames');
        const error = document.getElementById('imageUploadError');
        const existing = document.getElementById('existingImages');
        const clearBtn = document.getElementById('clearSelectedImagesBtn');
        const form = input?.closest('form');

        if (!input || !list || !error) {
            return;
        }

        /** @type {File[]} */
        let selectedFiles = [];

        const ensureReadyForSubmit = () => {
            // Keep file input participatable even if its accordion section is collapsed.
            const body = input.closest('.hotel-accordion-body');
            if (body) {
                body.hidden = false;
                body.classList.remove('is-collapsed');
                body.style.display = '';
            }
            input.disabled = false;
            syncInputFiles(input, selectedFiles);
        };

        const render = () => {
            clearPreviews(list);
            error.textContent = '';

            if (!selectedFiles.length) {
                showEmptyState(list);
                syncInputFiles(input, selectedFiles);
                return;
            }

            const existingCount = countExistingImages();
            if (existingCount + selectedFiles.length > MAX_IMAGES) {
                error.textContent = `You can upload up to ${MAX_IMAGES} images total for a room type.`;
            }

            const summary = document.createElement('li');
            summary.className = 'list-group-item px-0 fw-semibold';
            summary.textContent = `${selectedFiles.length} file(s) selected for upload`;
            list.appendChild(summary);

            selectedFiles.forEach((file, index) => {
                const ext = extensionOf(file.name);
                const invalidType = !ALLOWED_EXTENSIONS.includes(ext);
                const tooLarge = file.size > MAX_BYTES;

                const item = document.createElement('li');
                item.className = 'list-group-item px-0';

                const row = document.createElement('div');
                row.className = 'd-flex align-items-center gap-3';

                if (!invalidType && (file.type.startsWith('image/') || !file.type)) {
                    const preview = document.createElement('img');
                    preview.dataset.preview = '1';
                    preview.alt = file.name;
                    preview.className = 'rounded border';
                    preview.style.width = '64px';
                    preview.style.height = '48px';
                    preview.style.objectFit = 'cover';
                    preview.src = URL.createObjectURL(file);
                    preview.setAttribute('data-photo-zoom', '');
                    preview.setAttribute('data-photo-zoom-group', 'room-uploader-selected');
                    preview.setAttribute('data-photo-zoom-src', preview.src);
                    preview.title = 'Click to zoom';
                    row.appendChild(preview);
                }

                const meta = document.createElement('div');
                meta.className = 'flex-grow-1';

                const name = document.createElement('div');
                name.className = 'fw-semibold text-break';
                name.textContent = file.name;

                const details = document.createElement('div');
                details.className = 'text-muted small';
                details.textContent = `${formatBytes(file.size)} · ${ext || 'unknown type'}`;

                meta.appendChild(name);
                meta.appendChild(details);
                row.appendChild(meta);

                const badge = document.createElement('span');
                if (invalidType || tooLarge) {
                    badge.className = 'badge text-bg-danger';
                    badge.textContent = invalidType ? 'Invalid type' : 'Too large';
                } else {
                    badge.className = 'badge text-bg-success';
                    badge.textContent = 'Ready';
                }
                row.appendChild(badge);

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'btn btn-sm btn-outline-danger';
                removeBtn.textContent = 'Remove';
                removeBtn.setAttribute('aria-label', `Remove ${file.name}`);
                removeBtn.addEventListener('click', () => {
                    selectedFiles = selectedFiles.filter((_, i) => i !== index);
                    syncInputFiles(input, selectedFiles);
                    render();
                });
                row.appendChild(removeBtn);

                item.appendChild(row);
                list.appendChild(item);

                if (invalidType) {
                    error.textContent = 'Only JPG, JPEG, PNG, or WEBP files are allowed.';
                } else if (tooLarge) {
                    error.textContent = 'Each image must be 5 MB or smaller.';
                }
            });

            syncInputFiles(input, selectedFiles);
            window.initPhotoZoom?.(list);
            window.initPhotoZoom?.(existing);
        };

        input.addEventListener('change', () => {
            const incoming = Array.from(input.files || []);
            if (!incoming.length) {
                // Keep previously selected files when the dialog is cancelled.
                syncInputFiles(input, selectedFiles);
                return;
            }

            const known = new Set(selectedFiles.map(fileKey));
            const roomLeft = Math.max(0, MAX_IMAGES - countExistingImages() - selectedFiles.length);
            let added = 0;

            for (const file of incoming) {
                if (known.has(fileKey(file))) {
                    continue;
                }
                if (added >= roomLeft) {
                    error.textContent = `You can upload up to ${MAX_IMAGES} images total for a room type.`;
                    break;
                }
                known.add(fileKey(file));
                selectedFiles.push(file);
                added += 1;
            }

            // Re-apply the accumulated list. Do not use input.value = '' here —
            // that can drop files from the multipart post in some browsers.
            syncInputFiles(input, selectedFiles);
            render();
        });

        clearBtn?.addEventListener('click', () => {
            selectedFiles = [];
            syncInputFiles(input, selectedFiles);
            render();
        });

        existing?.addEventListener('click', event => {
            const button = event.target.closest('.remove-existing-image-btn');
            if (!button) {
                return;
            }

            const item = button.closest('.existing-image-item');
            item?.remove();

            const grid = document.getElementById('existingImageGrid');
            if (grid && !grid.querySelector('.existing-image-item')) {
                grid.remove();
                const placeholder = document.createElement('div');
                placeholder.className = 'text-muted small';
                placeholder.id = 'existingImageEmpty';
                placeholder.textContent = 'No images uploaded yet.';
                existing.appendChild(placeholder);
            }

            render();
        });

        // Capture phase so files are attached before the browser builds the request.
        form?.addEventListener('submit', ensureReadyForSubmit, true);

        render();
    };
})();
