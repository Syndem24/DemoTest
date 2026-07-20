import type { ReactNode } from 'react'

type IconLinkProps = {
  href: string
  label: string
  variant?: 'default' | 'danger'
  children: ReactNode
}

function IconLink({ href, label, variant = 'default', children }: IconLinkProps) {
  return (
    <a
      href={href}
      className={`rm-icon-btn ${variant === 'danger' ? 'is-danger' : ''}`}
      title={label}
      aria-label={label}
    >
      {children}
    </a>
  )
}

export function DetailsIconLink({ href }: { href: string }) {
  return (
    <IconLink href={href} label="Details">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 5c5.2 0 9.3 3.7 10.5 7-1.2 3.3-5.3 7-10.5 7S2.7 15.3 1.5 12C2.7 8.7 6.8 5 12 5zm0 2c-3.9 0-7.2 2.7-8.4 5 1.2 2.3 4.5 5 8.4 5s7.2-2.7 8.4-5C19.2 9.7 15.9 7 12 7zm0 2.5A2.5 2.5 0 1 1 12 14a2.5 2.5 0 0 1 0-4.5z" />
      </svg>
    </IconLink>
  )
}

export function EditIconLink({ href }: { href: string }) {
  return (
    <IconLink href={href} label="Edit">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 17.3V20h2.7l10-10.1-2.7-2.7L4 17.3zM19.7 7.3a.96.96 0 0 0 0-1.4l-1.6-1.6a.96.96 0 0 0-1.4 0l-1.3 1.3 2.7 2.7 1.6-1z" />
      </svg>
    </IconLink>
  )
}

export function DeleteIconLink({ href }: { href: string }) {
  return (
    <IconLink href={href} label="Delete" variant="danger">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 7h10l-1 13H8L7 7zm3-3h4l1 2H9l1-2zM5 7h14v2H5V7z" />
      </svg>
    </IconLink>
  )
}
