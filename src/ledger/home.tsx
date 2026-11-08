import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  addOutline,
  airplaneOutline,
  archiveOutline,
  chevronForwardOutline,
  ellipsisVertical,
  trendingUpOutline,
  walletOutline,
} from 'ionicons/icons'
import { useApp } from '../platform/context'
import { Invitations } from '../collaboration'
import {
  Avatar,
  Empty,
  Feedback,
  Form,
  Heading,
  Icon,
  Sheet,
  Status,
  money,
  useAction,
  useHold,
  useTrips,
  tripPath,
} from './ui'
import type { Trip } from './ui'

function CreateTrip({ close }: { close: () => void }) {
  const action = useAction(),
    navigate = useNavigate()
  const [name, setName] = useState(''),
    [budget, setBudget] = useState(false),
    [editing, setEditing] = useState(true)
  async function submit() {
    const tripId = crypto.randomUUID()
    const result = await action.run(
      'trip.create',
      { tripId, name: name.trim(), budgetEnabled: budget, editingEnabled: editing },
      'Trip created.',
    )
    if (result) {
      close()
      if (!result.pending) navigate(tripPath(tripId))
    }
  }
  return (
    <Sheet title="New Trip" close={close}>
      <Form submit={() => void submit()}>
        <label>
          Trip name
          <input
            autoFocus
            required
            maxLength={100}
            placeholder="e.g. Goa Weekend"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="ld-option">
          <span>
            <strong>Enable Budget Pool</strong>
            <small>Members can contribute to a shared budget</small>
          </span>
          <input
            aria-label="Track budget contributions"
            type="checkbox"
            checked={budget}
            onChange={(e) => setBudget(e.target.checked)}
          />
        </label>
        <label className="ld-option">
          <span>
            <strong>Enable Editing</strong>
            <small>Allow editing of expenses in this trip</small>
          </span>
          <input
            aria-label="Allow expense editing and recovery"
            type="checkbox"
            checked={editing}
            onChange={(e) => setEditing(e.target.checked)}
          />
        </label>
        <div className="ld-actions">
          <button type="button" className="ld-secondary" onClick={close}>
            Cancel
          </button>
          <button
            className="ld-primary"
            aria-label="Create trip"
            disabled={action.busy || !name.trim()}
          >
            Create
          </button>
        </div>
      </Form>
      <Feedback notice={action.notice} />
    </Sheet>
  )
}
export function TripCard({ trip }: { trip: Trip }) {
  const { uid } = useApp(),
    action = useAction()
  const [menu, setMenu] = useState(false),
    [deletion, setDeletion] = useState(0)
  const owner = trip.ownerId === uid
  const hold = useHold(() => {
    if (owner) setMenu(true)
  })
  const archived = trip.state === 'archived'
  async function apply(name: string) {
    const result = await action.run(
      name,
      { tripId: trip.id },
      name === 'trip.delete'
        ? 'Trip moved to Recently Deleted.'
        : name === 'trip.archive'
          ? 'Trip archived.'
          : 'Trip unarchived.',
      { expectedRevision: trip.revision },
    )
    if (result) {
      setMenu(false)
      setDeletion(0)
    }
  }
  return (
    <li className="ld-trip-card">
      <Link to={tripPath(trip.id)} {...(owner ? hold : {})} className="ld-trip-link">
        <h2>{trip.name}</h2>
        <div className="ld-trip-cost">
          <strong>{money(trip.spending)}</strong>
          <span>total spent</span>
        </div>
        <div className="ld-trip-count">
          <span className="ld-avatar-stack">
            {trip.memberIds.slice(0, 4).map((id) => (
              <Avatar key={id} uid={id} trip={trip} />
            ))}
          </span>
          {trip.memberIds.length} {trip.memberIds.length === 1 ? 'member' : 'members'}
          <Icon icon={chevronForwardOutline} />
        </div>
      </Link>
      {owner && (
        <button
          className="ld-icon-button ld-card-more"
          aria-label={'Options for ' + trip.name}
          onClick={() => setMenu(true)}
        >
          <Icon icon={ellipsisVertical} />
        </button>
      )}
      {menu && (
        <Sheet
          title={
            deletion === 0 ? trip.name : deletion === 1 ? 'Delete Trip' : 'Double Confirm Deletion'
          }
          close={() => {
            setMenu(false)
            setDeletion(0)
          }}
        >
          {deletion === 0 ? (
            <div className="ld-dialog-choices">
              <button
                onClick={() => void apply(archived ? 'trip.unarchive' : 'trip.archive')}
                disabled={action.busy}
              >
                {archived ? 'Unarchive Trip' : 'Archive Trip'}
              </button>
              <button className="ld-danger" onClick={() => setDeletion(1)}>
                Delete Trip
              </button>
            </div>
          ) : (
            <>
              <p>
                {deletion === 1
                  ? 'Move this trip to Recently Deleted?'
                  : 'Are you sure you want to delete ' + trip.name + '? You can restore it later.'}
              </p>
              <div className="ld-actions">
                <button className="ld-secondary" onClick={() => setDeletion(0)}>
                  Cancel
                </button>
                <button
                  className="ld-danger"
                  disabled={action.busy}
                  onClick={() => (deletion === 1 ? setDeletion(2) : void apply('trip.delete'))}
                >
                  {deletion === 1 ? 'Delete' : 'Yes, Delete'}
                </button>
              </div>
            </>
          )}
          <Feedback notice={action.notice} />
        </Sheet>
      )}
    </li>
  )
}
export function Home() {
  const list = useTrips(),
    [params] = useSearchParams(),
    [creating, setCreating] = useState(false)
  const query = (params.get('q') || '').trim().toLowerCase()
  const active = list.data
    .filter((t) => t.state === 'active')
    .sort((a, b) => b.createdAt - a.createdAt)
  const visible = active.filter((t) => t.name.toLowerCase().includes(query))
  return (
    <section className="ld-page ld-home">
      <h1 className="ld-sr">My trips</h1>
      <Status {...list} />
      {!query && <Invitations />}
      {!list.loading &&
        !list.error &&
        (visible.length ? (
          <ul className="ld-trip-list">
            {visible.map((t) => (
              <TripCard key={t.id} trip={t} />
            ))}
          </ul>
        ) : (
          <Empty title={query ? 'No matching trips' : 'No trips yet'} icon={airplaneOutline}>
            {query ? 'Try another trip name.' : 'Tap New Trip to start sharing expenses.'}
          </Empty>
        ))}
      <button className="ld-fab ld-fab-home" onClick={() => setCreating(true)}>
        <Icon icon={addOutline} />
        New Trip
      </button>
      {creating && <CreateTrip close={() => setCreating(false)} />}
    </section>
  )
}
export function Archive() {
  const list = useTrips(),
    archived = list.data
      .filter((t) => t.state === 'archived')
      .sort((a, b) => b.createdAt - a.createdAt)
  return (
    <section className="ld-page">
      <Heading title="Archive" back={{ to: '/settings', text: 'Settings' }} />
      <Status {...list} />
      {!list.loading &&
        !list.error &&
        (archived.length ? (
          <ul className="ld-trip-list">
            {archived.map((t) => (
              <TripCard key={t.id} trip={t} />
            ))}
          </ul>
        ) : (
          <Empty title="No archived trips" icon={archiveOutline}>
            Finished trips you archive will appear here.
          </Empty>
        ))}
    </section>
  )
}
export function Analytics() {
  const list = useTrips()
  const trips = list.data
    .filter((t) => t.state === 'active' || t.state === 'archived')
    .sort((a, b) => b.createdAt - a.createdAt)
  const total = trips.reduce((n, t) => n + t.spending / 100, 0)
  const highest = trips.reduce<Trip | null>(
    (hi, t) => (!hi || t.spending > hi.spending ? t : hi),
    null,
  )
  const fixed = (rupees: number) => '₹' + rupees.toFixed(2)
  return (
    <section className="ld-page ld-analytics">
      <h1 className="ld-sr">Analytics</h1>
      <Status {...list} />
      {!list.loading &&
        !list.error &&
        (highest ? (
          <>
            <h2>Overview</h2>
            <dl className="ld-analytics-numbers">
              <div>
                <dt>Total Spent</dt>
                <dd>{fixed(total)}</dd>
              </div>
              <div>
                <dt>Average/Trip</dt>
                <dd>{fixed(total / trips.length)}</dd>
              </div>
            </dl>
            <Link className="ld-finance-card ld-highest" to={tripPath(highest.id)}>
              <Icon icon={trendingUpOutline} />
              <span>
                <strong>Highest Spending Trip</strong>
                <small>{highest.name}</small>
              </span>
              <b>{fixed(highest.spending / 100)}</b>
            </Link>
            <h2>Trip Expenses Breakdown</h2>
            <ul className="ld-chart">
              {trips.map((t) => (
                <li className="ld-finance-card" key={t.id}>
                  <div>
                    <Link to={tripPath(t.id)}>{t.name}</Link>
                    <small>
                      {fixed(t.spending / 100)} ({total ? Math.round(t.spending / total) : 0}%)
                    </small>
                  </div>
                  <progress
                    max={1}
                    value={total ? t.spending / 100 / total : 0}
                    aria-label={'Spending share for ' + t.name}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Empty title="No analytics yet" icon={walletOutline}>
            Create a trip and add expenses to view analytics.
          </Empty>
        ))}
    </section>
  )
}
