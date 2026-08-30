import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { CreateStaffUserApp } from './components/CreateStaffUserApp'
import { SpecialOffersApp } from './components/SpecialOffersApp'
import { AdminUsersApp } from './components/AdminUsersApp'
import './styles.css'

const roomRoot = document.getElementById('room-management-root')
const staffRoot = document.getElementById('staff-create-root')
const offersRoot = document.getElementById('special-offers-root')
const adminUsersRoot = document.getElementById('admin-users-root')

if (roomRoot) {
  createRoot(roomRoot).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

if (staffRoot) {
  createRoot(staffRoot).render(
    <StrictMode>
      <CreateStaffUserApp />
    </StrictMode>,
  )
}

if (offersRoot) {
  createRoot(offersRoot).render(
    <StrictMode>
      <SpecialOffersApp />
    </StrictMode>,
  )
}

if (adminUsersRoot) {
  createRoot(adminUsersRoot).render(
    <StrictMode>
      <AdminUsersApp />
    </StrictMode>,
  )
}
