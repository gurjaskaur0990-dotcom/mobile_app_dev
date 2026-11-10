import { useState } from 'react'
import { useApp } from '../platform/context'
import { useRows, useRecord } from '../platform/live'
import { millis } from '../legacy/account'
import { PageHeading, DateText, ReadState, useAction, useOnline } from './forms'
import type { AnnouncementRecord } from './index'

type Broadcast = {
  id: string
  title: string
  body: string
  status?: string
  sentCount?: number
  failedCount?: number
  createdAt?: unknown
}
type Submission = {
  id: string
  userDisplayName: string
  userEmail: string
  message: string
  type: string
  status: string
  adminNotes?: string
  createdAt?: unknown
}
type UserRow = {
  id: string
  displayName: string
  email: string
  username?: string
  isSuspended?: boolean
}

function AnnouncementEditor() {
  const row = useRecord<AnnouncementRecord>('config/announcement')
  const { command } = useApp(),
    action = useAction()
  const [draft, setDraft] = useState<string | null>(null)
  const message = draft ?? row.data?.message ?? ''
  function save(enabled: boolean) {
    void action.run(async () => {
      await command('announcement.save', { enabled, body: message }, { onlineOnly: true })
      setDraft(null)
      return 'Announcement saved.'
    })
  }
  return (
    <section className="card collaboration-card">
      <h2>System announcement banner</h2>
      <ReadState state={row}>
        <label className="field">
          Announcement message
          <textarea value={message} onChange={(e) => setDraft(e.target.value)} />
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!row.data?.isEnabled}
            disabled={action.busy}
            onChange={(e) => save(e.target.checked)}
          />{' '}
          Enable banner on home screen
        </label>
        <p>
          <button disabled={action.busy} onClick={() => save(!!row.data?.isEnabled)}>
            Save announcement
          </button>
        </p>
      </ReadState>
      {action.status}
    </section>
  )
}

function Broadcasts() {
  const rows = useRows<Broadcast>('broadcasts'),
    { command } = useApp(),
    action = useAction()
  const [title, setTitle] = useState(''),
    [body, setBody] = useState('')
  return (
    <>
      <AnnouncementEditor />
      <section className="card collaboration-card">
        <h2>Send broadcast</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void action.run(async () => {
              await command('broadcast.send', { title, body }, { onlineOnly: true })
              setTitle('')
              setBody('')
              return 'Broadcast queued.'
            })
          }}
        >
          <label className="field">
            Notification title
            <input required value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            Message body
            <textarea required value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <button disabled={action.busy}>Send broadcast</button>
        </form>
        {action.status}
      </section>
      <section className="card collaboration-card">
        <h2>Broadcast history</h2>
        <ReadState state={rows}>
          {rows.data.length ? (
            <ul>
              {[...rows.data]
                .sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
                .map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                    <p>
                      {item.status || 'pending'} · {item.sentCount || 0} sent ·{' '}
                      {item.failedCount || 0} failed · <DateText value={millis(item.createdAt)} />
                    </p>
                    <button
                      onClick={() => {
                        setTitle(item.title)
                        setBody(item.body)
                      }}
                    >
                      Use as template
                    </button>{' '}
                    <button
                      className="secondary"
                      disabled={action.busy}
                      onClick={() => {
                        if (window.confirm('Delete this broadcast from history?'))
                          void action.run(async () => {
                            await command('broadcast.delete', { id: item.id }, { onlineOnly: true })
                            return 'Broadcast deleted.'
                          })
                      }}
                    >
                      Delete broadcast
                    </button>
                  </li>
                ))}
            </ul>
          ) : (
            <p>No previous broadcasts.</p>
          )}
        </ReadState>
      </section>
    </>
  )
}

