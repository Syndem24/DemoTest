import type { RoomItem, RoomTypeSummary } from './types'

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }

  return response.json() as Promise<T>
}

export function fetchRoomTypes(): Promise<RoomTypeSummary[]> {
  return getJson<RoomTypeSummary[]>('/api/rooms/types')
}

export function fetchRooms(): Promise<RoomItem[]> {
  return getJson<RoomItem[]>('/api/rooms')
}
