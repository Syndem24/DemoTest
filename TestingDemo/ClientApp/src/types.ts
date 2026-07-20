export type RoomTypeSummary = {
  roomTypeId: number
  name: string
  description?: string | null
  pricePerNight: number
  maxOccupancy: number
  bedCount: number
  sizeSqm?: number | null
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
  sizeSqm?: number | null
  isAvailable: boolean
  inclusions: string[]
  images: string[]
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
  | 'isAvailable'
