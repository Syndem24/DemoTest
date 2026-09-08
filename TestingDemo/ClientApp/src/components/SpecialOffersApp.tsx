import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deactivateSpecialOffer,
  deleteSpecialOffer,
  fetchSpecialOffers,
  reactivateSpecialOffer,
} from '../offersApi'
import type { SpecialOfferDto } from '../offerTypes'
import { notifyMori } from '../moriNotice'

function money(amount: number): string {
  return `₱${Number(amount || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

function formatWindow(startIso: string, endIso: string, openEnded?: boolean): string {
  const start = new Date(startIso)
  if (Number.isNaN(start.getTime())) return '—'
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const startLabel = start.toLocaleDateString('en-PH', opts)
  if (openEnded) return `${startLabel} – Until deactivated`
  const end = new Date(endIso)
  if (Number.isNaN(end.getTime())) return startLabel
  return `${startLabel} – ${end.toLocaleDateString('en-PH', opts)}`
}

function discountPercent(regular: number, promo: number | null | undefined): number | null {
  if (promo == null || !(regular > 0) || !(promo > 0) || promo >= regular) return null
  return Math.round((1 - promo / regular) * 100)
}

function formatPercent(value: number): string {
  return `${Number(value).toLocaleString('en-PH', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}%`
}

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    LimitedTime: 'Limited time',
    StayLongerSaveMore: 'Stay longer, save more',
    GoogleLoyalty: 'Loyalty Coupon',
  }
  return map[kind] || kind
}

function loyaltyApplyLabel(mode?: string | null): string {
  if (mode === 'FirstNight') return 'First night only'
  if (mode === 'WeeklyReset') return 'Once every 7 nights'
  if (mode === 'FirstBooking') return 'First booking only'
  return 'Every night'
}

function loyaltyAmountOff(offer: SpecialOfferDto): number | null {
  if (String(offer.kind) !== 'GoogleLoyalty') return null
  const direct = Number(offer.discountAmount)
  if (direct > 0) return direct
  if (
    offer.promoPricePerNight != null
    && offer.regularPricePerNight > offer.promoPricePerNight
  ) {
    return offer.regularPricePerNight - offer.promoPricePerNight
  }
  return null
}

/** Manila wall time as datetime-local value (yyyy-MM-ddTHH:mm). */
function manilaDateTimeLocal(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/**
 * Converts a Manila wall-time datetime-local string (yyyy-MM-ddTHH:mm)
 * to a UTC ISO string so backend parsing is timezone-safe.
 */
function manilaLocalToUtcIso(value: string): string {
  const [datePart, timePart] = value.split('T')
  if (!datePart || !timePart) throw new Error('Invalid date/time value.')
  const [year, month, day] = datePart.split('-').map((x) => Number.parseInt(x, 10))
  const [hour, minute] = timePart.split(':').map((x) => Number.parseInt(x, 10))
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    throw new Error('Invalid date/time value.')
  }
  // Manila is UTC+8 (no DST). Convert wall-time to UTC.
  const utcMs = Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0)
  return new Date(utcMs).toISOString()
}

/** One admin card per logical offer (siblings = one DB row per room type). */
type OfferGroup = {
  key: string
  primary: SpecialOfferDto
  siblings: SpecialOfferDto[]
  roomTypeNames: string[]
  isCurrentlyActive: boolean
  isActive: boolean
  discountPct: number | null
  promoFrom: number | null
  promoTo: number | null
  regularFrom: number | null
  regularTo: number | null
}

function groupKey(o: SpecialOfferDto): string {
  return `${o.title}|${o.kind}|${o.startsAtUtc}|${o.endsAtUtc}`
}

function offerHasEnded(offer: SpecialOfferDto): boolean {
  const end = Date.parse(offer.endsAtUtc)
  return !Number.isNaN(end) && end < Date.now()
}

function offerStartsInFuture(offer: SpecialOfferDto): boolean {
  const start = Date.parse(offer.startsAtUtc)
  return !Number.isNaN(start) && start > Date.now()
}

function groupStatus(group: OfferGroup): 'live' | 'scheduled' | 'off' {
  if (group.isCurrentlyActive) return 'live'
  if (group.isActive && offerStartsInFuture(group.primary)) return 'scheduled'
  return 'off'
}

function groupAllowsEditDeactivate(group: OfferGroup): boolean {
  return group.isActive && !offerHasEnded(group.primary)
}

function groupIsEffectivelyActive(group: OfferGroup): boolean {
  return group.isActive && !offerHasEnded(group.primary)
}

function groupOffers(rows: SpecialOfferDto[]): OfferGroup[] {
  const map = new Map<string, SpecialOfferDto[]>()
  for (const row of rows) {
    const key = groupKey(row)
    const list = map.get(key) || []
    list.push(row)
    map.set(key, list)
  }

  return Array.from(map.entries()).map(([key, siblings]) => {
    const sorted = siblings.slice().sort((a, b) => a.id - b.id)
    const primary = sorted[0]
    const promos = sorted
      .map((s) => s.promoPricePerNight)
      .filter((p): p is number => p != null && p > 0)
    const regulars = sorted.map((s) => s.regularPricePerNight).filter((r) => r > 0)
    const pcts = sorted
      .map((s) => discountPercent(s.regularPricePerNight, s.promoPricePerNight))
      .filter((p): p is number => p != null && p > 0)

    return {
      key,
      primary,
      siblings: sorted,
      roomTypeNames: sorted.map((s) => s.roomTypeName).filter(Boolean),
      isCurrentlyActive: sorted.some((s) => s.isCurrentlyActive),
      isActive: sorted.some((s) => s.isActive),
      discountPct: pcts.length ? Math.max(...pcts) : null,
      promoFrom: promos.length ? Math.min(...promos) : null,
      promoTo: promos.length ? Math.max(...promos) : null,
      regularFrom: regulars.length ? Math.min(...regulars) : null,
      regularTo: regulars.length ? Math.max(...regulars) : null,
    }
  })
}

function EditAction({ href }: { href: string }) {
  return (
    <a href={href} className="so-action so-action-edit">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 17.3V20h2.7l10-10.1-2.7-2.7L4 17.3zM19.7 7.3a.96.96 0 0 0 0-1.4l-1.6-1.6a.96.96 0 0 0-1.4 0l-1.3 1.3 2.7 2.7 1.6-1z" />
      </svg>
      <span>Edit</span>
    </a>
  )
}

function DeactivateAction({
  disabled,
  busy,
  onClick,
}: {
  disabled?: boolean
  busy?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="so-action so-action-mute"
      disabled={disabled || busy}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 2a8 8 0 0 1 6.32 12.9L7.1 5.68A7.94 7.94 0 0 1 12 4zM5.68 7.1 18.32 19.7A8 8 0 0 1 5.68 7.1z" />
      </svg>
      <span>{busy ? 'Working…' : 'Deactivate'}</span>
    </button>
  )
}

function ReactivateAction({
  disabled,
  busy,
  onClick,
}: {
  disabled?: boolean
  busy?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="so-action so-action-reactivate"
      disabled={disabled || busy}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 5V2L8 6l4 4V7c3.3 0 6 2.7 6 6a6 6 0 0 1-9.9 4.5l-1.4 1.4A8 8 0 0 0 20 13c0-4.4-3.6-8-8-8zm-6 8c0-1.5.5-2.8 1.4-3.9l1.4 1.4A4 4 0 0 0 8 13a4 4 0 0 0 4 4v-3l4 4-4 4v-3a6 6 0 0 1-6-6z" />
      </svg>
      <span>{busy ? 'Working…' : 'Reactivate'}</span>
    </button>
  )
}

function DeleteAction({
  disabled,
  busy,
  onClick,
}: {
  disabled?: boolean
  busy?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="so-action so-action-delete"
      disabled={disabled || busy}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 7h12v2H6V7zm2 3h8l-.7 10.1A1.5 1.5 0 0 1 13.8 21H10.2a1.5 1.5 0 0 1-1.5-1.4L8 10zm3-5h2l.5 1H19v2H5V6h5.5L11 5z" />
      </svg>
    </button>
  )
}

function ViewAction({
  onClick,
}: {
  onClick: () => void
}) {
  return (
    <button type="button" className="so-action so-action-view" onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 5c5.2 0 9.3 3.7 10.5 7-1.2 3.3-5.3 7-10.5 7S2.7 15.3 1.5 12C2.7 8.7 6.8 5 12 5zm0 2c-3.9 0-7.2 2.7-8.4 5 1.2 2.3 4.5 5 8.4 5s7.2-2.7 8.4-5C19.2 9.7 15.9 7 12 7zm0 2.5A2.5 2.5 0 1 1 12 14a2.5 2.5 0 0 1 0-4.5z" />
      </svg>
      <span>View</span>
    </button>
  )
}

function channelLabels(channels: number | string): string {
  const value = typeof channels === 'string' ? Number.parseInt(channels, 10) : channels
  if (!Number.isFinite(value)) return '—'
  const parts: string[] = []
  if (value & 1) parts.push('Online')
  if (value & 2) parts.push('Walk-in')
  return parts.length ? parts.join(', ') : '—'
}

export function SpecialOffersApp() {
  const root = document.getElementById('special-offers-root')
  const canManage = root?.dataset.canManage === 'true'
  const createUrl = root?.dataset.createUrl || '/AdminSpecialOffers/Create'
  const editBase = root?.dataset.editBase || '/AdminSpecialOffers/Edit'

  const [offers, setOffers] = useState<SpecialOfferDto[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'live' | 'off'>('all')
  const [reactivateId, setReactivateId] = useState<number | null>(null)
  const [reactivateEditHref, setReactivateEditHref] = useState('')
  const [reactivateKind, setReactivateKind] = useState('')
  const [reactivateStart, setReactivateStart] = useState('')
  const [reactivateEnd, setReactivateEnd] = useState('')
  const [reactivateError, setReactivateError] = useState<string | null>(null)
  const [viewGroupKey, setViewGroupKey] = useState<string | null>(null)

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const data = await fetchSpecialOffers()
      setOffers(Array.isArray(data) ? data : [])
    } catch (err) {
      notifyMori(err instanceof Error ? err.message : 'Unable to load offers.', 'error')
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handler = (event: Event) => {
      const scopes = (event as CustomEvent<{ scopes?: string[] }>).detail?.scopes || []
      if (scopes.includes('all') || scopes.includes('offers')) {
        void load(false)
      }
    }
    window.addEventListener('mori:admin-refresh', handler)
    return () => window.removeEventListener('mori:admin-refresh', handler)
  }, [load])

  const groups = useMemo(() => groupOffers(offers), [offers])
  const viewGroup = useMemo(() => groups.find((g) => g.key === viewGroupKey), [groups, viewGroupKey])

  const visible = useMemo(() => {
    if (filter === 'live') return groups.filter((g) => g.isCurrentlyActive)
    if (filter === 'off') return groups.filter((g) => !g.isCurrentlyActive)
    return groups
  }, [groups, filter])

  const discountWarning = useMemo(() => {
    const activeLimited = groups
      .filter(
        (g) =>
          groupIsEffectivelyActive(g) &&
          String(g.primary.kind) === 'LimitedTime' &&
          g.discountPct != null,
      )
      .map((g) => g.discountPct as number)
    const activeStayLonger = groups
      .filter(
        (g) =>
          groupIsEffectivelyActive(g) &&
          String(g.primary.kind) === 'StayLongerSaveMore' &&
          g.discountPct != null,
      )
      .map((g) => g.discountPct as number)

    if (!activeLimited.length || !activeStayLonger.length) return null

    const limitedPct = Math.max(...activeLimited)
    const stayLongerPct = Math.max(...activeStayLonger)
    if (limitedPct <= stayLongerPct) return null

    return {
      limitedPct,
      stayLongerPct,
      gapPct: limitedPct - stayLongerPct,
    }
  }, [groups])

  const onDeactivate = async (id: number) => {
    if (!window.confirm('Deactivate this offer for all selected room types?')) return
    setBusyId(id)
    try {
      await deactivateSpecialOffer(id, root)
      notifyMori('Offer deactivated.', 'success')
      await load()
    } catch (err) {
      notifyMori(err instanceof Error ? err.message : 'Unable to deactivate.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const onDelete = async (id: number) => {
    if (
      !window.confirm(
        'Permanently delete this offer for all selected room types? This cannot be undone.',
      )
    ) {
      return
    }
    setBusyId(id)
    try {
      await deleteSpecialOffer(id, root)
      notifyMori('Offer deleted.', 'success')
      await load()
    } catch (err) {
      notifyMori(err instanceof Error ? err.message : 'Unable to delete.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const openReactivate = (offer: SpecialOfferDto) => {
    setReactivateId(offer.id)
    setReactivateEditHref(`${editBase}/${offer.id}`)
    setReactivateKind(kindLabel(String(offer.kind)))
    // Fresh window — do not carry over the old deactivated dates.
    setReactivateStart('')
    setReactivateEnd('')
    setReactivateError(null)
  }

  const closeReactivate = () => {
    if (busyId != null) return
    setReactivateId(null)
    setReactivateEditHref('')
    setReactivateError(null)
  }

  const onConfirmReactivate = async () => {
    if (reactivateId == null) return
    if (!reactivateStart || !reactivateEnd) {
      setReactivateError('Choose both start and end times (Manila).')
      return
    }
    const nowLocal = manilaDateTimeLocal()
    if (reactivateStart < nowLocal) {
      setReactivateError('Start cannot be in the past (Manila time).')
      return
    }
    if (reactivateEnd < nowLocal) {
      setReactivateError('End cannot be in the past (Manila time).')
      return
    }
    if (reactivateEnd <= reactivateStart) {
      setReactivateError('End must be after start.')
      return
    }

    const target = offers.find((o) => o.id === reactivateId)
    if (target) {
      const hasLiveSameKind = offers.some(
        (o) =>
          o.id !== reactivateId &&
          String(o.kind) === String(target.kind) &&
          o.isActive &&
          o.isCurrentlyActive,
      )
      if (hasLiveSameKind) {
        setReactivateError(
          `Another ${kindLabel(String(target.kind))} offer is currently live. Deactivate it first, then reactivate this one.`,
        )
        return
      }
    }

    setBusyId(reactivateId)
    setReactivateError(null)
    try {
      const startUtcIso = manilaLocalToUtcIso(reactivateStart)
      const endUtcIso = manilaLocalToUtcIso(reactivateEnd)
      await reactivateSpecialOffer(reactivateId, startUtcIso, endUtcIso, root)
      notifyMori(
        'Offer reactivated successfully. Status will switch to Live automatically at the selected Manila start time.',
        'success',
      )
      setReactivateId(null)
      await load()
    } catch (err) {
      setReactivateError(err instanceof Error ? err.message : 'Unable to reactivate.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="so-app">
      <header className="so-header">
        <div>
          <p className="so-eyebrow">{canManage ? 'Admin' : 'Reception'}</p>
          <h1>Special offers</h1>
          <p className="so-lede">
            {canManage
              ? 'Limited Time rates replace the sellable price while active. One calm palette — navy, teal, white.'
              : 'Live promotions in effect now. Reception can view current offers only.'}
          </p>
        </div>
        {canManage ? (
        <div className="so-header-actions">
          <a className="so-btn so-btn-primary" href={createUrl}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Create offer</span>
          </a>
        </div>
        ) : null}
      </header>

      {discountWarning ? (
        <div className="so-warning-banner" role="status">
          <strong>Pricing note:</strong> Limited Time discount is {formatPercent(discountWarning.limitedPct)},
          higher than Stay Longer, Save More at {formatPercent(discountWarning.stayLongerPct)} (gap{' '}
          {formatPercent(discountWarning.gapPct)}). This can reduce the long-stay offer appeal.
        </div>
      ) : null}

      <div className="so-toolbar">
        {canManage ? (
        <div className="so-filters" role="tablist" aria-label="Filter offers">
          {(
            [
              ['all', 'All'],
              ['live', 'Live'],
              ['off', 'Not live'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={`so-filter${filter === id ? ' is-active' : ''}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        ) : (
          <p className="so-count">Current live offers</p>
        )}
        <p className="so-count">
          {loading ? 'Loading…' : `${visible.length} offer${visible.length === 1 ? '' : 's'}`}
        </p>
      </div>

      <section className="so-panel">
        {loading ? (
          <p className="so-empty">Loading offers…</p>
        ) : visible.length === 0 ? (
          <div className="so-empty-state">
            <p className="so-empty">
              {canManage ? 'No offers in this view yet.' : 'No current offers are live right now.'}
            </p>
            {canManage ? (
            <a className="so-btn so-btn-primary" href={createUrl}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Create offer</span>
            </a>
            ) : null}
          </div>
        ) : (
          <ul className="so-list">
            {visible.map((group) => {
              const offer = group.primary
              const pct = group.discountPct
              const status = groupStatus(group)
              const roomsLabel = group.roomTypeNames.join(', ') || '—'
              const hasPromo = group.promoFrom != null
              const promoSame = group.promoFrom === group.promoTo
              const regularSame = group.regularFrom === group.regularTo
              const isLoyalty = String(offer.kind) === 'GoogleLoyalty'
              const couponOff = loyaltyAmountOff(offer)
              return (
                <li key={group.key} className="so-card">
                  <div className="so-card-main">
                    <div className="so-card-title-row">
                      <h2>{kindLabel(String(offer.kind))}</h2>
                      <span className={`so-status is-${status}`}>
                        {status === 'live' ? 'Live' : status === 'scheduled' ? 'Scheduled' : 'Off'}
                      </span>
                    </div>
                    <p className="so-meta">
                      <span>{roomsLabel}</span>
                      {offer.kind === 'StayLongerSaveMore' && offer.minNights != null ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{offer.minNights}+ nights</span>
                        </>
                      ) : null}
                      {isLoyalty ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{loyaltyApplyLabel(offer.loyaltyApplyMode)}</span>
                        </>
                      ) : null}
                      {!isLoyalty && offer.cashOnly ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Cash only</span>
                        </>
                      ) : null}
                    </p>
                    <div className="so-price">
                      {hasPromo ? (
                        <>
                          {couponOff != null && couponOff > 0 ? (
                            <span className="so-pct">−{money(couponOff)}</span>
                          ) : !isLoyalty && pct != null && pct > 0 ? (
                            <span className="so-pct">−{pct}%</span>
                          ) : null}
                          {group.regularFrom != null ? (
                            <s>
                              {regularSame
                                ? money(group.regularFrom)
                                : `${money(group.regularFrom)}–${money(group.regularTo!)}`}
                            </s>
                          ) : null}
                          <strong>
                            {promoSame
                              ? money(group.promoFrom!)
                              : `${money(group.promoFrom!)}–${money(group.promoTo!)}`}
                          </strong>
                          <span className="so-price-note">/ night</span>
                        </>
                      ) : (
                        <>
                          <strong>
                            {group.regularFrom != null
                              ? regularSame
                                ? money(group.regularFrom)
                                : `${money(group.regularFrom)}–${money(group.regularTo!)}`
                              : '—'}
                          </strong>
                          <span className="so-price-note">base / night</span>
                        </>
                      )}
                    </div>
                    <p className="so-window">{formatWindow(offer.startsAtUtc, offer.endsAtUtc, offer.openEnded)}</p>
                  </div>
                  <div className="so-card-actions">
                    {canManage ? (
                      groupAllowsEditDeactivate(group) ? (
                        <>
                          <EditAction href={`${editBase}/${offer.id}`} />
                          <DeactivateAction
                            busy={busyId === offer.id}
                            onClick={() => void onDeactivate(offer.id)}
                          />
                        </>
                      ) : (
                        <ReactivateAction
                          busy={busyId === offer.id}
                          onClick={() => openReactivate(offer)}
                        />
                      )
                    ) : (
                      <ViewAction onClick={() => setViewGroupKey(group.key)} />
                    )}
                    {canManage && (
                      <DeleteAction
                        busy={busyId === offer.id}
                        onClick={() => void onDelete(offer.id)}
                      />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {viewGroup ? (
        <div className="so-modal-backdrop" role="presentation" onClick={() => setViewGroupKey(null)}>
          <div
            className="so-modal so-modal-view"
            role="dialog"
            aria-modal="true"
            aria-labelledby="so-view-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="so-view-title">{kindLabel(String(viewGroup.primary.kind))}</h2>
            <p className="so-modal-lede">
              {groupStatus(viewGroup) === 'live'
                ? 'Live now'
                : groupStatus(viewGroup) === 'scheduled'
                  ? 'Scheduled'
                  : 'Not active'}{' '}
              ·{' '}
              {formatWindow(viewGroup.primary.startsAtUtc, viewGroup.primary.endsAtUtc, viewGroup.primary.openEnded)}
            </p>
            <dl className="so-view-dl">
              <div>
                <dt>Room types</dt>
                <dd>{viewGroup.roomTypeNames.join(', ') || '—'}</dd>
              </div>
              {viewGroup.primary.kind === 'StayLongerSaveMore' && viewGroup.primary.minNights != null ? (
                <div>
                  <dt>Minimum stay</dt>
                  <dd>{viewGroup.primary.minNights}+ nights</dd>
                </div>
              ) : null}
              <div>
                <dt>Channels</dt>
                <dd>{channelLabels(viewGroup.primary.channels)}</dd>
              </div>
              {String(viewGroup.primary.kind) !== 'GoogleLoyalty' ? (
                <div>
                  <dt>Payment</dt>
                  <dd>{viewGroup.primary.cashOnly ? 'Cash only at front desk' : 'Standard payment options'}</dd>
                </div>
              ) : null}
              {String(viewGroup.primary.kind) === 'GoogleLoyalty' ? (
                <>
                  {loyaltyAmountOff(viewGroup.primary) != null ? (
                    <div>
                      <dt>Amount off</dt>
                      <dd>−{money(loyaltyAmountOff(viewGroup.primary)!)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>When to deduct</dt>
                    <dd>{loyaltyApplyLabel(viewGroup.primary.loyaltyApplyMode)}</dd>
                  </div>
                </>
              ) : viewGroup.discountPct != null && viewGroup.discountPct > 0 ? (
                <div>
                  <dt>Discount</dt>
                  <dd>−{viewGroup.discountPct}% off regular rate</dd>
                </div>
              ) : null}
              <div>
                <dt>Nightly rate</dt>
                <dd>
                  {viewGroup.promoFrom != null
                    ? viewGroup.promoFrom === viewGroup.promoTo
                      ? money(viewGroup.promoFrom)
                      : `${money(viewGroup.promoFrom)} – ${money(viewGroup.promoTo!)}`
                    : viewGroup.regularFrom != null
                      ? viewGroup.regularFrom === viewGroup.regularTo
                        ? money(viewGroup.regularFrom)
                        : `${money(viewGroup.regularFrom)} – ${money(viewGroup.regularTo!)}`
                      : '—'}
                  <span className="so-view-rate-note"> / night</span>
                </dd>
              </div>
              {viewGroup.regularFrom != null && viewGroup.promoFrom != null ? (
                <div>
                  <dt>Regular rate</dt>
                  <dd>
                    {viewGroup.regularFrom === viewGroup.regularTo
                      ? money(viewGroup.regularFrom)
                      : `${money(viewGroup.regularFrom)} – ${money(viewGroup.regularTo!)}`}
                  </dd>
                </div>
              ) : null}
              {String(viewGroup.primary.kind) !== 'GoogleLoyalty' && viewGroup.primary.description?.trim() ? (
                <div>
                  <dt>Notes</dt>
                  <dd>{viewGroup.primary.description.trim()}</dd>
                </div>
              ) : null}
            </dl>
            {viewGroup.siblings.length > 1 ? (
              <div className="so-view-breakdown">
                <h3>By room type</h3>
                <ul>
                  {viewGroup.siblings.map((row) => {
                    const pct = discountPercent(row.regularPricePerNight, row.promoPricePerNight)
                    return (
                      <li key={row.id}>
                        <strong>{row.roomTypeName}</strong>
                        <span>
                          {row.promoPricePerNight != null && row.promoPricePerNight > 0
                            ? money(row.promoPricePerNight)
                            : money(row.regularPricePerNight)}
                          / night
                          {pct != null && pct > 0 ? ` (−${pct}%)` : ''}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
            <div className="so-modal-actions">
              <button type="button" className="so-btn so-btn-primary" onClick={() => setViewGroupKey(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reactivateId != null ? (
        <div className="so-modal-backdrop" role="presentation" onClick={closeReactivate}>
          <div
            className="so-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="so-reactivate-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="so-reactivate-title">Reactivate offer</h2>
            <p className="so-modal-lede">
              Choose a new start and end for <strong>{reactivateKind}</strong> (Manila time).
              Previous dates are cleared.
            </p>
            <div className="so-modal-fields">
              <label>
                <span>Starts</span>
                <input
                  type="datetime-local"
                  value={reactivateStart}
                  min={manilaDateTimeLocal()}
                  onChange={(e) => setReactivateStart(e.target.value)}
                />
              </label>
              <label>
                <span>Ends</span>
                <input
                  type="datetime-local"
                  value={reactivateEnd}
                  min={
                    reactivateStart && reactivateStart > manilaDateTimeLocal()
                      ? reactivateStart
                      : manilaDateTimeLocal()
                  }
                  onChange={(e) => setReactivateEnd(e.target.value)}
                />
              </label>
            </div>
            {reactivateError ? (
              <p className="so-modal-error" role="alert">
                {reactivateError}
              </p>
            ) : null}
            <div className="so-modal-actions">
              <button type="button" className="so-btn so-btn-ghost" onClick={closeReactivate}>
                Cancel
              </button>
              {reactivateEditHref ? (
                <a className="so-btn so-btn-ghost" href={reactivateEditHref}>
                  Edit
                </a>
              ) : null}
              <button
                type="button"
                className="so-btn so-btn-primary"
                disabled={busyId === reactivateId}
                onClick={() => void onConfirmReactivate()}
              >
                {busyId === reactivateId ? 'Saving…' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
