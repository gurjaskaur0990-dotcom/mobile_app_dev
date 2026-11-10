import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { PushNotifications } from '@capacitor/push-notifications'
import { IonIcon } from '@ionic/react'
import { closeOutline, warningOutline } from 'ionicons/icons'
import { native } from '../platform/native'
import { millis } from '../legacy/account'
import type { Trip } from '../../shared/model'
import { useApp } from '../platform/context'
import { useRows, useRecord } from '../platform/live'
import { useDraft } from '../platform/drafts'
import {
  PageHeading,
  DateText,
  PersonName,
  ReadState,
  useAction,
  useOnline,
  type Person,
} from './forms'
import { enablePush, pushAccount, pushAvailable, disablePush, pushChangeEvent } from './push'
import './style.css'
export { Administration } from './administration'

type MemberCard = {
  displayName: string
  email?: string
  hideEmail?: boolean
  username?: string
  photoURL?: string
}
type Invitation = {
  id: string
  name: string
  createdAt?: unknown
  createdBy: string
  isDeleted?: boolean
  isArchived?: boolean
  pendingMemberUids?: string[]
  pendingMembers?: Record<string, MemberCard>
  members?: Record<string, MemberCard>
}
type NotificationItem = {
  id: string
  title: string
  body: string
  tripId?: string
  receivedAt?: unknown
  isRead?: boolean
}
export type AnnouncementRecord = { message?: string; isEnabled?: boolean; updatedAt?: unknown }

