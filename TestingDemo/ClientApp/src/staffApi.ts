import type { CreateStaffUserPayload, CreateStaffUserResponse } from './staffTypes'

function readAntiForgeryToken(root: HTMLElement | null): string {
  return (
    root?.dataset.antiforgery ||
    document.querySelector<HTMLInputElement>('#adminAntiForgery input[name="__RequestVerificationToken"]')
      ?.value ||
    document.querySelector<HTMLInputElement>('input[name="__RequestVerificationToken"]')?.value ||
    ''
  )
}

export async function createStaffUser(
  payload: CreateStaffUserPayload,
  root: HTMLElement | null,
): Promise<CreateStaffUserResponse> {
  const token = readAntiForgeryToken(root)
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      RequestVerificationToken: token,
    },
    body: JSON.stringify(payload),
  })

  const data = (await response.json().catch(() => ({}))) as CreateStaffUserResponse & {
    errors?: Record<string, string[]>
    title?: string
  }

  if (!response.ok) {
    if (data.field && data.message) {
      throw Object.assign(new Error(data.message), { field: data.field })
    }

    if (data.errors) {
      const first = Object.values(data.errors).flat()[0]
      throw new Error(first || data.title || 'Please check the form and try again.')
    }

    throw new Error(data.message || `Request failed (${response.status})`)
  }

  return {
    created: true,
    message: data.message || 'Staff user created successfully.',
  }
}
