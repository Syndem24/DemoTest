import type {
  AdminGuestsListResponse,
  AdminUserStatusFilter,
  AdminUsersListResponse,
} from './adminUsersTypes'

function readAntiForgeryToken(root: HTMLElement | null): string {
  return (
    root?.dataset.antiforgery ||
    document.querySelector<HTMLInputElement>('#adminAntiForgery input[name="__RequestVerificationToken"]')
      ?.value ||
    document.querySelector<HTMLInputElement>('input[name="__RequestVerificationToken"]')?.value ||
    ''
  )
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T
}

export async function fetchAdminUsers(
  listUrl: string,
  params: { q: string; status: AdminUserStatusFilter; page: number },
): Promise<AdminUsersListResponse> {
  const url = new URL(listUrl, window.location.origin)
  url.searchParams.set('q', params.q)
  url.searchParams.set('status', params.status)
  url.searchParams.set('page', String(params.page))
  url.searchParams.set('pageSize', '15')

  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })

  const data = await readJson<AdminUsersListResponse & { message?: string }>(response)
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`)
  return data
}

export async function fetchAdminGuests(
  listUrl: string,
  params: { q: string; status: AdminUserStatusFilter; page: number },
): Promise<AdminGuestsListResponse> {
  const url = new URL(listUrl, window.location.origin)
  url.searchParams.set('q', params.q)
  url.searchParams.set('status', params.status)
  url.searchParams.set('page', String(params.page))
  url.searchParams.set('pageSize', '15')

  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })

  const data = await readJson<AdminGuestsListResponse & { message?: string }>(response)
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`)
  return data
}

async function postAction(url: string, root: HTMLElement | null): Promise<string> {
  const token = readAntiForgeryToken(root)
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      RequestVerificationToken: token,
    },
  })
  const data = await readJson<{ message?: string }>(response)
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`)
  return data.message || 'Done.'
}

export const disableAdminUser = (disableUrlBase: string, id: string, root: HTMLElement | null) =>
  postAction(`${disableUrlBase}/${encodeURIComponent(id)}/disable`, root)

export const enableAdminUser = (enableUrlBase: string, id: string, root: HTMLElement | null) =>
  postAction(`${enableUrlBase}/${encodeURIComponent(id)}/enable`, root)

export const deleteAdminUser = (deleteUrlBase: string, id: string, root: HTMLElement | null) =>
  postAction(`${deleteUrlBase}/${encodeURIComponent(id)}/delete`, root)
