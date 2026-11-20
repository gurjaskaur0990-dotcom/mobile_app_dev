import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import {
  calculateFlutterLedger,
  dispatchLedger,
  purgeExpiredFlutterItems,
  readFlutterContribution,
  readFlutterExpense,
  readFlutterTrip,
  reconcileFlutterSpending,
} from '../src/legacy/ledger'

const projectId = 'demo-splittrip-flutter'
const suffix = randomUUID()
const owner = 'creator-' + suffix
const member = 'member-' + suffix
let suite: RulesTestEnvironment
let first: Firestore
let second: Firestore
const profile = (displayName: string) => ({
  displayName,
  email: displayName + '@example.test',
  username: displayName.toLowerCase(),
  photoURL: '',
  hideEmail: false,
  isSuspended: false,
})
const tripRef = (db: Firestore, tripId: string) => doc(db, 'trips', tripId)
const send = (uid: string, name: string, p: Record<string, unknown>, expectedRevision?: number) =>
  dispatchLedger(uid, name, p, { db: uid === owner ? first : second, expectedRevision })
beforeAll(async () => {
  suite = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080 },
  })
  first = suite.authenticatedContext(owner).firestore() as unknown as Firestore
  second = suite.authenticatedContext(member).firestore() as unknown as Firestore
  await Promise.all([
    setDoc(doc(first, 'users', owner), profile('Owner')),
    setDoc(doc(second, 'users', member), profile('Member')),
  ])
})
afterAll(async () => {
  await suite?.cleanup()
})
async function flutterTrip() {
  const id = randomUUID()
  const ref = tripRef(first, id)
  await setDoc(ref, {
    name: 'Flutter trip',
    createdBy: owner,
    createdAt: serverTimestamp(),
    memberUids: [owner, member],
    members: { [owner]: profile('Owner'), [member]: profile('Member') },
    totalSpent: 0,
    hasBudget: true,
    allowEditing: true,
  })
  return { id, ref }
}

