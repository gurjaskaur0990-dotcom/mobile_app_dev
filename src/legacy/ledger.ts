import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  getDocsFromServer,
  increment,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type Firestore,
  type Transaction,
} from 'firebase/firestore'
import type { Entry, ContributionEntry, Transfer } from '../../shared/ledger'
import type { Trip, Result } from '../../shared/model'

type Row = DocumentData
type Expense = Exclude<Entry, ContributionEntry> & {
  rupees: number
  paidByName: string
  sharedWith: string[]
  recordedTitle: string
  lastUpdatedByName: string
  editedAt: number | null
}
type Contribution = ContributionEntry & { rupees: number; contributorName: string }
type Options = {
  opId?: string
  expectedRevision?: number
  db?: Firestore
  isCurrent?: () => boolean
}
function checkSession(isCurrent?: () => boolean) {
  if (isCurrent && !isCurrent()) fail('cancelled', 'The originating account has signed out.')
}
const record = (row: unknown): Row => (row && typeof row === 'object' ? (row as Row) : {})
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((x) => typeof x === 'string') : []
const string = (value: unknown): string => (typeof value === 'string' ? value : '')
const numeric = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0
const displayPaise = (rupees: number) => Math.round(Number(rupees.toFixed(2)) * 100) || 0
function millis(value: any): number {
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (typeof value?.seconds === 'number')
    return value.seconds * 1000 + (value.nanoseconds || 0) / 1_000_000
  return value instanceof Date ? value.getTime() : numeric(value)
}
// Flutter documents have no revision field. Compare the actual source content without adding one.
function signature(data: Row): number {
  function normalize(v: any): unknown {
    if (v == null || typeof v !== 'object') return v
    if (Array.isArray(v)) return v.map(normalize)
    if (typeof v.seconds === 'number' && typeof v.nanoseconds === 'number')
      return [v.seconds, v.nanoseconds]
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((key) => [key, normalize(v[key])]),
    )
  }
  const { id: _uiId, ...persisted } = data
  const bytes = JSON.stringify(normalize(persisted))
  let hash = 2166136261
  for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes.charCodeAt(i), 16777619)
  return hash >>> 0
}
export function readFlutterTrip(id: string, data: Row): Trip {
  return {
    id,
    name: string(data.name),
    ownerId: string(data.createdBy),
    memberIds: strings(data.memberUids),
    members: record(data.members),
    state: data.isDeleted ? 'deleted' : data.isArchived ? 'archived' : 'active',
    budgetEnabled: data.hasBudget === true,
    editingEnabled: data.allowEditing !== false,
    spending: displayPaise(numeric(data.totalSpent)),
    funding: displayPaise(numeric(data.totalBudget)),
    balances: {},
    createdAt: millis(data.createdAt),
    deletedAt: data.isDeleted ? millis(data.deletedAt) || 1 : null,
    revision: signature(data),
  }
}
export function flutterSplitShares(
  amountPaise: number,
  ids: readonly string[],
): Record<string, number> {
  return Object.fromEntries(ids.map((uid) => [uid, displayPaise(amountPaise / 100 / ids.length)]))
}
function common(tripId: string, id: string, data: Row) {
  return {
    id,
    tripId,
    amount: displayPaise(numeric(data.amount)),
    rupees: numeric(data.amount),
    revision: signature(data),
    createdAt: millis(data.createdAt),
    updatedAt: millis(data.editedAt || data.createdAt),
    deletedAt: data.isDeleted ? millis(data.deletedAt) || 1 : null,
  }
}
export function readFlutterExpense(tripId: string, id: string, data: Row): Expense {
  const payer = string(data.paidBy)
  const participants = strings(data.sharedWith)
  const title = string(data.title)
  const base = {
    ...common(tripId, id, data),
    authorId: string(data.createdBy) || payer,
    paidByName: string(data.paidByName),
    sharedWith: participants,
    recordedTitle: title,
    lastUpdatedByName: string(data.lastUpdatedByName),
    editedAt: data.isEdited ? millis(data.editedAt) : null,
  }
  return (data.isSettlement ?? title.startsWith('Settlement:'))
    ? { ...base, type: 'repayment', debtorId: payer, creditorId: participants[0] || '' }
    : {
        ...base,
        type: 'expense',
        title,
        payerId: payer,
        participantIds: participants,
        shares: Object.fromEntries(
          participants.map((uid) => [uid, displayPaise(numeric(data.splitAmount))]),
        ),
      }
}
export function readFlutterContribution(tripId: string, id: string, data: Row): Contribution {
  return {
    ...common(tripId, id, data),
    type: 'contribution',
    authorId: string(data.createdBy),
    contributorId: string(data.contributorUid),
    contributorName: string(data.contributorName),
  }
}

