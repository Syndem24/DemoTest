export type MoriNoticeKind = 'success' | 'error' | 'info'

declare global {
  interface Window {
    showMoriNotice?: (message: string, kind?: MoriNoticeKind) => void
  }
}

/** Corner toast via shared admin `mori-notice.js` (navy/teal Mori pattern). */
export function notifyMori(message: string, kind: MoriNoticeKind = 'success') {
  const text = String(message || '').replace(/\s+/g, ' ').trim()
  if (!text) return
  if (typeof window.showMoriNotice === 'function') {
    window.showMoriNotice(text, kind)
    return
  }
  // Layout script missing (unlikely in admin shell)
  console.info(`[Mori notice · ${kind}]`, text)
}
