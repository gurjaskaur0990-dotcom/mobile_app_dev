// This fixture can only write to the local demo project and loopback emulators.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
initializeApp({ projectId: 'demo-splittrip-flutter' })
const db = getFirestore()
async function actor(name) {
  const email = name.toLowerCase() + '@example.test'
  const token = JSON.stringify({
    sub: 'local-' + name,
    email,
    email_verified: true,
    name,
  })
  const res = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-key',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestUri: 'http://localhost',
        returnSecureToken: true,
        postBody: new URLSearchParams({
          id_token: token,
          providerId: 'google.com',
        }).toString(),
      }),
    },
  )
  if (!res.ok) throw Error('Local Auth emulator rejected demo sign-in.')
  const { localId: uid } = await res.json()
  const member = {
    displayName: name,
    email,
    photoURL: '',
    username: name.toLowerCase(),
    hideEmail: false,
  }
  return { uid, member }
}
async function main() {
  const [asha, bharat, charu] = await Promise.all(
    ['Asha', 'Bharat', 'Charu'].map(actor),
  )
  const travelers = [asha, bharat, charu]
  await db.runTransaction(async (tx) => {
    const marker = db.doc('_fixtures/jaipur-flutter-v1')
    if ((await tx.get(marker)).exists) return
    const profiles = await tx.getAll(
      ...travelers.map((a) => db.doc('users/' + a.uid)),
    )
    const now = Timestamp.now()
    for (const [i, a] of travelers.entries())
      if (!profiles[i].exists)
        tx.create(profiles[i].ref, {
          ...a.member,
          createdAt: now,
          isSuspended: false,
        })
    const ref = db.doc('trips/sample-jaipur')
    const members = Object.fromEntries(travelers.map((a) => [a.uid, a.member]))
    tx.create(ref, {
      name: 'Jaipur weekend',
      createdBy: asha.uid,
      createdAt: now,
      memberUids: Object.keys(members),
      members,
      pendingMemberUids: [],
      pendingMembers: {},
      totalSpent: 120,
      totalBudget: 60,
      isArchived: false,
      isDeleted: false,
      hasBudget: true,
      allowEditing: true,
      archivedAt: null,
      deletedAt: null,
    })
    tx.create(ref.collection('expenses').doc('station-breakfast'), {
      title: 'Station breakfast',
      amount: 120,
      paidBy: asha.uid,
      paidByName: 'Asha',
      sharedWith: Object.keys(members),
      splitAmount: 40,
      createdBy: asha.uid,
      createdAt: now,
      isDeleted: false,
      deletedAt: null,
      isEdited: false,
      editedAt: null,
      tripId: ref.id,
      tripName: 'Jaipur weekend',
      lastUpdatedBy: asha.uid,
      lastUpdatedByName: 'Asha',
      isSettlement: false,
    })
    tx.create(ref.collection('contributions').doc('breakfast-fund'), {
      contributorUid: bharat.uid,
      contributorName: 'Bharat',
      amount: 60,
      createdBy: bharat.uid,
      createdAt: now,
      isDeleted: false,
      deletedAt: null,
    })
    tx.create(marker, { createdAt: now })
  })
  console.log(
    'Flutter-format Jaipur weekend is ready for Asha, Bharat and Charu.',
  )
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
