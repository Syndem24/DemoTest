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

function readAntiForgeryToken(): string {
  return (
    document.querySelector<HTMLInputElement>(
      "#adminAntiForgery input[name='__RequestVerificationToken']",
    )?.value ||
    document.querySelector<HTMLInputElement>("input[name='__RequestVerificationToken']")?.value ||
    ''
  )
}

async function postJson<TReq, TRes>(url: string, body: TReq): Promise<TRes> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      RequestVerificationToken: readAntiForgeryToken(),
    },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string }
    throw new Error(payload.message || `Request failed (${response.status})`)
  }

  return response.json() as Promise<TRes>
}

export type RoomTypeOpenResult = {
  typeName: string
  changedCount: number
  blockedRooms: string[]
}

/** Bulk open/close of every physical room in a type; occupied rooms are reported. */
export function setRoomTypeOpen(
  roomTypeId: number,
  open: boolean,
): Promise<RoomTypeOpenResult> {
  return postJson<{ open: boolean }, RoomTypeOpenResult>(
    `/api/rooms/types/${roomTypeId}/open`,
    { open },
  )
}
