(function () {
    function refreshRoomNumberInputs(container, count, rooms) {
        const existingRows = Array.from(container.querySelectorAll('[data-room-row]'));
        const current = [];

        for (let i = 0; i < count; i++) {
            if (existingRows[i]) {
                current.push({
                    roomId: existingRows[i].querySelector('.room-id-input')?.value || '0',
                    roomNumber: existingRows[i].querySelector('.room-number-input')?.value || '',
                });
            } else if (rooms[i]) {
                current.push({
                    roomId: String(rooms[i].roomId ?? rooms[i].RoomId ?? 0),
                    roomNumber: rooms[i].roomNumber ?? rooms[i].RoomNumber ?? '',
                });
            } else {
                current.push({ roomId: '0', roomNumber: '' });
            }
        }

        container.innerHTML = '';

        for (let i = 0; i < count; i++) {
            const row = document.createElement('div');
            row.className = 'row g-2 align-items-center mb-2';
            row.setAttribute('data-room-row', '1');

            const roomId = current[i].roomId || '0';
            const roomNumber = current[i].roomNumber || '';
            const escapedNumber = roomNumber
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;');

            row.innerHTML = `
                <div class="col-sm-4">
                    <label class="form-label mb-0">Room ${i + 1}</label>
                </div>
                <div class="col-sm-8">
                    <input type="hidden"
                           class="room-id-input"
                           name="Rooms[${i}].RoomId"
                           value="${roomId}" />
                    <input type="text"
                           class="form-control room-number-input"
                           name="Rooms[${i}].RoomNumber"
                           maxlength="20"
                           placeholder="e.g. 101"
                           value="${escapedNumber}" />
                </div>
            `;

            container.appendChild(row);
        }
    }

    window.initEditTypeRoomsForm = function (initialRooms) {
        const countInput = document.getElementById('editTypeRoomCount');
        const container = document.getElementById('editTypeRoomNumberAssignments');

        if (!countInput || !container) {
            return;
        }

        const rooms = Array.isArray(initialRooms) ? initialRooms : [];

        const render = () => {
            let count = parseInt(countInput.value, 10);
            if (isNaN(count) || count < 1) {
                count = 1;
            }
            if (count > 50) {
                count = 50;
                countInput.value = '50';
            }

            refreshRoomNumberInputs(container, count, rooms);
        };

        countInput.addEventListener('change', render);
        countInput.addEventListener('input', render);
        render();
    };
})();
