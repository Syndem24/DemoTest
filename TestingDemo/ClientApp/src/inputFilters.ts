export type MoriInputFilterKind =
  | 'phone'
  | 'email'
  | 'person-name'
  | 'username'
  | 'login-id'
  | 'decimal'
  | 'integer'
  | 'otp'

function filterPhone(value: string): string {
  let out = ''
  for (const ch of value) {
    if (ch === '+' && out.length === 0) {
      out += ch
      continue
    }
    if (/[\d\s\-().]/.test(ch)) out += ch
  }
  return out.slice(0, 40)
}

function filterEmail(value: string): string {
  return value.replace(/\s+/g, '').replace(/[^a-zA-Z0-9.@_+%-]/g, '').slice(0, 254)
}

function filterPersonName(value: string): string {
  try {
    return value
      .replace(/[^\p{L}\p{M}\s'.\-]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .slice(0, 120)
  } catch {
    return value.replace(/[^a-zA-ZÀ-ÿ\s'.\-]/g, '').replace(/\s{2,}/g, ' ').slice(0, 120)
  }
}

function filterUsername(value: string): string {
  return value.replace(/[^a-zA-Z0-9._\-]/g, '').slice(0, 64)
}

function filterDecimal(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot === -1) return cleaned.slice(0, 16)
  return (
    cleaned.slice(0, firstDot + 1) +
    cleaned
      .slice(firstDot + 1)
      .replace(/\./g, '')
      .slice(0, 4)
  ).slice(0, 16)
}

const FILTERS: Record<MoriInputFilterKind, (value: string) => string> = {
  phone: filterPhone,
  email: filterEmail,
  'person-name': filterPersonName,
  username: filterUsername,
  'login-id': filterEmail,
  decimal: filterDecimal,
  integer: (value) => value.replace(/\D/g, '').slice(0, 12),
  otp: (value) => value.replace(/\D/g, '').slice(0, 1),
}

export function filterMoriInput(kind: MoriInputFilterKind, value: string): string {
  return FILTERS[kind](String(value ?? ''))
}