export function flutterTransfers(balances: Record<string, number>): Transfer[] {
  // Flutter tests the thresholds in rupees before and after each subtraction.
  const rows = Object.entries(balances).map(([id, n]) => ({ id, value: n / 100 }))
  const debtors = rows
    .filter((x) => x.value < -0.01)
    .map((x) => ({ ...x, value: -x.value }))
    .sort((a, b) => b.value - a.value)
  const creditors = rows.filter((x) => x.value > 0.01).sort((a, b) => b.value - a.value)
  const result: Transfer[] = []
  let d = 0,
    c = 0
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].value, creditors[c].value)
    result.push({
      debtorId: debtors[d].id,
      creditorId: creditors[c].id,
      amount: displayPaise(amount),
    })
    debtors[d].value -= amount
    creditors[c].value -= amount
    if (debtors[d].value < 0.01) d++
    if (creditors[c].value < 0.01) c++
  }
  return result
}
export function calculateFlutterLedger(trip: Trip, entries: readonly Entry[]) {
  const memberIds = Object.keys(trip.members)
  const balances: Record<string, number> = Object.assign(
    Object.create(null),
    Object.fromEntries(memberIds.map((uid) => [uid, 0])),
  )
  const contributions: Record<string, number> = Object.create(null)
  const ordered = entries
    .filter((e) => e.deletedAt === null)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
  const amount = (e: Entry) => ('rupees' in e ? numeric(e.rupees) : e.amount / 100)
  let spending = 0
  for (const item of ordered) {
    if (item.type === 'contribution') continue
    const payer = item.type === 'expense' ? item.payerId : item.debtorId
    const participants =
      'sharedWith' in item
        ? strings(item.sharedWith)
        : item.type === 'expense'
          ? item.participantIds
          : [item.creditorId]
    const value = amount(item)
    if (item.type === 'expense') spending += value
    balances[payer] = (balances[payer] || 0) + value
    for (const uid of participants)
      balances[uid] = (balances[uid] || 0) - value / participants.length
  }
  for (const uid of Object.keys(balances)) balances[uid] = Number(balances[uid].toFixed(2))
  for (const item of ordered) {
    if (item.type !== 'contribution' || !memberIds.length) continue
    const value = amount(item)
    contributions[item.contributorId] = (contributions[item.contributorId] || 0) + value
    balances[item.contributorId] = (balances[item.contributorId] || 0) + value
    for (const uid of memberIds) balances[uid] -= value / memberIds.length
  }
  const personal = Object.fromEntries(
    Object.entries(balances).map(([uid, n]) => [uid, displayPaise(n)]),
  )
  const budgetBalances = Object.fromEntries(
    memberIds.map((uid) => [
      uid,
      displayPaise((contributions[uid] || 0) - spending / memberIds.length),
    ]),
  )
  return {
    spending: displayPaise(spending),
    funding: trip.funding,
    balances: personal,
    budgetBalances,
    transfers: flutterTransfers(personal),
    budgetTransfers: flutterTransfers(budgetBalances),
  }
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code: 'firestore/' + code })
}
function id(value: unknown) {
  if (typeof value !== 'string' || !value || value.includes('/') || value === '.' || value === '..')
    return fail('invalid-argument', 'Invalid record identifier.')
  return value
}
function amountInRupees(p: Row) {
  const value = p.amountRupees ?? p.amount / 100
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    return fail('invalid-argument', 'Enter a positive amount.')
  return value
}
function checkRevision(row: Row, expected?: number) {
  if (expected !== undefined && expected !== signature(row))
    fail('aborted', 'This record changed. Review the latest version.')
}
function checkMember(data: Row, uid: string) {
  if (!strings(data.memberUids).includes(uid))
    fail('permission-denied', 'You are no longer a member of this trip.')
}
function checkOwner(data: Row, uid: string) {
  if (uid !== data.createdBy) fail('permission-denied', 'Only the trip creator can do this.')
}
function checkActive(data: Row) {
  if (data.isArchived || data.isDeleted) fail('failed-precondition', 'This trip is read-only.')
}
function memberMap(data: Row) {
  return {
    displayName: string(data.displayName),
    email: string(data.email),
    photoURL: string(data.photoURL),
    username: string(data.username),
    hideEmail: data.hideEmail === true,
  }
}
function profileName(trip: Row, uid: string) {
  return string(record(trip.members)[uid]?.displayName) || 'Unknown'
}

