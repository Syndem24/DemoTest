import type { RoomItem, RoomTypeSummary } from './types'

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string }
    throw new Error(payload.message || `Request failed (${response.status})`)
  }

  return response.json() as Promise<T>
}

export function fetchRoomTypes(): Promise<RoomTypeSummary[]> {
  return getJson<RoomTypeSummary[]>('/api/rooms/types')
}

export function fetchRooms(): Promise<RoomItem[]> {
  return getJson<RoomItem[]>('/api/rooms')
}
