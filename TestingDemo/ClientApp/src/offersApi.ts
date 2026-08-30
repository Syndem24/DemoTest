import type { SpecialOfferDto } from './offerTypes'

function readAntiForgeryToken(root: HTMLElement | null): string {
  return (
    root?.dataset.antiforgery ||
    document.querySelector<HTMLInputElement>('#adminAntiForgery input[name="__RequestVerificationToken"]')
      ?.value ||
    document.querySelector<HTMLInputElement>('input[name="__RequestVerificationToken"]')?.value ||
    ''
  )
}

async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string; title?: string; errors?: Record<string, string[]> }
    | null

  if (payload?.message && payload.message.trim()) return payload.message
  if (payload?.title && payload.title.trim()) return payload.title

  const firstErrorGroup = payload?.errors ? Object.values(payload.errors)[0] : null
  if (firstErrorGroup?.length) return firstErrorGroup[0]

  const raw = await response.text().catch(() => '')
  const cleaned = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned) return cleaned.slice(0, 180)

  return fallback
}

export async function fetchSpecialOffers(): Promise<SpecialOfferDto[]> {
  const response = await fetch('/api/special-offers', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error('Unable to load special offers.')
  }
  return (await response.json()) as SpecialOfferDto[]
}

export async function deactivateSpecialOffer(
  id: number,
  root: HTMLElement | null,
): Promise<void> {
  const token = readAntiForgeryToken(root)
  const response = await fetch(`/api/special-offers/${id}/deactivate`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      RequestVerificationToken: token,
    },
  })
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to deactivate offer.'))
  }
}

export async function reactivateSpecialOffer(
  id: number,
  startsAtUtc: string,
  endsAtUtc: string,
  root: HTMLElement | null,
): Promise<void> {
  const token = readAntiForgeryToken(root)
  const response = await fetch(`/api/special-offers/${id}/reactivate`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      RequestVerificationToken: token,
    },
    body: JSON.stringify({ startsAtUtc, endsAtUtc }),
  })
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to reactivate offer.'))
  }
}

export async function deleteSpecialOffer(
  id: number,
  root: HTMLElement | null,
): Promise<void> {
  const token = readAntiForgeryToken(root)
  const response = await fetch(`/api/special-offers/${id}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      RequestVerificationToken: token,
    },
  })
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to delete offer.'))
  }
}