async function createTrip(db: Firestore, uid: string, p: Row, isCurrent?: () => boolean) {
  const tripId = id(p.tripId)
  const name = string(p.name).trim()
  if (!name) fail('invalid-argument', 'Enter a trip name.')
  // Rules permit membership queries, but an as-yet-uncreated trip cannot be fetched by its document ID.
  const membership = await getDocsFromServer(
    query(collection(db, 'trips'), where('memberUids', 'array-contains', uid)),
  )
  const matching = membership.docs.find((item) => item.id === tripId)
  if (!matching) {
    const user = await getDoc(doc(db, 'users', uid))
    checkSession(isCurrent)
    if (!user.exists()) fail('failed-precondition', 'Finish signing in first.')
    await setDoc(doc(db, 'trips', tripId), {
      name,
      createdBy: uid,
      createdAt: serverTimestamp(),
      memberUids: [uid],
      members: { [uid]: memberMap(user.data()!) },
      totalSpent: 0,
      hasBudget: p.budgetEnabled === true,
      allowEditing: p.editingEnabled !== false,
    })
  } else if (matching.get('createdBy') !== uid)
    fail('already-exists', 'This trip identifier is already in use.')
  return { id: tripId }
}

async function changeTrip(
  tx: Transaction,
  ref: ReturnType<typeof doc>,
  uid: string,
  data: Row,
  name: string,
  p: Row,
  expected?: number,
) {
  checkOwner(data, uid)
  const same = (flag: string, wanted: boolean) => Boolean(data[flag]) === wanted
  if (name === 'trip.settings') {
    if (data.isDeleted) fail('failed-precondition', 'Restore the trip first.')
    const changes: Row = {}
    if (typeof p.name === 'string' && p.name.trim() && p.name.trim() !== data.name)
      changes.name = p.name.trim()
    if (typeof p.budgetEnabled === 'boolean' && p.budgetEnabled !== (data.hasBudget === true))
      changes.hasBudget = p.budgetEnabled
    if (typeof p.editingEnabled === 'boolean' && p.editingEnabled !== (data.allowEditing !== false))
      changes.allowEditing = p.editingEnabled
    if (Object.keys(changes).length) {
      checkRevision(data, expected)
      tx.update(ref, changes)
    }
  } else {
    const changes: Record<string, readonly [string, string, boolean]> = {
      'trip.archive': ['isArchived', 'archivedAt', true],
      'trip.unarchive': ['isArchived', 'archivedAt', false],
      'trip.delete': ['isDeleted', 'deletedAt', true],
      'trip.restore': ['isDeleted', 'deletedAt', false],
    }
    if (!changes[name]) fail('invalid-argument', 'Unknown trip operation.')
    const [flag, stamp, wanted] = changes[name]
    if (flag === 'isArchived' && data.isDeleted)
      fail('failed-precondition', 'Restore the trip first.')
    if (!same(flag, wanted)) {
      checkRevision(data, expected)
      tx.update(ref, { [flag]: wanted, [stamp]: wanted ? serverTimestamp() : deleteField() })
    }
  }
  return { id: ref.id }
}

