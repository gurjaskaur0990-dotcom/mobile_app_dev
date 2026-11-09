import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { pencilOutline, receiptOutline, trashOutline } from 'ionicons/icons'
import { flutterSplitShares } from '../legacy/ledger'
import { useApp } from '../platform/context'
import { useDraft } from '../platform/drafts'
import { useTrip, useExpense } from './data'
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
  tripPath,
  useAction,
} from './ui'
import type { Entry, Trip } from './ui'

function entryValues(trip: Trip, uid: string, entry?: Entry) {
  return {
    id: entry?.id || crypto.randomUUID(),
    revision: entry?.revision ?? null,
    title: entry ? label(entry) : '',
    amount: entry ? String(entry.rupees ?? entry.amount / 100) : '',
    payer:
      entry?.type === 'expense'
        ? entry.payerId
        : entry?.type === 'repayment'
          ? entry.debtorId
          : uid,
    participants:
      entry?.type === 'expense'
        ? entry.participantIds
        : entry?.type === 'repayment'
          ? entry.sharedWith || [entry.creditorId]
          : [...trip.memberIds],
  }
}
function Editor({ trip, entry }: { trip: Trip; entry?: Entry }) {
  const { uid, queue, discard } = useApp(),
    action = useAction(),
    navigate = useNavigate()
  const [initial] = useState(() => entryValues(trip, uid, entry))
  const [draft, setDraft, clearDraft] = useDraft(
    'expense/' + trip.id + '/' + (entry?.id || 'new'),
    initial,
  )
  const rupees = Number(draft.amount),
    validAmount =
      /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(draft.amount.trim()) &&
      Number.isFinite(rupees) &&
      rupees > 0
  const shares =
    validAmount && draft.participants.length
      ? flutterSplitShares(rupees * 100, draft.participants)
      : {}
  const stale = !!entry && draft.revision !== entry.revision
  const payers = [...new Set([...trip.memberIds, initial.payer])]
  const choices = [...new Set([...trip.memberIds, ...(entry ? initial.participants : [])])]
  const participantsChanged =
    draft.participants.some((id) => !choices.includes(id)) || !payers.includes(draft.payer)
  const everyone = trip.memberIds.every((id) => draft.participants.includes(id))
  async function review(keep: boolean) {
    if (!entry) return
    try {
      const old = queue.find(
        (item) => item.name === 'entry.edit' && item.payload.entryId === entry.id && item.error,
      )
      if (old) await discard(old)
      setDraft(keep ? { ...draft, revision: entry.revision } : entryValues(trip, uid, entry))
    } catch (e) {
      action.setNotice({
        error: true,
        text: e instanceof Error ? e.message : 'Review the pending change in Settings.',
      })
    }
  }
  async function save() {
    if (
      !validAmount ||
      !draft.title.trim() ||
      !draft.participants.length ||
      stale ||
      participantsChanged
    )
      return
    const result = await action.run(
      entry ? 'entry.edit' : 'entry.expense',
      {
        tripId: trip.id,
        entryId: draft.id,
        title: draft.title.trim(),
        payerId: draft.payer,
        participantIds: draft.participants,
        amount: Math.round(rupees * 100),
        amountRupees: rupees,
      },
      entry ? 'Expense updated.' : 'Expense added.',
      draft.revision != null ? { expectedRevision: draft.revision } : undefined,
    )
    if (result) {
      clearDraft()
      navigate(entry ? entryPath(trip.id, entry.id) : tripPath(trip.id), { replace: true })
    }
  }
  return (
    <section className="ld-page ld-edit">
      <Heading
        title={entry ? 'Edit Expense' : 'Add Expense'}
        back={{
          to: entry ? entryPath(trip.id, entry.id) : tripPath(trip.id),
          text: 'Trip expenses',
        }}
      >
        <button
          className="ld-primary"
          aria-label="Save expense"
          disabled={
            action.busy ||
            stale ||
            !validAmount ||
            !draft.title.trim() ||
            !draft.participants.length ||
            participantsChanged
          }
          onClick={() => void save()}
        >
          Save
        </button>
      </Heading>
      <Form submit={() => void save()}>
        {stale && entry && (
          <div className="ld-confirm">
            <h2>Review the latest expense</h2>
            <p>
              {label(entry)} · {money(entry.amount)} · {entry.paidByName}
            </p>
            <div className="ld-actions">
              <button type="button" className="ld-secondary" onClick={() => void review(false)}>
                Use latest version
              </button>
              <button type="button" className="ld-secondary" onClick={() => void review(true)}>
                Keep my edits
              </button>
            </div>
          </div>
        )}
        {participantsChanged && (
          <button
            type="button"
            className="ld-secondary"
            onClick={() =>
              setDraft({
                ...draft,
                participants: draft.participants.filter((id) => choices.includes(id)),
                payer: payers.includes(draft.payer) ? draft.payer : uid,
              })
            }
          >
            Review changed trip membership
          </button>
        )}
        <label className="ld-how-much">
          How much?
          <span className="ld-amount-input">
            <b>₹</b>
            <input
              aria-label="Amount (INR)"
              inputMode="decimal"
              placeholder="0"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            />
          </span>
        </label>
        <label>
          <span className="ld-sr">Expense title</span>
          <input
            placeholder="What was it for?"
            value={draft.title}
            required
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <fieldset>
          <legend>Paid by</legend>
          <div className="ld-chips">
            {payers.map((id) => (
              <label className="ld-chip" key={id}>
                <input
                  type="radio"
                  name="payer"
                  checked={draft.payer === id}
                  onChange={() => setDraft({ ...draft, payer: id })}
                />
                {person(trip, id).split(' ')[0]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Split among</legend>
          <button
            type="button"
            className="ld-text"
            onClick={() =>
              setDraft({ ...draft, participants: everyone ? [] : [...trip.memberIds] })
            }
          >
            {everyone ? 'Select' : 'Everyone'}
          </button>
          <div className="ld-chips">
            {choices.map((id) => (
              <label key={id} className="ld-chip">
                <input
                  type="checkbox"
                  checked={draft.participants.includes(id)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      participants: e.target.checked
                        ? [...draft.participants, id]
                        : draft.participants.filter((v) => v !== id),
                    })
                  }
                />
                {person(trip, id).split(' ')[0]}
              </label>
            ))}
          </div>
          {Object.keys(shares).length > 0 && (
            <p className="ld-split-preview">{money(Object.values(shares)[0])} per person</p>
          )}
        </fieldset>
      </Form>
      <Feedback notice={action.notice} />
    </section>
  )
}
function useCurrent() {
  const { tripId, entryId, expenseId } = useParams()
  const id = entryId || expenseId
  const trip = useTrip(tripId),
    entry = useExpense(trip.data?.id, id)
  return { trip, entry, id, tripId }
}
export function ExpenseEditor() {
  const { uid } = useApp(),
    { trip, entry, id } = useCurrent()
  if (!trip.data || trip.error || (id && (!entry.data || entry.error)))
    return (
      <section className="ld-page">
        <Heading title="Expense" back={{ to: '/', text: 'My trips' }} />
        <Status loading={trip.loading || entry.loading} error={trip.error || entry.error} />
        {!trip.loading && !entry.loading && !trip.error && !entry.error && (
          <Empty title="Expense or trip not found" />
        )}
      </section>
    )
  if (
    trip.data.state !== 'active' ||
    (entry.data && (entry.data.deletedAt || !canChange(trip.data, entry.data, uid)))
  )
    return (
      <section className="ld-page">
        <Heading
          title="Expense editing unavailable"
          back={{ to: tripPath(trip.data.id), text: trip.data.name }}
        />
      </section>
    )
  return (
    <Editor
      key={trip.data.id + '/' + (id || 'new')}
      trip={trip.data}
      entry={entry.data || undefined}
    />
  )
}
export function ExpenseDetail() {
  const { uid } = useApp(),
    { trip: tripRow, entry: row, tripId } = useCurrent(),
    action = useAction(),
    [confirm, setConfirm] = useState(false)
  const trip = tripRow.data,
    entry = row.data
  if (!trip || !entry || row.error || tripRow.error)
    return (
      <section className="ld-page">
        <Heading
          title="Expense Details"
          back={{ to: tripId ? tripPath(tripId) : '/', text: 'Trip expenses' }}
        />
        <Status loading={tripRow.loading || row.loading} error={tripRow.error || row.error} />
        {!tripRow.loading && !row.loading && !row.error && !tripRow.error && (
          <Empty title="Entry unavailable">Expense not found or has been deleted.</Empty>
        )}
      </section>
    )
  const allowed = canChange(trip, entry, uid)
  const payer =
    entry.type === 'expense'
      ? entry.payerId
      : entry.type === 'repayment'
        ? entry.debtorId
        : entry.contributorId
  const people =
    entry.type === 'expense'
      ? entry.participantIds
      : entry.type === 'repayment'
        ? entry.sharedWith || [entry.creditorId]
        : []
  const savedShare = (entry.splitRupees || 0) * 100
  const payload = { tripId: trip.id, entryId: entry.id, entryType: entry.type }
  function undo() {
    void action.run('entry.restore', payload, 'Expense restored.')
  }
  return (
    <section className="ld-page">
      <Heading title="Details" back={{ to: tripPath(trip.id), text: trip.name }}>
        {allowed && !entry.deletedAt && (
          <div className="ld-actions">
            <Link
              className="ld-icon-button"
              aria-label="Edit expense"
              to={entryPath(trip.id, entry.id) + '/edit'}
            >
              <Icon icon={pencilOutline} />
            </Link>
            <button
              className="ld-icon-button ld-negative"
              aria-label="Delete expense"
              onClick={() => setConfirm(true)}
            >
              <Icon icon={trashOutline} />
            </button>
          </div>
        )}
      </Heading>
      <Status cached={row.cached || tripRow.cached} />
      <Feedback notice={action.notice} />
      {entry.deletedAt ? (
        <Empty title="Expense not found or has been deleted." />
      ) : (
        <>
          <section className="ld-finance-card ld-receipt-hero">
            <span className="ld-receipt-symbol">
              <Icon icon={receiptOutline} />
            </span>
            <h2>{label(entry)}</h2>
            <strong>{money(entry.amount)}</strong>
            <small>
              Added on {date(entry.createdAt)}
              {entry.isEdited ? ' · Edited ' + date(entry.updatedAt) : ''}
            </small>
          </section>
          <section>
            <h2>Paid by</h2>
            <div className="ld-finance-card ld-record">
              <Avatar uid={payer} trip={trip} name={entry.paidByName} />
              <span className="ld-record-main">
                <strong>{trip.members[payer]?.displayName || entry.paidByName || 'Unknown'}</strong>
                <small>Paid the full amount</small>
              </span>
              <strong className="ld-positive">{money(entry.amount)}</strong>
            </div>
          </section>
          <section>
            <div className="ld-panel-head">
              <h2>Split details</h2>
              <small>
                {people.length} {people.length === 1 ? 'person' : 'people'}
              </small>
            </div>
            <ul className="ld-cards">
              {people.map((id) => (
                <li className="ld-finance-card ld-record" key={id}>
                  <Avatar uid={id} trip={trip} />
                  <span className="ld-record-main">
                    <strong>{person(trip, id)}</strong>
                    <small>{id === payer ? 'Paid & split share' : 'Owes split share'}</small>
                  </span>
                  <strong>{money(savedShare)}</strong>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      {confirm && (
        <Sheet title="Delete Expense" close={() => setConfirm(false)}>
          <p>Are you sure you want to delete “{label(entry)}”?</p>
          <div className="ld-actions">
            <button className="ld-secondary" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              className="ld-danger"
              aria-label="Confirm deletion"
              disabled={action.busy}
              onClick={() => {
                void action
                  .run(
                    'entry.delete',
                    payload,
                    'Expense deleted.',
                    { expectedRevision: entry.revision },
                    undo,
                  )
                  .then((r) => {
                    if (r) setConfirm(false)
                  })
              }}
            >
              Delete
            </button>
          </div>
        </Sheet>
      )}
    </section>
  )
}
