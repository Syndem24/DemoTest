export type SpecialOfferKind =
  | 'LimitedTime'
  | 'StayLongerSaveMore'
  | 'BestAvailableRate'
  | 'BookNowStayLater'
  | 'MonthlyStay'
  | 'GoogleLoyalty'

export type LoyaltyApplyMode =
  | 'EveryNight'
  | 'FirstNight'
  | 'WeeklyReset'
  | 'FirstBooking'

export type SpecialOfferDto = {
  id: number
  roomTypeId: number
  roomTypeName: string
  kind: SpecialOfferKind | string
  title: string
  description?: string | null
  regularPricePerNight: number
  promoPricePerNight?: number | null
  minNights?: number | null
  channels: number | string
  cashOnly: boolean
  isActive: boolean
  startsAtUtc: string
  endsAtUtc: string
  isCurrentlyActive: boolean
  discountAmount?: number | null
  loyaltyApplyMode?: LoyaltyApplyMode | string
  openEnded?: boolean
}
