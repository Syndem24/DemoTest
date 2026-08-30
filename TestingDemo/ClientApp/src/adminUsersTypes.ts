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