function expenseFields(
  trip: Row,
  tripId: string,
  uid: string,
  p: Row,
  payment: boolean,
  actorName: string,
  previous?: Row,
) {
  const amount = amountInRupees(p)
  const payer = id(payment ? p.debtorId : p.payerId)
  const participants = payment ? [id(p.creditorId)] : strings(p.participantIds)
  if (!participants.length || new Set(participants).size !== participants.length)
    fail('invalid-argument', 'Select participants.')
  if (
    !payment &&
    ((!trip.memberUids.includes(payer) && previous?.paidBy !== payer) ||
      participants.some(
        (person) =>
          !trip.memberUids.includes(person) && !strings(previous?.sharedWith).includes(person),
      ))
  ) {
    fail('failed-precondition', 'Membership changed. Review the expense.')
  }
  const paidByName = profileName(trip, payer)
  const title = payment
    ? 'Settlement: ' +
      paidByName.split(' ')[0] +
      ' to ' +
      profileName(trip, participants[0]).split(' ')[0]
    : string(p.title).trim()
  if (!title) fail('invalid-argument', 'Enter an expense title.')
  return {
    title,
    amount,
    paidBy: payer,
    paidByName,
    sharedWith: participants,
    splitAmount: amount / participants.length,
    createdBy: previous ? string(previous.createdBy) : uid,
    createdAt: previous?.createdAt ?? serverTimestamp(),
    isDeleted: false,
    deletedAt: null,
    isEdited: Boolean(previous),
    editedAt: previous ? serverTimestamp() : null,
    tripId,
    tripName: string(trip.name),
    lastUpdatedBy: payment ? '' : uid,
    lastUpdatedByName: payment ? '' : actorName,
    isSettlement: payment,
  }
}

async function purgeTrip(
  db: Firestore,
  uid: string,
  tripId: string,
  expiryCutoff?: number,
  isCurrent?: () => boolean,
) {
  const parent = doc(db, 'trips', tripId)
  function confirm(current: Row) {
    checkOwner(current, uid)
    if (!current.isDeleted) fail('failed-precondition', 'Only deleted trips can be purged.')
    if (
      expiryCutoff !== undefined &&
      (!current.deletedAt || millis(current.deletedAt) >= expiryCutoff)
    ) {
      fail('aborted', 'The deletion date changed.')
    }
  }
  const membership = await getDocsFromServer(
    query(collection(db, 'trips'), where('memberUids', 'array-contains', uid)),
  )
  const trip = membership.docs.find((item) => item.id === tripId)?.data()
  if (!trip) return { id: tripId }
  confirm(trip)
  const [expenses, contributions] = await Promise.all(
    ['expenses', 'contributions'].map((path) => getDocsFromServer(collection(parent, path))),
  )
  if (trip.allowEditing === false && !expenses.empty)
    fail(
      'permission-denied',
      'Restore the trip and enable expense editing before purging its expenses.',
    )
  const children = [...expenses.docs, ...contributions.docs]
  for (let i = 0; i < Math.max(children.length, 1); i += 400) {
    await runTransaction(db, async (tx) => {
      const current = (await tx.get(parent)).data()
      checkSession(isCurrent)
      if (!current) return
      confirm(current)
      children.slice(i, i + 400).forEach((child) => tx.delete(child.ref))
      if (i + 400 >= children.length) tx.delete(parent)
    })
  }
  return { id: tripId }
}

