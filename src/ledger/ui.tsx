import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { IonIcon } from '@ionic/react'
import {
  alertCircleOutline,
  arrowBackOutline,
  cloudOfflineOutline,
  folderOpenOutline,
} from 'ionicons/icons'
import { Link } from 'react-router-dom'
import { useApp } from '../platform/context'
import { useEffect, useRef } from 'react'
import type { Trip, Entry } from './data'
export type { Trip, Entry } from './data'
export { useTrips } from './data'
export function money(paise: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paise / 100)
}
export function relativeDate(value: number | null | undefined) {
  if (!value) return 'Recently'
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return minutes + 'm ago'
  if (minutes < 1440) return Math.floor(minutes / 60) + 'h ago'
  if (minutes < 10080) return Math.floor(minutes / 1440) + 'd ago'
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(value)
}
export function Avatar({ trip, uid, name }: { trip: Trip; uid: string; name?: string }) {
  const member = trip.members[uid],
    title = member?.displayName || name || 'Unknown'
  const [failed, fail] = useState(false)
  return (
    <span className="ld-avatar" aria-hidden="true">
      {member?.photoURL && !failed ? (
        <img src={member.photoURL} alt="" referrerPolicy="no-referrer" onError={() => fail(true)} />
      ) : (
        title
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((t) => t[0])
          .join('')
          .toUpperCase()
      )}
    </span>
  )
}
export function Sheet({
  title,
  close,
  children,
}: {
  title: string
  close: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      className="ld-sheet"
      ref={ref}
      aria-label={title}
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section>
        <h2>{title}</h2>
        {children}
      </section>
    </dialog>
  )
}
export function useHold(action: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggered = useRef(false)
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => cancel, [])
  return {
    onPointerDown: () => {
      cancel()
      triggered.current = false
      timer.current = setTimeout(() => {
        triggered.current = true
        action()
      }, 550)
    },
    onPointerCancel: cancel,
    onPointerMove: (event: React.PointerEvent) => {
      if (Math.abs(event.movementX) + Math.abs(event.movementY) > 6) cancel()
    },
    onPointerUp: cancel,
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault()
      cancel()
      triggered.current = true
      action()
    },
    onClickCapture: (event: React.MouseEvent) => {
      if (triggered.current) {
        event.preventDefault()
        event.stopPropagation()
        triggered.current = false
      }
    },
  }
}
export const tripPath = (id: string, section = 'expenses') =>
  '/trips/' + encodeURIComponent(id) + '/' + section
export const entryPath = (tripId: string, entryId: string) =>
  tripPath(tripId) + '/' + encodeURIComponent(entryId)
export function person(trip: Trip, uid: string) {
  return trip.members[uid]?.displayName || 'Unknown'
}
export function date(value?: number | null, detailed = false) {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.DateTimeFormat(
    'en-IN',
    detailed
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' },
  ).format(value)
}
export function canChange(trip: Trip, entry: Entry, uid: string) {
  return (
    trip.state === 'active' &&
    (trip.ownerId === uid || entry.authorId === uid) &&
    (entry.type === 'contribution' ? trip.budgetEnabled : trip.editingEnabled)
  )
}
export function label(entry: Entry) {
  return entry.type === 'expense'
    ? entry.title
    : entry.type === 'contribution'
      ? 'Budget contribution'
      : entry.storedTitle || 'Settlement'
}
export function summary(trip: Trip, entry: Entry) {
  if (entry.type === 'repayment')
    return person(trip, entry.debtorId) + ' paid ' + person(trip, entry.creditorId)
  if (entry.type === 'contribution') return 'From ' + person(trip, entry.contributorId)
  return 'Paid by ' + (trip.members[entry.payerId]?.displayName || entry.paidByName || 'Unknown')
}
export function Icon({ icon }: { icon: string }) {
  return <IonIcon aria-hidden="true" icon={icon} />
}
export function Heading({
  title,
  children,
  back,
  sub,
}: {
  title: string
  children?: ReactNode
  back?: { to: string; text: string }
  sub?: string
}) {
  return (
    <header className="ld-heading">
      {back && (
        <Link className="ld-back" aria-label={back.text} to={back.to}>
          <Icon icon={arrowBackOutline} />
          <span className="ld-sr">{back.text}</span>
        </Link>
      )}
      <div className="ld-heading-row">
        <div>
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {children}
      </div>
    </header>
  )
}
export function Empty({
  title,
  children,
  icon = folderOpenOutline,
}: {
  title: string
  children?: ReactNode
  icon?: string
}) {
  return (
    <div className="ld-empty">
      <span className="ld-empty-icon">
        <Icon icon={icon} />
      </span>
      <div>
        <h3>{title}</h3>
        {children && <p>{children}</p>}
      </div>
    </div>
  )
}
export function Status({
  loading,
  error,
  cached,
}: {
  loading?: boolean
  error?: unknown
  cached?: boolean
}) {
  if (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return (
      <p role="alert" className="ld-alert">
        <Icon icon={alertCircleOutline} />
        {/permission|denied/i.test(detail)
          ? 'You don’t have access to these records.'
          : 'Unable to load these records. ' + detail}
      </p>
    )
  }
  if (loading)
    return (
      <p role="status" className="ld-note">
        Loading records…
      </p>
    )
  if (cached)
    return (
      <p role="status" className="ld-note">
        <Icon icon={cloudOfflineOutline} />
        Showing the copy saved on this device.
      </p>
    )
  return null
}
export type Notice = { text: string; error?: boolean; undo?: () => void }
export function Feedback({ notice }: { notice: Notice | null }) {
  return notice ? (
    <div
      className={notice.error ? 'ld-alert' : 'ld-feedback'}
      role={notice.error ? 'alert' : 'status'}
    >
      {notice.text}
      {notice.undo && (
        <button className="ld-text" type="button" onClick={notice.undo}>
          Undo
        </button>
      )}
    </div>
  ) : null
}
export function useAction() {
  const { command } = useApp()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  async function run(
    name: string,
    payload: Record<string, unknown>,
    success: string,
    options?: { onlineOnly?: boolean; expectedRevision?: number },
    undo?: () => void,
  ) {
    setBusy(true)
    setNotice(null)
    try {
      const result = await command(name, payload, options)
      setNotice({
        text: result.pending
          ? 'Pending sync. This change will be sent when you reconnect.'
          : success,
        undo,
      })
      return result
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'The change could not be saved.',
        error: true,
      })
      return null
    } finally {
      setBusy(false)
    }
  }
  return { busy, notice, setNotice, run }
}
export function Form({ children, submit }: { children: ReactNode; submit: () => void }) {
  return (
    <form
      className="ld-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        submit()
      }}
    >
      {children}
    </form>
  )
}
