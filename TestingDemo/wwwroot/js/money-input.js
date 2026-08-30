(function () {
    function parseMoney(value) {
        if (value == null) {
            return null;
        }

        const cleaned = String(value)
            .replace(/[₱PhpPHP\s]/g, '')
            .replace(/,/g, '')
            .trim();

        if (!cleaned) {
            return null;
        }

        const number = Number(cleaned);
        return Number.isFinite(number) ? number : null;
    }

    function formatMoney(value) {
        return new Intl.NumberFormat('en-PH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);
    }

    window.initMoneyInputs = function (root) {
        const scope = root || document;
        const inputs = scope.querySelectorAll('input.money-input');

        inputs.forEach(input => {
            if (input.dataset.moneyBound === '1') {
                return;
            }
            input.dataset.moneyBound = '1';

            const applyDisplay = () => {
                const number = parseMoney(input.value);
                if (number == null) {
                    return;
                }
                input.value = formatMoney(number);
            };

            input.addEventListener('focus', () => {
                // Remember current amount, then clear so the user can type immediately.
                const number = parseMoney(input.value);
                input.dataset.moneyPrevious = number == null ? '' : String(number);
                input.value = '';
                input.select();
            });

            // Digits + one decimal only (blocks letters like "abc" / "e").
            input.addEventListener('beforeinput', (event) => {
                if (event.inputType && event.inputType.startsWith('delete')) {
                    return;
                }
                const data = event.data;
                if (data == null) {
                    return;
                }
                if (!/^[0-9.]+$/.test(data)) {
                    event.preventDefault();
                    return;
                }
                if (data.includes('.') && String(input.value).includes('.')) {
                    event.preventDefault();
                }
            });

            input.addEventListener('input', () => {
                const cleaned = String(input.value)
                    .replace(/[^\d.]/g, '')
                    .replace(/(\..*)\./g, '$1');
                if (cleaned !== input.value) {
                    input.value = cleaned;
                }
            });

            input.addEventListener('paste', (event) => {
                event.preventDefault();
                const text = (event.clipboardData || window.clipboardData)?.getData('text') || '';
                const cleaned = String(text)
                    .replace(/[^\d.]/g, '')
                    .replace(/(\..*)\./g, '$1');
                const start = input.selectionStart ?? input.value.length;
                const end = input.selectionEnd ?? input.value.length;
                const next = input.value.slice(0, start) + cleaned + input.value.slice(end);
                input.value = next.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
            });

            input.addEventListener('blur', () => {
                const number = parseMoney(input.value);
                if (number != null) {
                    input.value = formatMoney(number);
                    delete input.dataset.moneyPrevious;
                    return;
                }

                // Empty on blur: restore what was there before focus.
                const previous = input.dataset.moneyPrevious;
                delete input.dataset.moneyPrevious;
                if (previous) {
                    input.value = formatMoney(Number(previous));
                } else {
                    input.value = '';
                }
            });

            const form = input.closest('form');
            form?.addEventListener('submit', () => {
                let number = parseMoney(input.value);
                if (number == null && input.dataset.moneyPrevious) {
                    number = parseMoney(input.dataset.moneyPrevious);
                }
                if (number == null) {
                    return;
                }
                // Model binder expects invariant/plain decimal
                input.value = number.toFixed(2);
            }, true);

            // Initial display if a value is already present
            if (input.value) {
                applyDisplay();
            }
        });
    };
})();