export async function dispatchLedger(
  uid: string,
  name: string,
  p: Row,
  options: Options = {},
): Promise<Result> {
  const db = options.db ?? (await import('../platform/firebase')).db
  checkSession(options.isCurrent)
  if (name === 'trip.create') return createTrip(db, uid, p, options.isCurrent)
  const tripId = id(p.tripId)
  const parent = doc(db, 'trips', tripId)
  if (name === 'purge.start' && !p.entryId)
    return purgeTrip(db, uid, tripId, undefined, options.isCurrent)
  return runTransaction(db, async (tx) => {
    const [tripDoc, profileDoc] = await Promise.all([tx.get(parent), tx.get(doc(db, 'users', uid))])
    const trip = tripDoc.data()
    const actorName = string(profileDoc.data()?.displayName)
    checkSession(options.isCurrent)
    if (!trip) return fail('not-found', 'The trip is unavailable.')
    checkMember(trip, uid)
    if (name.startsWith('trip.'))
      return changeTrip(tx, parent, uid, trip, name, p, options.expectedRevision)
    const entryId = id(p.entryId)
    const result = { id: entryId, tripId }
    const expense = doc(collection(parent, 'expenses'), entryId)
    const contribution = doc(collection(parent, 'contributions'), entryId)
    const creating = ['entry.expense', 'entry.repay', 'entry.contribute'].includes(name)
    if (creating) {
      checkActive(trip)
      const budget = name === 'entry.contribute'
      const ref = budget ? contribution : expense
      const prior = await tx.get(ref)
      checkSession(options.isCurrent)
      if (prior.exists()) {
        if (prior.get('createdBy') !== uid)
          fail('already-exists', 'Another person already created an entry with this identifier.')
        return result
      }
      if (budget) {
        const contributor = id(p.contributorId)
        if (!trip.hasBudget || !trip.memberUids.includes(contributor))
          fail('failed-precondition', 'Choose a current contributor in a budget-enabled trip.')
        const amount = amountInRupees(p)
        tx.set(ref, {
          contributorUid: contributor,
          contributorName: profileName(trip, contributor),
          amount,
          createdBy: uid,
          createdAt: serverTimestamp(),
          isDeleted: false,
          deletedAt: null,
        })
        tx.update(parent, { totalBudget: increment(amount) })
      } else {
        if (name === 'entry.repay') checkRevision(trip, options.expectedRevision)
        const data = expenseFields(trip, tripId, uid, p, name === 'entry.repay', actorName)
        tx.set(ref, data)
        if (!data.isSettlement) tx.update(parent, { totalSpent: increment(data.amount) })
      }
      return result
    }
    let ref = p.entryType === 'contribution' ? contribution : expense
    let entry = (await tx.get(ref)).data()
    if (!entry && !p.entryType && name !== 'entry.edit') {
      ref = contribution
      entry = (await tx.get(ref)).data()
    }
    checkSession(options.isCurrent)
    if (!entry) {
      if (name === 'purge.start') return result
      return fail('not-found', 'The ledger entry is unavailable.')
    }
    const budget = ref.parent.id === 'contributions'
    const author = string(entry.createdBy) || (budget ? '' : string(entry.paidBy))
    if (uid !== author && uid !== trip.createdBy)
      fail('permission-denied', 'Only the entry creator or trip creator can change this entry.')
    if (!budget && trip.allowEditing === false)
      fail('failed-precondition', 'Expense editing is disabled.')
    const payment = !budget && (entry.isSettlement ?? string(entry.title).startsWith('Settlement:'))
    if (name === 'purge.start') {
      if (author !== uid || budget || !entry.isDeleted)
        fail('permission-denied', 'Only the creator can purge a deleted expense.')
      checkRevision(entry, options.expectedRevision)
      tx.delete(ref)
    } else if (name === 'entry.edit') {
      checkActive(trip)
      if (budget || entry.isDeleted)
        fail('failed-precondition', 'Choose an active expense to edit.')
      const updated = expenseFields(trip, tripId, uid, p, false, actorName, entry)
      if (
        entry.isEdited &&
        entry.lastUpdatedBy === uid &&
        updated.title === entry.title &&
        updated.amount === entry.amount &&
        updated.paidBy === entry.paidBy &&
        JSON.stringify(updated.sharedWith) === JSON.stringify(entry.sharedWith)
      )
        return result
      checkRevision(entry, options.expectedRevision)
      tx.update(ref, updated)
      const delta = updated.amount - (payment ? 0 : numeric(entry.amount))
      if (delta) tx.update(parent, { totalSpent: increment(delta) })
    } else if (name === 'entry.delete' || name === 'entry.restore') {
      const removing = name === 'entry.delete'
      if (removing) checkActive(trip)
      if (Boolean(entry.isDeleted) === removing) return result
      checkRevision(entry, options.expectedRevision)
      tx.update(ref, {
        isDeleted: removing,
        deletedAt: removing ? serverTimestamp() : deleteField(),
        ...(budget ? {} : { lastUpdatedBy: uid, lastUpdatedByName: actorName }),
      })
      if (!payment)
        tx.update(parent, {
          [budget ? 'totalBudget' : 'totalSpent']: increment(
            (removing ? -1 : 1) * numeric(entry.amount),
          ),
        })
    } else fail('invalid-argument', 'Unknown ledger operation.')
    return result
  })
}