describe('original Flutter rules and wire format', () => {
  it('writes a React trip usable by a Flutter memberUids query, then edits an expense created in Flutter format', async () => {
    const id = randomUUID()
    await send(owner, 'trip.create', { tripId: id, name: 'React trip', budgetEnabled: true })
    const legacyList = await getDocs(
      query(collection(first, 'trips'), where('memberUids', 'array-contains', owner)),
    )
    expect(legacyList.docs.find((d) => d.id === id)?.data()).toMatchObject({
      createdBy: owner,
      name: 'React trip',
      totalSpent: 0,
      hasBudget: true,
      allowEditing: true,
      members: { [owner]: { username: 'owner', hideEmail: false } },
      memberUids: [owner],
    })
    const ref = tripRef(first, id)
    await updateDoc(ref, { memberUids: [owner, member], ['members.' + member]: profile('Member') })
    const expense = doc(collection(ref, 'expenses'), 'original')
    const writes = writeBatch(first)
    writes.set(expense, {
      title: 'Flutter lunch',
      amount: 100,
      paidBy: owner,
      paidByName: 'Owner',
      sharedWith: [owner, member],
      splitAmount: 50,
      createdAt: serverTimestamp(),
      createdBy: owner,
      tripId: id,
      tripName: 'React trip',
      isDeleted: false,
      isEdited: false,
      isSettlement: false,
    })
    writes.update(ref, { totalSpent: 100 })
    await writes.commit()
    const original = (await getDoc(expense)).data()!
    const revision = readFlutterExpense(id, expense.id, original).revision
    const change = {
      tripId: id,
      entryId: expense.id,
      payerId: owner,
      participantIds: [owner, member],
      amount: 12345,
      title: 'Corrected',
    }
    await send(owner, 'entry.edit', change, revision)
    await send(owner, 'entry.edit', change, revision)
    const stored = (await getDoc(doc(second, 'trips', id, 'expenses', 'original'))).data()!
    expect(stored).toMatchObject({
      amount: 123.45,
      splitAmount: 61.725,
      sharedWith: [owner, member],
      paidBy: owner,
      createdBy: owner,
      isEdited: true,
      title: 'Corrected',
      lastUpdatedBy: owner,
      createdAt: original.createdAt,
    })
    expect(stored.editedAt).toBeInstanceOf(Timestamp)
    expect(stored).not.toHaveProperty('amountPaise')
    expect((await getDoc(ref)).get('totalSpent')).toBeCloseTo(123.45)
    await expect(send(member, 'entry.edit', { ...change, title: 'Other' })).rejects.toMatchObject({
      code: 'firestore/permission-denied',
    })
    await expect(
      send(owner, 'entry.edit', { ...change, title: 'Stale' }, revision),
    ).rejects.toMatchObject({ code: 'firestore/aborted' })
  })
  it('records advances, suggested settlements and reversible aggregate changes in native child collections', async () => {
    const { id, ref } = await flutterTrip()
    const entry = {
      tripId: id,
      entryId: 'taxi',
      title: 'Taxi',
      payerId: owner,
      participantIds: [owner, member],
      amount: 20000,
    }
    await send(owner, 'entry.expense', entry)
    await send(owner, 'entry.expense', entry)
    const gift = { tripId: id, entryId: 'fund', contributorId: member, amount: 4000 }
    await send(member, 'entry.contribute', gift)
    async function snapshot() {
      const root = readFlutterTrip(id, (await getDoc(ref)).data()!)
      const expenses = await getDocs(collection(ref, 'expenses'))
      const funds = await getDocs(collection(ref, 'contributions'))
      return calculateFlutterLedger(root, [
        ...expenses.docs.map((d) => readFlutterExpense(id, d.id, d.data())),
        ...funds.docs.map((d) => readFlutterContribution(id, d.id, d.data())),
      ])
    }
    expect(await snapshot()).toMatchObject({
      balances: { [owner]: 8000, [member]: -8000 },
      spending: 20000,
      funding: 4000,
    })
    const payment = {
      tripId: id,
      entryId: 'repay',
      debtorId: member,
      creditorId: owner,
      amount: 8000,
    }
    await send(member, 'entry.repay', payment)
    expect((await getDoc(doc(ref, 'expenses', 'repay'))).data()).toMatchObject({
      isSettlement: true,
      title: 'Settlement: Member to Owner',
      amount: 80,
      sharedWith: [owner],
      paidBy: member,
      paidByName: 'Member',
      splitAmount: 80,
    })
    expect(await snapshot()).toMatchObject({
      balances: { [owner]: 0, [member]: 0 },
      spending: 20000,
      funding: 4000,
    })
    for (const name of ['entry.delete', 'entry.restore']) {
      await send(member, name, { ...payment, entryType: 'repayment' })
      await send(member, name, { ...gift, entryType: 'contribution' })
      expect((await getDoc(ref)).get('totalSpent')).toBe(200)
      expect((await getDoc(ref)).get('totalBudget')).toBe(name === 'entry.delete' ? 0 : 40)
    }
    await send(owner, 'entry.delete', entry)
    expect((await getDoc(ref)).get('totalSpent')).toBe(0)
    await send(owner, 'entry.restore', entry)
    expect((await getDoc(ref)).get('totalSpent')).toBe(200)
    await updateDoc(ref, { totalSpent: 999 })
    await reconcileFlutterSpending(owner, id, first)
    expect((await getDoc(ref)).get('totalSpent')).toBe(200)
    await send(member, 'entry.edit', {
      ...payment,
      payerId: member,
      participantIds: [owner],
      title: 'Reclassified',
    })
    expect((await getDoc(doc(ref, 'expenses', 'repay'))).get('isSettlement')).toBe(false)
    expect((await getDoc(ref)).get('totalSpent')).toBe(280)
  })
  it('preserves archive on restore and uses the original rules for owner purge and retention', async () => {
    const { id, ref } = await flutterTrip()
    await send(owner, 'entry.expense', {
      tripId: id,
      entryId: 'old',
      title: 'Cab',
      payerId: owner,
      participantIds: [owner],
      amount: 1000,
    })
    await send(owner, 'entry.delete', { tripId: id, entryId: 'old' })
    const old = doc(collection(ref, 'expenses'), 'old')
    const clock = Date.now()
    await updateDoc(old, { deletedAt: Timestamp.fromMillis(clock - 31 * 86400000) })
    await purgeExpiredFlutterItems(owner, first, clock)
    expect((await getDoc(old)).exists()).toBe(false)
    await send(owner, 'entry.expense', {
      tripId: id,
      entryId: 'child',
      title: 'Rail',
      payerId: owner,
      participantIds: [member],
      amount: 100,
    })
    await send(member, 'entry.contribute', {
      tripId: id,
      entryId: 'budget',
      contributorId: member,
      amount: 100,
    })
    await send(owner, 'trip.archive', { tripId: id })
    await send(owner, 'trip.delete', { tripId: id })
    await send(owner, 'trip.restore', { tripId: id })
    expect((await getDoc(ref)).data()).toMatchObject({ isArchived: true, isDeleted: false })
    await send(owner, 'trip.delete', { tripId: id })
    await expect(send(member, 'purge.start', { tripId: id })).rejects.toMatchObject({
      code: 'firestore/permission-denied',
    })
    await send(owner, 'purge.start', { tripId: id })
    const list = await getDocs(
      query(collection(first, 'trips'), where('memberUids', 'array-contains', owner)),
    )
    expect(list.docs.some((d) => d.id === id)).toBe(false)
    await suite.withSecurityRulesDisabled(async (ctx) => {
      expect((await getDocs(collection(ctx.firestore(), 'trips', id, 'expenses'))).empty).toBe(true)
      expect((await getDocs(collection(ctx.firestore(), 'trips', id, 'contributions'))).empty).toBe(
        true,
      )
    })
  })
})