function Accounts() {
  const users = useRows<UserRow>('users'),
    { uid, command } = useApp(),
    action = useAction()
  const [search, setSearch] = useState('')
  const text = search.trim().toLowerCase().replace(/^@/, '')
  const matched = users.data.filter((user) =>
    [user.displayName, user.username, user.email].some((v) =>
      String(v || '')
        .toLowerCase()
        .includes(text),
    ),
  )
  return (
    <section className="card collaboration-card">
      <h2>User management</h2>
      <label className="field">
        Search by name, email or username
        <input value={search} onChange={(e) => setSearch(e.target.value)} type="search" />
      </label>
      <ReadState state={users}>
        <ul>
          {matched.map((user) => (
            <li key={user.id}>
              <strong>{user.displayName}</strong> {user.username && '@' + user.username}
              <p>
                {user.email} · {user.isSuspended ? 'Suspended' : 'Active'}
              </p>
              {user.id !== uid && (
                <button
                  className="secondary"
                  disabled={action.busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `${user.isSuspended ? 'Reactivate' : 'Suspend'} ${user.displayName}?`,
                      )
                    )
                      void action.run(async () => {
                        await command(
                          'account.suspend',
                          { uid: user.id, suspended: !user.isSuspended },
                          { onlineOnly: true },
                        )
                        return 'Account updated.'
                      })
                  }}
                >
                  {user.isSuspended ? 'Reactivate account' : 'Suspend account'}
                </button>
              )}
            </li>
          ))}
        </ul>
        {!matched.length && <p>No matching users.</p>}
      </ReadState>
      {action.status}
    </section>
  )
}
function Ticket({ item }: { item: Submission }) {
  const { command } = useApp(),
    action = useAction()
  const [draft, setDraft] = useState<{ status: string; notes: string } | null>(null)
  const form = draft ?? { status: item.status || 'open', notes: item.adminNotes || '' }
  return (
    <li>
      <strong>{item.userDisplayName}</strong> · {item.type} ·{' '}
      <DateText value={millis(item.createdAt)} />
      <p>{item.userEmail}</p>
      <p>{item.message}</p>
      <label className="field">
        Status
        <select value={form.status} onChange={(e) => setDraft({ ...form, status: e.target.value })}>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
      </label>
      <label className="field">
        Admin notes
        <textarea
          value={form.notes}
          onChange={(e) => setDraft({ ...form, notes: e.target.value })}
        />
      </label>
      <button
        disabled={action.busy || !draft}
        onClick={() =>
          void action.run(async () => {
            await command('feedback.moderate', { id: item.id, ...form }, { onlineOnly: true })
            setDraft(null)
            return 'Feedback updated.'
          })
        }
      >
        Save changes
      </button>{' '}
      <button
        disabled={action.busy}
        className="secondary"
        onClick={() => {
          if (window.confirm('Delete this feedback?'))
            void action.run(async () => {
              await command('feedback.delete', { id: item.id }, { onlineOnly: true })
            })
        }}
      >
        Delete feedback
      </button>
      {action.status}
    </li>
  )
}
function FeedbackReview() {
  const rows = useRows<Submission>('feedback')
  const [status, setStatus] = useState('all'),
    [type, setType] = useState('all')
  const docs = rows.data
    .filter((d) => (status === 'all' || d.status === status) && (type === 'all' || d.type === type))
    .sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
  return (
    <section className="card collaboration-card">
      <h2>Feedback</h2>
      <label className="field">
        Filter by status
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
      </label>
      <label className="field">
        Filter by type
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          <option value="bug">Bug report</option>
          <option value="feature">Feature request</option>
          <option value="feedback">General feedback</option>
        </select>
      </label>
      <ReadState state={rows}>
        {docs.length ? (
          <ul>
            {docs.map((row) => (
              <Ticket key={row.id} item={row} />
            ))}
          </ul>
        ) : (
          <p>No matching feedback.</p>
        )}
      </ReadState>
    </section>
  )
}
export function Administration() {
  const { admin } = useApp(),
    online = useOnline(),
    [tab, setTab] = useState('Broadcast')
  if (!admin) return <p role="alert">Administrator access required.</p>
  if (!online) return <p role="status">Connect to manage the app.</p>
  return (
    <>
      <PageHeading title="Admin panel" fallback="/profile" />
      <nav className="section-tabs" aria-label="Admin sections">
        {['Broadcast', 'Users', 'Feedback'].map((label) => (
          <button key={label} aria-pressed={tab === label} onClick={() => setTab(label)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === 'Broadcast' ? <Broadcasts /> : tab === 'Users' ? <Accounts /> : <FeedbackReview />}
    </>
  )
}
