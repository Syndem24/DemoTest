export type GeneratedStaffCredentials = {
  userName: string
  password: string
  source: 'name-birth' | 'randomized'
  summary: string
}

const SPECIALS = '!@#$%&*?'
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'

function pick(chars: string): string {
  const index = Math.floor(Math.random() * chars.length)
  return chars[index] ?? 'x'
}

function randomChunk(length: number, alphabet: string): string {
  let out = ''
  for (let i = 0; i < length; i += 1) out += pick(alphabet)
  return out
}

function asciiSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.+/g, '.')
}

function nameParts(fullName: string): { first: string; last: string; slug: string } {
  const cleaned = fullName.trim().replace(/\s+/g, ' ')
  const tokens = cleaned.split(' ').filter(Boolean)
  const firstRaw = tokens[0] ?? ''
  const lastRaw = tokens.length > 1 ? tokens[tokens.length - 1] : ''
  const first = asciiSlug(firstRaw).replace(/\./g, '') || 'staff'
  const last = asciiSlug(lastRaw).replace(/\./g, '')
  const slug = last ? `${first}.${last}` : first
  return { first, last, slug: slug.slice(0, 40) }
}

function birthStamp(birthDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null
  const [year, month, day] = birthDate.split('-')
  return `${year.slice(2)}${month}${day}`
}

function ensurePasswordRules(password: string): string {
  let next = password
  if (!/[a-z]/.test(next)) next += pick(LOWER)
  if (!/[A-Z]/.test(next)) next += pick(UPPER)
  if (!/\d/.test(next)) next += pick(DIGITS)
  if (!/[^A-Za-z0-9]/.test(next)) next += pick(SPECIALS)
  while (next.length < 12) {
    next += pick(LOWER + UPPER + DIGITS + SPECIALS)
  }
  return next.slice(0, 24)
}

/**
 * Builds a login username (letters/digits/._- only) and a strong temporary password.
 * Prefers full name + birth date; otherwise fully randomizes with special characters in the password.
 */
export function generateStaffCredentials(
  fullName: string,
  birthDate: string
): GeneratedStaffCredentials {
  const parts = nameParts(fullName)
  const stamp = birthStamp(birthDate)
  const hasIdentity = parts.first !== 'staff' || Boolean(parts.last) || Boolean(stamp)

  if (hasIdentity) {
    const birthBit = stamp ?? randomChunk(4, DIGITS)
    const userName = filterUsernameCandidate(`${parts.slug}.${birthBit}`)
    const titleFirst = (parts.first.charAt(0).toUpperCase() + parts.first.slice(1)).slice(0, 6)
    const lastBit = (parts.last || parts.first).slice(0, 3)
    const password = ensurePasswordRules(
      `${titleFirst}${lastBit}${pick(SPECIALS)}${birthBit}${pick(UPPER)}${pick(DIGITS)}${pick(SPECIALS)}`
    )

    const summary = stamp
      ? `Built from the employee’s full name and birth date (${birthDate}), with random special characters in the password.`
      : `Built from the employee’s full name, with a random digit tag and special characters in the password.`

    return {
      userName,
      password,
      source: 'name-birth',
      summary,
    }
  }

  const userName = filterUsernameCandidate(`staff.${randomChunk(3, LOWER)}${randomChunk(3, DIGITS)}`)
  const password = ensurePasswordRules(
    `${pick(UPPER)}${randomChunk(4, LOWER)}${pick(SPECIALS)}${randomChunk(3, DIGITS)}${pick(UPPER)}${pick(SPECIALS)}${randomChunk(2, LOWER)}`
  )

  return {
    userName,
    password,
    source: 'randomized',
    summary:
      'Name or birth date was incomplete, so a randomized username and password with special characters were created.',
  }
}

function filterUsernameCandidate(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._\-]/g, '').replace(/^[._\-]+|[._\-]+$/g, '')
  const base = cleaned.length >= 3 ? cleaned : `staff.${randomChunk(5, LOWER + DIGITS)}`
  return base.slice(0, 64)
}
