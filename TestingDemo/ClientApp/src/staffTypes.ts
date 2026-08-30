export type StaffRole = 'Receptionist' | 'AdminManager'

export type CreateStaffUserPayload = {
  fullName: string
  userName: string
  loginEmail: string
  phoneNumber: string
  birthDate: string
  address: string
  role: StaffRole
  temporaryPassword: string
  confirmTemporaryPassword: string
  currentAdminPassword?: string
}

export type CreateStaffUserResponse = {
  message: string
  created?: boolean
  field?: string
}
