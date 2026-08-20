export type RoomStatus = 'Available' | 'Unavailable' | 'Occupied' | 'Cleaning'

export function roomStatusLabel(status: string): string {
  if (status === 'Cleaning') return 'Maintaining'
  return status
}

export type RoomTypeSummary = {
  roomTypeId: number
  name: string
  description?: string | null
  pricePerNight: number
  maxOccupancy: number
  bedCount: number
  roomCount: number
  availableCount: number
  inclusions: string[]
  images: string[]
}

export type RoomItem = {
  id: number
  roomTypeId: number
  name: string
  roomNumber: string
  description?: string | null
  pricePerNight: number
  maxOccupancy: number
  bedCount: number
  status: RoomStatus
  inclusions: string[]
  images: string[]
  currentGuestName?: string | null
  currentBookingReference?: string | null
  currentBookingId?: number | null
}

export type ViewMode = 'types' | 'list'

export type SortDir = 'asc' | 'desc'

export type TypeSortKey =
  | 'name'
  | 'pricePerNight'
  | 'maxOccupancy'
  | 'roomCount'
  | 'availableCount'

export type RoomSortKey =
  | 'roomNumber'
  | 'name'
  | 'pricePerNight'
  | 'maxOccupancy'
  | 'status'
