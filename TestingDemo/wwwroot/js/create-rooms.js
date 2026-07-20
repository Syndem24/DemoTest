(function () {
    function refreshRoomNumberInputs(container, count, assignedValues) {
        const existingInputs = Array.from(container.querySelectorAll('.room-number-input'));
        const currentValues = [];

        for (let i = 0; i < count; i++) {
            if (existingInputs[i]) {
                currentValues.push(existingInputs[i].value);
            } else {
                currentValues.push(assignedValues[i] || '');
            }
        }

        container.innerHTML = '';

        for (let i = 0; i < count; i++) {
            const row = document.createElement('div');
            row.className = 'row g-2 align-items-center mb-2';

            row.innerHTML = `
                <div class="col-sm-4">
                    <label class="form-label mb-0">Room ${i + 1}</label>
                </div>
                <div class="col-sm-8">
                    <input type="text"
                           class="form-control room-number-input"
                           name="AssignedRoomNumbers"
                           maxlength="20"
                           placeholder="e.g. 101"
                           value="${currentValues[i] || ''}" />
                </div>
            `;

            container.appendChild(row);
        }
    }

    window.initCreateRoomsForm = function (assignedValues) {
        const countInput = document.getElementById('roomCount');
        const container = document.getElementById('roomNumberAssignments');

        if (!countInput || !container) {
            return;
        }

        const render = () => {
            let count = parseInt(countInput.value, 10);
            if (isNaN(count) || count < 1) {
                count = 1;
            }
            if (count > 50) {
                count = 50;
                countInput.value = '50';
            }

            refreshRoomNumberInputs(container, count, assignedValues || []);
        };

        countInput.addEventListener('change', render);
        countInput.addEventListener('input', render);
        render();
    };
})();
