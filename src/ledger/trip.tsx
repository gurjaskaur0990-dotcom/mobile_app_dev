import { useEffect, useRef, useState } from 'react'
import {
  addOutline,
  arrowForwardOutline,
  ellipsisVertical,
  informationCircleOutline,
  pieChartOutline,
  receiptOutline,
  walletOutline,
} from 'ionicons/icons'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { calculateFlutterLedger, reconcileFlutterSpending } from '../legacy/ledger'
import { Members } from '../collaboration'
import { useApp } from '../platform/context'
import { useTrip, useExpenses, useContributions } from './data'
import {
  Avatar,
  Empty,
  Feedback,
  Form,
  Heading,
  Icon,
  Sheet,
  Status,
  canChange,
  date,
  entryPath,
  label,
  money,
  person,
  relativeDate,
  summary,
  tripPath,
  useAction,
  useHold,
} from './ui'
import type { Entry, Trip } from './ui'
import type { Transfer } from '../../shared/ledger'

function ExpenseCard({
  trip,
  item,
  remove,
}: {
  trip: Trip
  item: Entry
  remove: (entry: Entry) => Promise<unknown>
}) {
  const { uid } = useApp(),
    action = useAction(),
    [menu, setMenu] = useState(false),
    [deleting, setDeleting] = useState(false)
  const allowed = canChange(trip, item, uid),
    hold = useHold(() => {
      if (allowed) setMenu(true)
    })

  return (
    <li className="ld-expense-card">
      <Link to={entryPath(trip.id, item.id)} className="ld-record" {...(allowed ? hold : {})}>
        <span className="ld-record-main">
          <strong>{label(item)}</strong>
          <small>{summary(trip, item)}</small>
          <small>
            {relativeDate(item.createdAt)}
            {item.isEdited ? ' · Edited' : ''}
          </small>
        </span>
        <span className="ld-record-value">
          {money(item.amount)}
          <small>{item.type === 'expense' ? item.participantIds.length : 1} split</small>
        </span>
      </Link>
      {allowed && (
        <button
          className="ld-icon-button ld-card-more"
          aria-label={'Options for ' + label(item)}
          onClick={() => setMenu(true)}
        >
          <Icon icon={ellipsisVertical} />
        </button>
      )}
      {menu && (
        <Sheet
          title={deleting ? 'Delete Expense' : label(item)}
          close={() => {
            setMenu(false)
            setDeleting(false)
          }}
        >
          {deleting ? (
            <>
              <p>Delete {label(item)} and move it to Recently Deleted?</p>
              <button
                className="ld-danger"
                disabled={action.busy}
                onClick={() => {
                  void remove(item).then((r) => {
                    if (r) setMenu(false)
                  })
                }}
              >
                Delete
              </button>
            </>
          ) : (
            <div className="ld-dialog-choices">
              {item.type !== 'contribution' && (
                <Link className="ld-secondary" to={entryPath(trip.id, item.id) + '/edit'}>
                  Edit Expense
                </Link>
              )}
              <button className="ld-danger" onClick={() => setDeleting(true)}>
                Delete Expense
              </button>
            </div>
          )}
          <Feedback notice={action.notice} />
        </Sheet>
      )}
    </li>
  )
}
function Expenses({ trip, items }: { trip: Trip; items: Entry[] }) {
  const action = useAction()
  const remove = (item: Entry) => {
    const payload = { tripId: trip.id, entryId: item.id, entryType: item.type }
    return action.run(
      'entry.delete',
      payload,
      'Expense deleted.',
      { expectedRevision: item.revision },
      () => {
        void action.run('entry.restore', payload, 'Expense restored.')
      },
    )
  }
  const groups = [
    { name: 'Spends', list: items.filter((e) => e.type === 'expense') },
    { name: 'Settlements', list: items.filter((e) => e.type === 'repayment') },
  ]
  return (
    <>
      {items.length > 0 ? (
        <>
          <div className="ld-centered-total">
            <span>Total Spent</span>
            <strong>{money(trip.spending)}</strong>
          </div>
          {groups
            .filter((g) => g.list.length)
            .map((g) => (
              <section key={g.name}>
                <h2>{g.name}</h2>
                <ul className="ld-cards">
                  {g.list.map((e) => (
                    <ExpenseCard key={e.id} trip={trip} item={e} remove={remove} />
                  ))}
                </ul>
              </section>
            ))}
        </>
      ) : (
        <Empty title="No expenses yet" icon={receiptOutline}>
          Tap + to add your first expense
        </Empty>
      )}
      {<Feedback notice={action.notice} />}
      {trip.state === 'active' && (
        <Link className="ld-fab" to={tripPath(trip.id) + '/new'}>
          <Icon icon={addOutline} />
          Add Expense
        </Link>
      )}
    </>
  )
}
function BalanceList({
  trip,
  balances,
  budget = false,
}: {
  trip: Trip
  balances: Record<string, number>
  budget?: boolean
}) {
  const sorted = Object.entries(balances)
  if (!budget) sorted.sort((a, b) => b[1] - a[1])
  return (
    <section>
      <h2>{budget ? 'Budget Balances' : 'Balances'}</h2>
      <ul className="ld-cards">
        {sorted.map(([id, amount]) => (
          <li className="ld-finance-card ld-record" key={id}>
            <Avatar trip={trip} uid={id} />
            <span className="ld-record-main">{person(trip, id)}</span>
            <span
              className={
                'ld-record-value ' + (amount > 1 ? 'ld-positive' : amount < -1 ? 'ld-negative' : '')
              }
            >
              {money(Math.abs(amount))}
              <small>
                {amount > 1
                  ? budget
                    ? 'gets refund'
                    : 'gets back'
                  : amount < -1
                    ? 'owes'
                    : 'settled'}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
function TransferCard({
  trip,
  transfer,
  pick,
}: {
  trip: Trip
  transfer: Transfer
  pick?: () => void
}) {
  const hold = useHold(() => pick?.())
  const contents = (
    <>
      <span>
        <Avatar trip={trip} uid={transfer.debtorId} />
        {person(trip, transfer.debtorId).split(' ')[0]}
      </span>
      <strong>
        {money(transfer.amount)}
        <Icon icon={arrowForwardOutline} />
      </strong>
      <span>
        {person(trip, transfer.creditorId).split(' ')[0]}
        <Avatar trip={trip} uid={transfer.creditorId} />
      </span>
    </>
  )
  return (
    <li>
      {pick ? (
        <button
          className="ld-transfer ld-finance-card"
          onClick={pick}
          {...hold}
          aria-label={
            'Record payment: ' +
            person(trip, transfer.debtorId) +
            ' pays ' +
            person(trip, transfer.creditorId) +
            ' ' +
            money(transfer.amount)
          }
        >
          {contents}
        </button>
      ) : (
        <div className="ld-transfer ld-finance-card">{contents}</div>
      )}
    </li>
  )
}
function Summary({
  trip,
  items,
  totals,
}: {
  trip: Trip
  items: Entry[]
  totals: ReturnType<typeof calculateFlutterLedger>
}) {
  const action = useAction(),
    [selected, setSelected] = useState<Transfer | null>(null)
  if (!items.length)
    return (
      <Empty title="Nothing to settle" icon={pieChartOutline}>
        Add some expenses to see balances and settlements
      </Empty>
    )
  return (
    <>
      <BalanceList trip={trip} balances={totals.balances} />
      {totals.transfers.length > 0 && (
        <section>
          <h2>Settlements</h2>
          <ul className="ld-cards">
            {totals.transfers.map((t) => (
              <TransferCard
                key={t.debtorId + t.creditorId}
                trip={trip}
                transfer={t}
                pick={trip.state === 'active' ? () => setSelected(t) : undefined}
              />
            ))}
          </ul>
        </section>
      )}
      {selected && (
        <Sheet title="Mark as Settled" close={() => setSelected(null)}>
          <p>
            Record a payment of {money(selected.amount)} from {person(trip, selected.debtorId)} to{' '}
            {person(trip, selected.creditorId)}?
          </p>
          <div className="ld-actions">
            <button className="ld-secondary" onClick={() => setSelected(null)}>
              Cancel
            </button>
            <button
              className="ld-primary"
              disabled={action.busy}
              onClick={() => {
                void action
                  .run(
                    'entry.repay',
                    { tripId: trip.id, entryId: crypto.randomUUID(), ...selected },
                    'Settlement payment recorded.',
                  )
                  .then((r) => {
                    if (r) setSelected(null)
                  })
              }}
            >
              Confirm
            </button>
          </div>
          <Feedback notice={action.notice} />
        </Sheet>
      )}
      {!selected && <Feedback notice={action.notice} />}
    </>
  )
}
function ContributionCard({
  trip,
  item,
  remove,
}: {
  trip: Trip
  item: Extract<Entry, { type: 'contribution' }>
  remove?: () => void
}) {
  const hold = useHold(() => remove?.())
  return (
    <li className="ld-finance-card ld-record" {...(remove ? hold : {})}>
      <Avatar trip={trip} uid={item.contributorId} name={item.contributorName} />
      <span className="ld-record-main">
        <strong>
          {trip.members[item.contributorId]?.displayName || item.contributorName || 'Unknown'}
        </strong>
        <small>{relativeDate(item.createdAt)}</small>
      </span>
      <strong className="ld-positive">{money(item.amount)}</strong>
      {remove && (
        <button
          className="ld-icon-button"
          aria-label={'Remove contribution by ' + person(trip, item.contributorId)}
          onClick={remove}
        >
          <Icon icon={ellipsisVertical} />
        </button>
      )}
    </li>
  )
}
function Budget({
  trip,
  contributions,
  totals,
}: {
  trip: Trip
  contributions: Entry[]
  totals: ReturnType<typeof calculateFlutterLedger>
}) {
  const { uid } = useApp(),
    action = useAction(),
    [add, setAdd] = useState(false),
    [remove, setRemove] = useState<Entry | null>(null)
  const [amount, setAmount] = useState(''),
    [who, setWho] = useState(uid)
  const input = Number(amount),
    valid =
      /^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(amount.trim()) && Number.isFinite(input) && input > 0
  const diff = totals.funding - totals.spending
  async function submit() {
    if (!valid) return
    const result = await action.run(
      'entry.contribute',
      {
        tripId: trip.id,
        entryId: crypto.randomUUID(),
        contributorId: who,
        amount: Math.round(input * 100),
        amountRupees: input,
      },
      'Contribution recorded.',
    )
    if (result) {
      setAmount('')
      setAdd(false)
    }
  }
  async function erase(item: Entry) {
    const payload = { tripId: trip.id, entryId: item.id, entryType: 'contribution' }
    const result = await action.run(
      'entry.delete',
      payload,
      'Contribution deleted.',
      { expectedRevision: item.revision },
      () => {
        void action.run('entry.restore', payload, 'Contribution restored.')
      },
    )
    if (result) setRemove(null)
  }
  return (
    <>
      <dl className="ld-finance-card ld-budget-summary">
        <div>
          <dt>Total Budget</dt>
          <dd>{money(totals.funding)}</dd>
        </div>
        <div>
          <dt>Total Spent</dt>
          <dd>{money(totals.spending)}</dd>
        </div>
        {totals.funding > 0 && (
          <>
            <progress
              aria-label="Budget used"
              max={1}
              value={Math.min(1, totals.spending / totals.funding)}
            />
            <div className={diff < 0 ? 'ld-negative' : 'ld-positive'}>
              <dt>{diff < 0 ? 'Over Budget' : 'Remaining'}</dt>
              <dd>{money(diff)}</dd>
            </div>
          </>
        )}
      </dl>
      <section>
        <h2>Contributions</h2>
        {!contributions.length ? (
          <Empty title="No contributions yet" icon={walletOutline}>
            Tap + to add money to the budget pool
          </Empty>
        ) : (
          <ul className="ld-cards">
            {contributions.map(
              (item) =>
                item.type === 'contribution' && (
                  <ContributionCard
                    key={item.id}
                    trip={trip}
                    item={item}
                    remove={canChange(trip, item, uid) ? () => setRemove(item) : undefined}
                  />
                ),
            )}
          </ul>
        )}
      </section>
      {totals.funding > 0 && contributions.length > 0 && totals.spending > 0 && (
        <>
          <BalanceList trip={trip} budget balances={totals.budgetBalances} />
          {totals.budgetTransfers.length > 0 && (
            <section>
              <h2>Budget Settlements</h2>
              <ul className="ld-cards">
                {totals.budgetTransfers.map((t) => (
                  <TransferCard key={t.debtorId + t.creditorId} trip={trip} transfer={t} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {trip.state === 'active' && (
        <button className="ld-fab" aria-label="Add contribution" onClick={() => setAdd(true)}>
          <Icon icon={walletOutline} />
          Add to Budget
        </button>
      )}
      {add && (
        <Sheet title="Add to Budget" close={() => setAdd(false)}>
          <Form submit={() => void submit()}>
            <label className="ld-how-much">
              How much?
              <input
                aria-label="Contribution (INR)"
                inputMode="decimal"
                placeholder="₹0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Who contributed?
              <select aria-label="Contributor" value={who} onChange={(e) => setWho(e.target.value)}>
                {trip.memberIds.map((id) => (
                  <option value={id} key={id}>
                    {person(trip, id)}
                  </option>
                ))}
              </select>
            </label>
            <div className="ld-actions">
              <button type="button" className="ld-secondary" onClick={() => setAdd(false)}>
                Cancel
              </button>
              <button className="ld-primary" disabled={!valid || action.busy}>
                Save contribution
              </button>
            </div>
          </Form>
          <Feedback notice={action.notice} />
        </Sheet>
      )}
      {remove && (
        <Sheet title="Delete Contribution" close={() => setRemove(null)}>
          <p>Remove this {money(remove.amount)} contribution?</p>
          <div className="ld-actions">
            <button className="ld-secondary" onClick={() => setRemove(null)}>
              Cancel
            </button>
            <button className="ld-danger" disabled={action.busy} onClick={() => void erase(remove)}>
              Delete
            </button>
          </div>
        </Sheet>
      )}
      {!add && !remove && <Feedback notice={action.notice} />}
    </>
  )
}
function Settings({ trip }: { trip: Trip }) {
  const { uid } = useApp(),
    action = useAction(),
    navigate = useNavigate(),
    [confirm, setConfirm] = useState(0)
  const owner = trip.ownerId === uid
  async function mutate(name: string, payload: Record<string, unknown>, text: string) {
    const result = await action.run(name, { tripId: trip.id, ...payload }, text, {
      expectedRevision: trip.revision,
    })
    if (result && name === 'trip.delete') {
      setConfirm(0)
      navigate('/')
    }
  }
  return (
    <>
      <section className="ld-finance-card">
        <h2>{trip.name}</h2>
        <dl className="ld-details">
          <dt>Created By</dt>
          <dd>{person(trip, trip.ownerId)}</dd>
          <dt>Created On</dt>
          <dd>{date(trip.createdAt)}</dd>
          <dt>Total Members</dt>
          <dd>{trip.memberIds.length} members</dd>
          <dt>Total Spent</dt>
          <dd>{money(trip.spending)}</dd>
        </dl>
      </section>
      <section className="ld-finance-card">
        <h2>Settings</h2>
        {(
          [
            {
              key: 'budgetEnabled',
              name: 'Enable Budget Pool',
              hint: 'Members can contribute to a shared budget',
            },
            {
              key: 'editingEnabled',
              name: 'Enable Editing',
              hint: 'Allow members to edit/delete expenses',
            },
          ] as const
        ).map((opt) => (
          <label key={opt.key} className="ld-option">
            <span>
              <strong>{opt.name}</strong>
              <small>{opt.hint}</small>
            </span>
            <input
              type="checkbox"
              checked={trip[opt.key]}
              disabled={!owner || action.busy}
              onChange={(e) =>
                void mutate('trip.settings', { [opt.key]: e.target.checked }, 'Settings saved.')
              }
            />
          </label>
        ))}
        {!owner && <small>Only the trip creator can change these settings.</small>}
      </section>
      {owner && (
        <section className="ld-finance-card ld-danger-zone">
          <h2>Danger Zone</h2>
          <button
            onClick={() =>
              void mutate(
                trip.state === 'archived' ? 'trip.unarchive' : 'trip.archive',
                {},
                'Trip updated.',
              )
            }
            disabled={action.busy}
          >
            {trip.state === 'archived' ? 'Unarchive Trip' : 'Archive Trip'}
            <small>
              {trip.state === 'archived'
                ? 'Make the trip active again to add or edit items'
                : 'Freeze editing, deleting, and adding to the trip'}
            </small>
          </button>
          <button onClick={() => setConfirm(1)}>
            Delete Trip<small>Move this trip to Recently Deleted (can be restored later)</small>
          </button>
        </section>
      )}
      {confirm > 0 && (
        <Sheet
          title={confirm === 1 ? 'Delete Trip' : 'Double Confirm Deletion'}
          close={() => setConfirm(0)}
        >
          <p>
            {confirm === 1
              ? 'Move ' + trip.name + ' to Recently Deleted?'
              : 'Are you absolutely sure? You can restore this trip from Recently Deleted later.'}
          </p>
          <div className="ld-actions">
            <button className="ld-secondary" onClick={() => setConfirm(0)}>
              Cancel
            </button>
            <button
              className="ld-danger"
              disabled={action.busy}
              onClick={() =>
                confirm === 1 ? setConfirm(2) : void mutate('trip.delete', {}, 'Trip deleted.')
              }
            >
              {confirm === 1 ? 'Delete' : 'Yes, Delete'}
            </button>
          </div>
        </Sheet>
      )}
      <Feedback notice={action.notice} />
    </>
  )
}
export function TripView() {
  const { tripId, section: routeSection } = useParams(),
    navigate = useNavigate()
  const section =
    routeSection || (location.pathname.endsWith('/settings') ? 'settings' : 'expenses')
  const tripRow = useTrip(tripId),
    raw = tripRow.data
  const expenseRow = useExpenses(raw?.id),
    contributionRow = useContributions(raw?.id)
  const { uid } = useApp()
  const financial = raw
    ? calculateFlutterLedger(raw, [...expenseRow.data, ...contributionRow.data])
    : null
  const mismatch =
    raw &&
    financial &&
    raw.state !== 'deleted' &&
    raw.memberIds.includes(uid) &&
    !tripRow.loading &&
    !tripRow.cached &&
    !tripRow.error &&
    !expenseRow.loading &&
    !expenseRow.cached &&
    !expenseRow.error &&
    Math.abs(financial.spending - raw.spending) > 1
      ? raw.id + '/' + raw.revision + '/' + financial.spending
      : null
  const lastCheck = useRef<string | null>(null)
  useEffect(() => {
    if (!mismatch) {
      lastCheck.current = null
      return
    }
    if (lastCheck.current === mismatch || !navigator.onLine || !tripId) return
    lastCheck.current = mismatch
    void reconcileFlutterSpending(uid, tripId).catch(() => {})
  }, [uid, tripId, mismatch])
  const touch = useRef<{ x: number; y: number } | null>(null)
  if (!raw || !financial || tripRow.error)
    return (
      <section className="ld-page">
        <Heading title="Trip" back={{ to: '/', text: 'My trips' }} />
        <Status {...tripRow} />
        {!tripRow.loading && !tripRow.error && <Empty title="Trip not found" />}
      </section>
    )
  const trip = { ...raw, spending: financial.spending, balances: financial.balances }
  if (trip.state === 'deleted' || trip.state === 'purging')
    return (
      <section className="ld-page">
        <Heading title={trip.name} back={{ to: '/recently-deleted', text: 'Recently Deleted' }} />
        <Empty title="This trip is in Recently Deleted" />
      </section>
    )
  const sections = ['expenses', 'members', ...(trip.budgetEnabled ? ['budget'] : []), 'summary']
  if (!sections.includes(section) && section !== 'settings')
    return <Navigate to={tripPath(trip.id)} replace />
  const expenses = expenseRow.data
    .filter((e) => !e.deletedAt)
    .sort((a, b) => b.createdAt - a.createdAt)
  const contributions = contributionRow.data
    .filter((e) => !e.deletedAt)
    .sort((a, b) => b.createdAt - a.createdAt)
  return (
    <section className="ld-page ld-trip">
      <Heading
        title={section === 'settings' ? 'Trip Info & Settings' : trip.name}
        back={{
          to: section === 'settings' ? tripPath(trip.id) : '/',
          text: section === 'settings' ? trip.name : 'My trips',
        }}
      >
        {section !== 'settings' && (
          <Link
            aria-label="Trip Info & Settings"
            className="ld-icon-button"
            to={tripPath(trip.id, 'settings')}
          >
            <Icon icon={informationCircleOutline} />
          </Link>
        )}
      </Heading>
      {section !== 'settings' && (
        <nav className="ld-tabs" aria-label="Trip sections">
          {sections.map((s) => (
            <Link
              key={s}
              to={tripPath(trip.id, s)}
              aria-current={s === section ? 'page' : undefined}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </Link>
          ))}
        </nav>
      )}
      {trip.state === 'archived' && (
        <p className="ld-note">
          This trip is archived. Unarchive it to add/remove expenses or members.
        </p>
      )}
      <Status
        loading={expenseRow.loading || contributionRow.loading}
        error={expenseRow.error || contributionRow.error}
        cached={tripRow.cached || expenseRow.cached || contributionRow.cached}
      />
      <div
        className="ld-trip-body"
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        }}
        onTouchEnd={(e) => {
          if (!touch.current || section === 'settings') return
          const dx = e.changedTouches[0].clientX - touch.current.x,
            dy = e.changedTouches[0].clientY - touch.current.y
          touch.current = null
          const next = sections[sections.indexOf(section) + (dx < 0 ? 1 : -1)]
          if (next && Math.abs(dx) > 85 && Math.abs(dx) > Math.abs(dy) * 2)
            navigate(tripPath(trip.id, next))
        }}
      >
        {section === 'members' ? (
          <Members trip={trip} />
        ) : section === 'settings' ? (
          <Settings trip={trip} />
        ) : (
          !expenseRow.loading &&
          !contributionRow.loading &&
          !expenseRow.error &&
          !contributionRow.error && (
            <>
              {section === 'expenses' && <Expenses trip={trip} items={expenses} />}{' '}
              {section === 'summary' && <Summary trip={trip} items={expenses} totals={financial} />}{' '}
              {section === 'budget' && (
                <Budget trip={trip} contributions={contributions} totals={financial} />
              )}
            </>
          )
        )}
      </div>
    </section>
  )
}
