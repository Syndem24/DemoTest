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
