import { useEffect, useId, useRef, useState, type FormEvent, type HTMLAttributes } from 'react'
import { createStaffUser } from '../staffApi'
import { generateStaffCredentials, type GeneratedStaffCredentials } from '../staffCredentialGenerator'
import type { CreateStaffUserPayload, StaffRole } from '../staffTypes'
import { filterMoriInput, type MoriInputFilterKind } from '../inputFilters'
import { PhilippinesAddressFields } from './PhilippinesAddressFields'

type FieldErrors = Partial<Record<keyof CreateStaffUserPayload, string>>

const FIELD_ORDER: (keyof CreateStaffUserPayload)[] = [
  'fullName',
  'userName',
  'birthDate',
  'address',
  'loginEmail',
  'phoneNumber',
  'role',
  'temporaryPassword',
  'confirmTemporaryPassword',
  'currentAdminPassword',
]

const FIELD_DOM_SUFFIX: Record<keyof CreateStaffUserPayload, string> = {
  fullName: 'fullName',
  userName: 'userName',
  birthDate: 'birthDate',
  address: 'street',
  loginEmail: 'loginEmail',
  phoneNumber: 'phone',
  role: 'role',
  temporaryPassword: 'tempPassword',
  confirmTemporaryPassword: 'confirmTempPassword',
  currentAdminPassword: 'stepup',
}

function firstErrorField(errors: FieldErrors): keyof CreateStaffUserPayload | null {
  return FIELD_ORDER.find((key) => errors[key]) ?? null
}