export function Members({ trip }: { trip: Trip }) {
  const { uid, command, queue } = useApp()
  const removing = queue.filter(
    (item) => item.name === 'member.remove' && item.payload.tripId === trip.id,
  )
  const active = trip.state === 'active'
  const data = useRecord<Invitation>('trips/' + trip.id)
  const pending = data.data?.pendingMemberUids || []
  const [inviting, setInviting] = useState(false)
  const sheet = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (inviting && !sheet.current?.open) sheet.current?.showModal()
  }, [inviting])
  const [query, setQuery] = useState('')
  const [person, setPerson] = useState<Person | null>(null)
  const { busy, status, run } = useAction()
  const online = useOnline()
  return (
    <section className="card collaboration-card">
      <h2>Members</h2>
      <ul>
        {trip.memberIds.map((id) => (
          <li key={id} className="row">
            <span>
              {trip.members[id]?.displayName || 'Member'}
              {id === uid ? ' (you)' : ''}
              {data.data?.members?.[id] && (
                <small className="member-contact">
                  {data.data.members[id].hideEmail
                    ? data.data.members[id].username
                      ? '@' + data.data.members[id].username
                      : ''
                    : data.data.members[id].email}
                </small>
              )}
              {id === trip.ownerId ? ' · Owner' : ''}
            </span>
            {active && uid === trip.ownerId && uid !== id && (
              <button
                className="secondary"
                disabled={busy || removing.some((item) => item.payload.memberId === id)}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Remove ${trip.members[id]?.displayName || 'this member'} from the trip?`,
                    )
                  )
                    return
                  void run(async () => {
                    const result = await command(
                      'member.remove',
                      { tripId: trip.id, memberId: id },
                      { expectedRevision: trip.revision },
                    )
                    return result.pending ? 'Removal pending.' : 'Member removed.'
                  })
                }}
              >
                {removing.some((item) => item.payload.memberId === id)
                  ? 'Removal pending sync'
                  : 'Remove'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {pending.length > 0 && (
        <>
          <h3>Pending invitations</h3>
          <ul>
            {pending.map((id) => (
              <li key={id}>{data.data?.pendingMembers?.[id]?.displayName || 'Invited member'}</li>
            ))}
          </ul>
        </>
      )}
      {active && (
        <button className="button" onClick={() => setInviting(!inviting)}>
          Invite member
        </button>
      )}
      {active && inviting && (
        <dialog
          ref={sheet}
          className="invite-sheet collaboration-card"
          aria-label="Invite member"
          onCancel={() => setInviting(false)}
          onClose={() => setInviting(false)}
        >
          <div className="row">
            <h3>Invite member</h3>
            <button aria-label="Close invitation" onClick={() => setInviting(false)}>
              Close
            </button>
          </div>
          {!online && <p role="status">Connect to the internet to send invitations.</p>}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void run(async () => {
                setPerson(null)
                const result = await command(
                  'member.lookup',
                  { tripId: trip.id, query },
                  { onlineOnly: true },
                )
                setPerson(result.user)
                return result.user ? '' : 'No matching account.'
              })
            }}
          >
            <label className="field">
              Exact username or email
              <input
                value={query}
                required
                maxLength={320}
                disabled={busy}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPerson(null)
                }}
              />
            </label>
            <button type="submit" disabled={!online || busy}>
              Find user
            </button>
          </form>
          {person && (
            <div className="row">
              <PersonName person={person} />
              <button
                disabled={
                  !online ||
                  busy ||
                  trip.memberIds.includes(person.uid) ||
                  pending.includes(person.uid)
                }
                onClick={() =>
                  void run(async () => {
                    await command(
                      'member.invite',
                      { tripId: trip.id, recipientId: person.uid },
                      { onlineOnly: true },
                    )
                    setPerson(null)
                    setQuery('')
                    setInviting(false)
                    return 'Invitation confirmed.'
                  })
                }
              >
                {trip.memberIds.includes(person.uid)
                  ? 'Already a member'
                  : pending.includes(person.uid)
                    ? 'Invited'
                    : 'Send invitation'}
              </button>
            </div>
          )}
          {status}
        </dialog>
      )}
      {!inviting && status}
    </section>
  )
}

export function Invitations() {
  const { uid, command, queue } = useApp()
  const invitations = useRows<Invitation>('trips', [['pendingMemberUids', 'array-contains', uid]])
  const available = [...invitations.data].sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
  const { busy, run, status } = useAction()
  const respond = (tripId: string, accept: boolean) =>
    run(async () => {
      const result = await command('invitation.respond', { tripId, accept, recipientId: uid })
      if (result.pending) return 'Response saved on this device.'
      if (result.status === 'resolved') return 'This invitation has already been answered.'
      return accept ? 'You joined the trip.' : 'Invitation declined.'
    })
  if (!available.length && !invitations.error) return null
  return (
    <section className="card collaboration-card">
      <h2>Trip invitations ({available.length})</h2>
      <ReadState state={invitations}>
        {!available.length ? (
          <p>No pending invitations.</p>
        ) : (
          <ul>
            {available.map((item) => {
              const queued = queue.find(
                (q) => q.name === 'invitation.respond' && q.payload.tripId === item.id,
              )
              return (
                <li key={item.id}>
                  <strong>{item.name}</strong>
                  <p>Created by {item.members?.[item.createdBy]?.displayName || 'Trip creator'}</p>
                  <button disabled={!!queued || busy} onClick={() => void respond(item.id, true)}>
                    Accept
                  </button>{' '}
                  <button
                    className="secondary"
                    disabled={!!queued || busy}
                    onClick={() => void respond(item.id, false)}
                  >
                    Decline
                  </button>
                  {queued && (
                    <p role="status">
                      {queued.error
                        ? 'Response needs review in Settings.'
                        : queued.payload.accept
                          ? 'Acceptance pending sync.'
                          : 'Decline pending sync.'}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </ReadState>
      {status}
    </section>
  )
}

export function Inbox() {
  const { uid, command } = useApp()
  const rows = useRows<NotificationItem>(`users/${uid}/notifications`, [], {
    orderBy: ['receivedAt', 'desc'],
    limit: 50,
  })
  const navigate = useNavigate()
  useEffect(() => {
    if (native) void PushNotifications.removeAllDeliveredNotifications().catch(() => {})
  }, [])
  const [selected, setSelected] = useState<string[]>([])
  const { busy, run, status } = useAction()
  const items = [...rows.data].sort((a, b) => millis(b.receivedAt) - millis(a.receivedAt))
  const displayed = items.slice(0, 50)
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current || rows.loading || rows.cached || rows.error || !navigator.onLine) return
    opened.current = true
    const unread = displayed.filter((item) => !item.isRead).map((item) => item.id)
    if (unread.length)
      void command('inbox.read', { ids: unread }).catch(() => {
        opened.current = false
      })
  }, [rows, command, displayed])
  const selectedIds = selected.filter((id) => items.some((item) => item.id === id))
  function change(name: string, ids: string[]) {
    void run(async () => {
      let pending = false
      for (let offset = 0; offset < ids.length; offset += 100) {
        const result = await command(name, { ids: ids.slice(offset, offset + 100) })
        pending ||= Boolean(result.pending)
      }
      setSelected([])
      return pending ? 'Inbox update pending.' : 'Inbox updated.'
    })
  }
  return (
    <>
      <PageHeading title="Notifications" />

      <section className="card collaboration-card">
        <h2>Activity</h2>
        <ReadState state={rows}>
          {items.length > 0 ? (
            <>
              <p>{displayed.filter((item) => !item.isRead).length} unread</p>
              <div className="actions">
                <button
                  className="secondary"
                  disabled={busy || !selectedIds.length}
                  onClick={() => change('inbox.read', selectedIds)}
                >
                  Mark selected read
                </button>
                <button
                  className="secondary"
                  disabled={busy || !selectedIds.length}
                  onClick={() => change('inbox.delete', selectedIds)}
                >
                  Delete selected
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('Clear all of your activity?'))
                      change(
                        'inbox.clear',
                        items.map((i) => i.id),
                      )
                  }}
                >
                  Clear inbox
                </button>
              </div>
              <ul>
                {displayed.map((item, index) => (
                  <li key={item.id}>
                    {(index === 0 ||
                      new Date(millis(displayed[index - 1].receivedAt)).toDateString() !==
                        new Date(millis(item.receivedAt)).toDateString()) && (
                      <h3>
                        <DateText value={millis(item.receivedAt)} />
                      </h3>
                    )}
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, item.id]
                              : selected.filter((id) => id !== item.id),
                          )
                        }
                      />{' '}
                      {item.title}
                    </label>
                    <p>{item.body}</p>
                    <small>
                      {item.isRead ? 'Read' : 'Unread'} ·{' '}
                      <DateText value={millis(item.receivedAt)} />
                    </small>{' '}
                    <button
                      className="secondary"
                      onClick={() =>
                        void run(async () => {
                          await command('inbox.read', { ids: [item.id] })
                          if (item.tripId && !item.tripId.includes('/'))
                            navigate('/trip/' + encodeURIComponent(item.tripId))
                        })
                      }
                    >
                      {item.tripId ? 'Open trip' : 'Mark read'}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>Your inbox is empty.</p>
          )}
        </ReadState>
        {status}
      </section>
    </>
  )
}

export function Announcement() {
  const { data } = useRecord<AnnouncementRecord>('config/announcement')
  return (
    <HomeBanner key={data?.message} message={data?.message ?? ''} enabled={!!data?.isEnabled} />
  )
}

function HomeBanner({ message, enabled }: { message: string; enabled: boolean }) {
  const [dismissed, setDismissed] = useState(false)
  return enabled && message.trim() && !dismissed ? (
    <aside className="home-announcement" aria-label="Announcement">
      <IonIcon icon={warningOutline} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" aria-label="Dismiss announcement" onClick={() => setDismissed(true)}>
        <IonIcon icon={closeOutline} aria-hidden="true" />
      </button>
    </aside>
  ) : null
}

export function Feedback() {
  const { command } = useApp()
  const [draft, setDraft, clear] = useDraft('feedback', { category: 'bug', body: '' })
  const { busy, status, run } = useAction()
  return (
    <section className="card collaboration-card">
      <h2>Send feedback</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            const result = await command('feedback.submit', draft)
            clear()
            return result.pending ? 'Feedback pending.' : 'Feedback received.'
          })
        }}
      >
        <label className="field">
          Type
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          >
            <option value="feedback">General feedback</option>
            <option value="bug">Bug report</option>
            <option value="feature">Feature request</option>
          </select>
        </label>
        <label className="field">
          Message
          <textarea
            required
            rows={4}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
        </label>
        <button disabled={busy}>Submit feedback</button>
      </form>
      {status}
    </section>
  )
}

export function PushSettings() {
  const { uid, command } = useApp()
  const [supported, setSupported] = useState(false)
  const [enabled, setEnabled] = useState(pushAccount() === uid)
  const { busy, run, status } = useAction()
  const online = useOnline()
  useEffect(() => {
    let mounted = true
    const sync = () => setEnabled(pushAccount() === uid)
    window.addEventListener(pushChangeEvent, sync)
    window.addEventListener('storage', sync)
    void pushAvailable().then((v) => {
      if (mounted) setSupported(v)
    })
    sync()
    return () => {
      mounted = false
      window.removeEventListener(pushChangeEvent, sync)
      window.removeEventListener('storage', sync)
    }
  }, [uid])
  return (
    <section className="card collaboration-card">
      <h2>Push notifications</h2>
      {!supported ? (
        <p>Push is unavailable on this installation. New activity appears in your inbox.</p>
      ) : (
        <button
          disabled={busy || !online}
          onClick={() =>
            void run(async () => {
              if (enabled) {
                await disablePush(command)
                setEnabled(false)
                return 'Push notifications disabled.'
              }
              await enablePush(uid, command)
              setEnabled(true)
              return 'Push notifications enabled.'
            })
          }
        >
          {enabled ? 'Disable push notifications' : 'Enable push notifications'}
        </button>
      )}
      {status}
    </section>
  )
}