/** Flutter's retention job runs for the signed-in creator when they open the app. */
export async function purgeExpiredFlutterItems(
  uid: string,
  database?: Firestore,
  now = Date.now(),
) {
  const runtime = database ? undefined : await import('../platform/firebase')
  const db = database ?? runtime!.db
  const isCurrent = runtime ? () => runtime.auth.currentUser?.uid === uid : undefined
  const cutoff = now - 30 * 86400000
  const trips = await getDocsFromServer(
    query(collection(db, 'trips'), where('memberUids', 'array-contains', uid)),
  )
  for (const trip of trips.docs) {
    const data = trip.data()
    if (data.isDeleted) {
      if (data.createdBy === uid && data.deletedAt && millis(data.deletedAt) < cutoff)
        await purgeTrip(db, uid, trip.id, cutoff, isCurrent)
      continue
    }
    if (data.allowEditing === false) continue
    const deleted = await getDocsFromServer(
      query(collection(trip.ref, 'expenses'), where('isDeleted', '==', true)),
    )
    for (const expense of deleted.docs) {
      const row = expense.data()
      if (
        (row.createdBy || row.paidBy) === uid &&
        row.deletedAt &&
        millis(row.deletedAt) < cutoff
      ) {
        await dispatchLedger(
          uid,
          'purge.start',
          { tripId: trip.id, entryId: expense.id, entryType: 'expense' },
          { db, expectedRevision: signature(row), isCurrent },
        )
      }
    }
  }
}

/** Repair a historical total only after a complete server read and a final trip version check. */
export async function reconcileFlutterSpending(uid: string, tripId: string, database?: Firestore) {
  const runtime = database ? undefined : await import('../platform/firebase')
  const db = database ?? runtime!.db
  const ref = doc(db, 'trips', id(tripId))
  const initial = (await getDocFromServer(ref)).data()
  if (!initial || initial.isDeleted || !strings(initial.memberUids).includes(uid)) return
  const expenses = await getDocsFromServer(
    query(collection(ref, 'expenses'), orderBy('createdAt', 'desc')),
  )
  let spending = 0
  for (const snap of expenses.docs) {
    const item = snap.data()
    if (!item.isDeleted && !(item.isSettlement ?? string(item.title).startsWith('Settlement:')))
      spending += numeric(item.amount)
  }
  const corrected = Number(spending.toFixed(2))
  if (Math.abs(corrected - Number(numeric(initial.totalSpent).toFixed(2))) <= 0.01) return
  await runTransaction(db, async (tx) => {
    const current = (await tx.get(ref)).data()
    if (runtime && runtime.auth.currentUser?.uid !== uid) return
    if (
      current &&
      signature(current) === signature(initial) &&
      strings(current.memberUids).includes(uid)
    ) {
      tx.update(ref, { totalSpent: corrected })
    }
  })
}