function focusField(formId: string, key: keyof CreateStaffUserPayload | null) {
  if (!key) return
  const el = document.getElementById(`${formId}-${FIELD_DOM_SUFFIX[key]}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  window.setTimeout(() => {
    el.focus({ preventScroll: true })
  }, 280)
}

const emptyForm: CreateStaffUserPayload = {
  fullName: '',
  userName: '',
  loginEmail: '',
  phoneNumber: '',
  birthDate: '',
  address: '',
  role: 'Receptionist',
  temporaryPassword: '',
  confirmTemporaryPassword: '',
  currentAdminPassword: '',
}

function ageFromIsoDate(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const birth = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1
  return age
}

function validate(form: CreateStaffUserPayload): FieldErrors {
  const errors: FieldErrors = {}

  if (form.fullName.trim().length < 2) errors.fullName = 'Enter the employee full name.'
  if (form.userName.trim().length < 3) errors.userName = 'Username must be at least 3 characters.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.loginEmail.trim())) {
    errors.loginEmail = 'Enter a valid email address.'
  }
  if (form.phoneNumber.trim().replace(/\D/g, '').length < 7) {
    errors.phoneNumber = 'Enter a valid phone number.'
  }
  const age = ageFromIsoDate(form.birthDate)
  if (age === null || age < 16 || age > 100) {
    errors.birthDate = 'Enter a valid birth date (age 16–100).'
  }
  if (form.address.trim().length < 5) {
    errors.address = 'Enter a full address.'
  }
  if (form.temporaryPassword.length < 12) {
    errors.temporaryPassword = 'Use at least 12 characters.'
  } else if (
    !/[a-z]/.test(form.temporaryPassword) ||
    !/[A-Z]/.test(form.temporaryPassword) ||
    !/\d/.test(form.temporaryPassword) ||
    !/[^A-Za-z0-9]/.test(form.temporaryPassword)
  ) {
    errors.temporaryPassword = 'Include upper, lower, a number, and a symbol.'
  }
  if (form.confirmTemporaryPassword !== form.temporaryPassword) {
    errors.confirmTemporaryPassword = 'Passwords do not match.'
  }
  if (form.role === 'AdminManager' && !form.currentAdminPassword?.trim()) {
    errors.currentAdminPassword = 'Enter your password to continue.'
  }

  return errors
}

export function CreateStaffUserApp() {
  const root = document.getElementById('staff-create-root')
  const formId = useId()
  const alertOkRef = useRef<HTMLButtonElement>(null)
  const [form, setForm] = useState<CreateStaffUserPayload>(emptyForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [alert, setAlert] = useState<{ message: string; field: keyof CreateStaffUserPayload | null } | null>(null)
  const [generated, setGenerated] = useState<GeneratedStaffCredentials | null>(null)
  const generateOkRef = useRef<HTMLButtonElement>(null)

  const showAlert = (message: string, field: keyof CreateStaffUserPayload | null) => {
    setAlert({ message, field })
  }

  const dismissAlert = () => {
    const field = alert?.field ?? null
    setAlert(null)
    focusField(formId, field)
  }

  const openGeneratePreview = () => {
    const next = generateStaffCredentials(form.fullName, form.birthDate)
    setGenerated(next)
  }

  const applyGenerated = (next: GeneratedStaffCredentials) => {
    setForm((prev) => ({
      ...prev,
      userName: next.userName,
      temporaryPassword: next.password,
      confirmTemporaryPassword: next.password,
    }))
    setErrors((prev) => ({
      ...prev,
      userName: undefined,
      temporaryPassword: undefined,
      confirmTemporaryPassword: undefined,
    }))
    setGenerated(null)
    focusField(formId, 'temporaryPassword')
  }

  useEffect(() => {
    document.querySelector('.admin-create-staff-toolbar')?.setAttribute('hidden', '')
  }, [])

  useEffect(() => {
    if (!alert) return
    alertOkRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setAlert(null)
      focusField(formId, alert.field)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [alert, formId])

  useEffect(() => {
    if (!generated) return
    generateOkRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setGenerated(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [generated])

  const setField = <K extends keyof CreateStaffUserPayload>(key: K, value: CreateStaffUserPayload[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const onBlurValidate = (key: keyof CreateStaffUserPayload) => {
    const next = validate(form)
    setErrors((prev) => ({ ...prev, [key]: next[key] }))
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validate(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      const field = firstErrorField(nextErrors)
      showAlert(field ? nextErrors[field] || 'Please fix the highlighted fields.' : 'Please fix the highlighted fields.', field)
      return
    }

    setSubmitting(true)
    setAlert(null)
    try {
      const payload: CreateStaffUserPayload = {
        ...form,
        fullName: form.fullName.trim(),
        userName: form.userName.trim(),
        loginEmail: form.loginEmail.trim(),
        phoneNumber: form.phoneNumber.trim(),
        birthDate: form.birthDate,
        address: form.address.trim(),
        temporaryPassword: form.temporaryPassword,
        confirmTemporaryPassword: form.confirmTemporaryPassword,
        currentAdminPassword:
          form.role === 'AdminManager' ? form.currentAdminPassword : undefined,
      }
      const result = await createStaffUser(payload, root)
      const listUrl = root?.dataset.listUrl || '/AdminUsers'
      try {
        sessionStorage.setItem('mori.adminUsers.flash', result.message)
      } catch {
        /* ignore quota / private mode */
      }
      window.location.assign(listUrl)
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create the staff user.'
      const field = (err as { field?: string }).field as keyof CreateStaffUserPayload | undefined
      if (field) {
        setErrors((prev) => ({ ...prev, [field]: message }))
      }
      showAlert(message, field ?? null)
    } finally {
      setSubmitting(false)
    }
  }

  const needsStepUp = form.role === 'AdminManager'

  return (
    <div className="sc-app">
      <header className="sc-header">
        <div>
          <p className="sc-eyebrow">Mori International Hotel · Admin</p>
          <h1>Create staff user</h1>
          <p className="sc-subtitle">
            Add a staff account and choose the one-time password they will use to sign in.
          </p>
        </div>
        <a className="sc-btn sc-btn-ghost" href={root?.dataset.listUrl || '/AdminUsers'}>
          Back to users
        </a>
      </header>

      {alert ? (
        <div className="sc-alert-popup" role="presentation" onClick={dismissAlert}>
          <div
            className="sc-alert-popup-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`${formId}-alert-title`}
            aria-describedby={`${formId}-alert-message`}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={`${formId}-alert-title`}>Check this field</h2>
            <p id={`${formId}-alert-message`}>{alert.message}</p>
            <div className="sc-alert-popup-actions">
              <button ref={alertOkRef} type="button" className="sc-btn sc-btn-primary" onClick={dismissAlert}>
                {alert.field ? 'Go to field' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {generated ? (
        <div className="sc-alert-popup" role="presentation" onClick={() => setGenerated(null)}>
          <div
            className="sc-alert-popup-card sc-generate-popup-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${formId}-generate-title`}
            aria-describedby={`${formId}-generate-message`}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={`${formId}-generate-title`}>Generated login details</h2>
            <p id={`${formId}-generate-message`}>{generated.summary}</p>
            <dl className="sc-generate-creds">
              <div>
                <dt>Username</dt>
                <dd>
                  <code>{generated.userName}</code>
                </dd>
              </div>
              <div>
                <dt>Temporary password</dt>
                <dd>
                  <code>{generated.password}</code>
                </dd>
              </div>
            </dl>
            <p className="sc-generate-hint">
              Give both to the employee. They must change the password on first login.
            </p>
            <div className="sc-alert-popup-actions sc-generate-actions">
              <button type="button" className="sc-btn sc-btn-secondary" onClick={openGeneratePreview}>
                Generate again
              </button>
              <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setGenerated(null)}>
                Cancel
              </button>
              <button
                ref={generateOkRef}
                type="button"
                className="sc-btn sc-btn-primary"
                onClick={() => applyGenerated(generated)}
              >
                Use these
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <form className="sc-card" onSubmit={onSubmit} noValidate>
        <section className="sc-section" aria-labelledby={`${formId}-identity`}>
          <div className="sc-section-head">
            <h2 id={`${formId}-identity`}>Employee identity</h2>
            <p>Staff name and birth date.</p>
          </div>
          <div className="sc-grid">
            <Field
              id={`${formId}-fullName`}
              label="Full name"
              value={form.fullName}
              error={errors.fullName}
              autoComplete="name"
              placeholder="e.g. Ana Reyes"
              filterKind="person-name"
              onChange={(value) => setField('fullName', value)}
              onBlur={() => onBlurValidate('fullName')}
            />
            <Field
              id={`${formId}-birthDate`}
              label="Birth date"
              type="date"
              value={form.birthDate}
              error={errors.birthDate}
              autoComplete="bday"
              onChange={(value) => setField('birthDate', value)}
              onBlur={() => onBlurValidate('birthDate')}
            />
          </div>
        </section>

        <section className="sc-section" aria-labelledby={`${formId}-contact`}>
          <div className="sc-section-head">
            <h2 id={`${formId}-contact`}>Contact</h2>
            <p>Email is also their login address.</p>
          </div>
          <div className="sc-grid">
            <Field
              id={`${formId}-loginEmail`}
              label="Email"
              type="email"
              value={form.loginEmail}
              error={errors.loginEmail}
              autoComplete="email"
              inputMode="email"
              placeholder="e.g. ana.reyes@gmail.com"
              filterKind="email"
              className="sc-span-2"
              onChange={(value) => setField('loginEmail', value)}
              onBlur={() => onBlurValidate('loginEmail')}
            />
          </div>
        </section>

        <section className="sc-section" aria-labelledby={`${formId}-address`}>
          <div className="sc-section-head">
            <h2 id={`${formId}-address`}>Address &amp; phone</h2>
            <p>Pick Philippine location from official PSGC lists, then add street and phone.</p>
          </div>
          <PhilippinesAddressFields
            formId={formId}
            address={form.address}
            phoneNumber={form.phoneNumber}
            addressError={errors.address}
            phoneError={errors.phoneNumber}
            onAddressChange={(value) => setField('address', value)}
            onPhoneChange={(value) => setField('phoneNumber', value)}
            onAddressBlur={() => onBlurValidate('address')}
            onPhoneBlur={() => onBlurValidate('phoneNumber')}
            filterPhone={(value) => filterMoriInput('phone', value)}
          />
        </section>

        <section className="sc-section" aria-labelledby={`${formId}-access`}>
          <div className="sc-section-head">
            <h2 id={`${formId}-access`}>Role</h2>
            <p>Permission level for this staff account.</p>
          </div>
          <div className="sc-grid">
            <div className="sc-field sc-span-2">
              <label htmlFor={`${formId}-role`}>Role</label>
              <select
                id={`${formId}-role`}
                value={form.role}
                onChange={(event) => {
                  const role = event.target.value as StaffRole
                  setForm((prev) => ({
                    ...prev,
                    role,
                    currentAdminPassword: role === 'AdminManager' ? prev.currentAdminPassword : '',
                  }))
                }}
              >
                <option value="Receptionist">Receptionist</option>
                <option value="AdminManager">AdminManager</option>
              </select>
              <div className="sc-field-meta" />
            </div>
          </div>
        </section>

        <section className="sc-section" aria-labelledby={`${formId}-staff-password`}>
          <div className="sc-section-head sc-section-head-row">
            <div>
              <h2 id={`${formId}-staff-password`}>Login credentials</h2>
              <p>Username and temporary password for the employee. They change the password on first login.</p>
            </div>
            <button
              type="button"
              className="sc-btn sc-btn-secondary sc-generate-btn"
              onClick={openGeneratePreview}
            >
              Auto-generate username &amp; password
            </button>
          </div>
          <div className="sc-grid">
            <Field
              id={`${formId}-userName`}
              label="Username"
              value={form.userName}
              error={errors.userName}
              autoComplete="off"
              placeholder="e.g. ana.reyes"
              filterKind="username"
              className="sc-span-2"
              onChange={(value) => setField('userName', value)}
              onBlur={() => onBlurValidate('userName')}
            />
            <Field
              id={`${formId}-tempPassword`}
              label="New password"
              type="password"
              value={form.temporaryPassword}
              error={errors.temporaryPassword}
              autoComplete="new-password"
              placeholder="At least 12 characters"
              onChange={(value) => setField('temporaryPassword', value)}
              onBlur={() => onBlurValidate('temporaryPassword')}
            />
            <Field
              id={`${formId}-confirmTempPassword`}
              label="Confirm password"
              type="password"
              value={form.confirmTemporaryPassword}
              error={errors.confirmTemporaryPassword}
              autoComplete="new-password"
              placeholder="Type it again"
              onChange={(value) => setField('confirmTemporaryPassword', value)}
              onBlur={() => onBlurValidate('confirmTemporaryPassword')}
            />
          </div>
        </section>

        {needsStepUp ? (
          <section className="sc-section" aria-labelledby={`${formId}-admin-password`}>
            <div className="sc-section-head">
              <h2 id={`${formId}-admin-password`}>Your password</h2>
              <p>Confirm with your own password to create an AdminManager.</p>
            </div>
            <div className="sc-grid">
              <Field
                id={`${formId}-stepup`}
                label="Your password"
                type="password"
                value={form.currentAdminPassword || ''}
                error={errors.currentAdminPassword}
                autoComplete="current-password"
                placeholder="Your current password"
                onChange={(value) => setField('currentAdminPassword', value)}
                onBlur={() => onBlurValidate('currentAdminPassword')}
              />
            </div>
          </section>
        ) : null}

        <div className="sc-actions">
          <a className="sc-btn sc-btn-secondary" href={root?.dataset.listUrl || '/AdminUsers'}>
            Back to users
          </a>
          <button type="submit" className="sc-btn sc-btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create staff user'}
          </button>
        </div>
      </form>
    </div>
  )
}

type FieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  type?: string
  autoComplete?: string
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
  placeholder?: string
  className?: string
  multiline?: boolean
  filterKind?: MoriInputFilterKind
}

function Field({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  type = 'text',
  autoComplete,
  inputMode,
  placeholder,
  className,
  multiline = false,
  filterKind,
}: FieldProps) {
  const errorId = `${id}-error`
  const [passwordVisible, setPasswordVisible] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword && passwordVisible ? 'text' : type

  const handleChange = (raw: string) => {
    onChange(filterKind ? filterMoriInput(filterKind, raw) : raw)
  }

  const control = multiline ? (
    <textarea
      id={id}
      value={value}
      autoComplete={autoComplete}
      placeholder={placeholder}
      rows={3}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? errorId : undefined}
      onChange={(event) => handleChange(event.target.value)}
      onBlur={onBlur}
    />
  ) : (
    <input
      id={id}
      type={inputType}
      value={value}
      autoComplete={autoComplete}
      inputMode={inputMode}
      placeholder={placeholder}
      data-mori-filter={filterKind}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? errorId : undefined}
      onChange={(event) => handleChange(event.target.value)}
      onBlur={onBlur}
    />
  )

  return (
    <div className={`sc-field ${className || ''}`.trim()}>
      <label htmlFor={id}>{label}</label>
      {isPassword ? (
        <div className="sc-password-group">
          {control}
          <button
            type="button"
            className="sc-password-toggle"
            aria-label={passwordVisible ? 'Hide password' : 'Show password'}
            aria-pressed={passwordVisible}
            title={passwordVisible ? 'Hide password' : 'Show password'}
            onClick={() => setPasswordVisible((visible) => !visible)}
          >
            {passwordVisible ? <EyeHideIcon /> : <EyeShowIcon />}
          </button>
        </div>
      ) : (
        control
      )}
      <div className="sc-field-meta">
        {error ? (
          <p id={errorId} className="sc-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function EyeShowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="18" height="18">
      <path
        fill="currentColor"
        d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
      />
    </svg>
  )
}

function EyeHideIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="18" height="18">
      <path
        fill="currentColor"
        d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-2.28 2.2 2.2c.08-.24.16-.48.16-.72 0-1.66-1.34-3-3-3-.24 0-.48.08-.72.16z"
      />
    </svg>
  )
}
