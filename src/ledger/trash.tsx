import { useCallback, useEffect, useState } from 'react'
import { trashOutline } from 'ionicons/icons'
import { useApp } from '../platform/context'
import { useRows } from '../platform/live'
import { readFlutterExpense } from '../legacy/ledger'
import {
  Empty,
  Feedback,
  Heading,
  Sheet,
  Status,
  money,
  relativeDate,
  useAction,
  useTrips,
} from './ui'
import type { Trip } from './ui'

interface DeletedRow {
  key: string
  tripId: string
  tripName: string
  id?: string
  name: string
  date: number
  amount: number
  author: string
  revision: number
  payer?: string
}
type Load = { rows: DeletedRow[]; loading: boolean; error: string | null }
function DeletedExpenses({
  trip,
  publish,
}: {
  trip: Trip
  publish: (key: string, r: Load) => void
}) {
  const data = useRows<Record<string, any>>('trips/' + trip.id + '/expenses', [
    ['isDeleted', '==', true],
  ])
  useEffect(() => {
    const rows = data.data.map((raw) => {
      const entry = readFlutterExpense(trip.id, raw.id, raw)
      return {
        key: trip.id + '/' + entry.id,
        tripId: trip.id,
        tripName: trip.name,
        id: entry.id,
        name: raw.title || 'Expense',
        date: entry.deletedAt || 0,
        amount: entry.amount,
        author: entry.authorId,
        revision: entry.revision,
        payer: raw.paidByName || 'Unknown',
      }
    })
    publish(trip.id, { rows, loading: data.loading, error: data.error })
  }, [data.data, data.loading, data.error, trip.id, trip.name, publish])
  return null
}
export function Trash() {
  const trips = useTrips(),
    { uid, command } = useApp(),
    action = useAction()
  const [tab, setTab] = useState<'trips' | 'expenses'>('trips'),
    [groups, setGroups] = useState<Record<string, Load>>({})
  const [confirm, setConfirm] = useState<DeletedRow[]>([]),
    [second, setSecond] = useState(false),
    [working, setWorking] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const change = () => setOnline(navigator.onLine)
    window.addEventListener('online', change)
    window.addEventListener('offline', change)
    return () => {
      window.removeEventListener('online', change)
      window.removeEventListener('offline', change)
    }
  }, [])
  const publish = useCallback(
    (key: string, r: Load) =>
      setGroups((old) => {
        const prev = old[key]
        if (prev && JSON.stringify(prev) === JSON.stringify(r)) return old
        return { ...old, [key]: r }
      }),
    [],
  )
  const active = trips.data.filter((t) => t.state === 'active')
  const entries = active.flatMap((t) => groups[t.id]?.rows || [])
  const removed = trips.data
    .filter((t) => t.state === 'deleted')
    .map(
      (t) =>
        ({
          key: t.id,
          tripId: t.id,
          tripName: t.name,
          name: t.name,
          date: t.deletedAt || 0,
          amount: t.spending,
          author: t.ownerId,
          revision: t.revision,
        }) as DeletedRow,
    )
  const rows = (tab === 'trips' ? removed : entries).sort((a, b) => b.date - a.date)
  const mine = rows.filter((r) => r.author === uid)
  const pending = tab === 'expenses' && active.some((t) => !groups[t.id] || groups[t.id].loading)
  const error =
    trips.error || (tab === 'expenses' && active.map((t) => groups[t.id]?.error).find(Boolean))
  function begin(items: DeletedRow[]) {
    setSecond(false)
    setConfirm(items)
  }
  async function purge() {
    if (!online || working) return
    if (confirm.length === 1 && !confirm[0].id && !second) {
      setSecond(true)
      return
    }
    setWorking(true)
    const failures: string[] = []
    for (const row of confirm) {
      try {
        await command(
          'purge.start',
          { tripId: row.tripId, ...(row.id ? { entryId: row.id, entryType: 'expense' } : {}) },
          { expectedRevision: row.revision, onlineOnly: true },
        )
      } catch (e) {
        failures.push(row.name + ' — ' + (e instanceof Error ? e.message : 'Retry deletion.'))
      }
    }
    action.setNotice({
      text: failures.length ? failures.join(' ') : 'Permanently deleted.',
      error: failures.length > 0,
    })
    setConfirm([])
    setWorking(false)
  }
  function restore(row: DeletedRow) {
    void action.run(
      row.id ? 'entry.restore' : 'trip.restore',
      { tripId: row.tripId, ...(row.id ? { entryId: row.id, entryType: 'expense' } : {}) },
      row.id ? 'Expense restored.' : 'Trip restored.',
      { expectedRevision: row.revision },
    )
  }
  return (
    <section className="ld-page">
      <Heading title="Recently Deleted" back={{ to: '/settings', text: 'Settings' }}>
        {mine.length > 0 && (
          <button className="ld-danger" disabled={!online} onClick={() => begin(mine)}>
            Delete All
          </button>
        )}
      </Heading>
      <nav className="ld-tabs" aria-label="Recently Deleted categories">
        {(['trips', 'expenses'] as const).map((s) => (
          <button
            key={s}
            aria-current={tab === s ? 'page' : undefined}
            onClick={() => {
              setTab(s)
              action.setNotice(null)
            }}
          >
            {s === 'trips' ? 'Trips' : 'Expenses'}
          </button>
        ))}
      </nav>
      {tab === 'expenses' &&
        active.map((t) => <DeletedExpenses key={t.id} trip={t} publish={publish} />)}
      <Status loading={trips.loading || pending} error={error} cached={trips.cached} />
      <Feedback notice={action.notice} />
      {!online && <p className="ld-note">Connect to the internet to permanently delete records.</p>}
      {!error &&
        !trips.loading &&
        !pending &&
        (rows.length ? (
          <ul className="ld-trip-list">
            {rows.map((r) => (
              <li className="ld-finance-card ld-trash-card" key={r.key}>
                <div className="ld-panel-head">
                  <h2>
                    <del>{r.name}</del>
                  </h2>
                  <small>Deleted {relativeDate(r.date)}</small>
                </div>
                {r.id && <small>From Trip: {r.tripName}</small>}
                <p>
                  <strong>{money(r.amount)}</strong> {r.id ? 'Paid by: ' + r.payer : 'total spent'}
                </p>
                {r.author === uid && (
                  <div className="ld-actions">
                    <button
                      className="ld-text"
                      disabled={action.busy || working}
                      onClick={() => restore(r)}
                    >
                      Restore
                    </button>
                    <button
                      className="ld-danger"
                      disabled={!online || working}
                      onClick={() => begin([r])}
                    >
                      Delete Forever
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty title={'No recently deleted ' + tab} icon={trashOutline}>
            Deleted {tab} will appear here. Items are auto-cleared after 30 days.
          </Empty>
        ))}
      {confirm.length > 0 && (
        <Sheet
          title={
            second
              ? 'Double Confirm Permanent Deletion'
              : confirm.length > 1
                ? 'Delete All Your ' + (tab === 'expenses' ? 'Expenses' : 'Trips')
                : 'Permanently Delete ' + (confirm[0].id ? 'Expense' : 'Trip')
          }
          close={() => {
            if (!working) setConfirm([])
          }}
        >
          <p>
            {confirm.length === 1
              ? 'Permanently remove ' + confirm[0].name + '?'
              : 'Permanently delete all ' + confirm.length + ' records you created?'}{' '}
            This cannot be undone.
          </p>
          <div className="ld-actions">
            <button className="ld-secondary" disabled={working} onClick={() => setConfirm([])}>
              Cancel
            </button>
            <button
              className="ld-danger"
              disabled={working || !online}
              onClick={() => void purge()}
            >
              {second
                ? 'Yes, Purge Everything'
                : confirm.length > 1
                  ? 'Delete All'
                  : 'Permanently Delete'}
            </button>
          </div>
        </Sheet>
      )}
    </section>
  )
}
