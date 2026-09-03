export type AdminUserStatusFilter = 'all' | 'active' | 'disabled'

export type AdminUserItem = {
  id: string
  fullName: string | null
  userName: string
  email: string
  phoneNumber: string | null
  birthDate: string | null
  address: string | null
  role: string
  isDisabled: boolean
  disabledAtUtc: string | null
  canDeleteNow: boolean
  hasGoogleLogin?: boolean
}

export type AdminUserListSummary = {
  total: number
  adminManagers: number
  receptionists: number
}

export type AdminUsersListResponse = {
  items: AdminUserItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  retentionDays: number
  summary: AdminUserListSummary
}

export type AdminGuestsListSummary = {
  total: number
  googleLinked: number
}

export type AdminGuestsListResponse = {
  items: AdminUserItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  summary: AdminGuestsListSummary
}
