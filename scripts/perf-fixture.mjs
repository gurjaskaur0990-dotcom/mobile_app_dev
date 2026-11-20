import { createRequire } from 'node:module'

const fromFunctions = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = fromFunctions('firebase-admin/app')
const { getFirestore } = fromFunctions('firebase-admin/firestore')

/** Seed only this run's new documents on the loopback demo emulator. */
export async function seedPerformanceFixture(runId, owner, peer) {
  if (!/^[a-z0-9-]{1,64}$/.test(runId) || !owner || !peer || owner === peer)
    throw Error('Invalid fixture participants.')
  const local = '127.0.0.1:8080'
  if (process.env.FIRESTORE_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST !== local) {
    throw Error('The performance fixture uses the local Firestore emulator.')
  }
  process.env.FIRESTORE_EMULATOR_HOST = local
  const app = initializeApp({ projectId: 'demo-splittrip-flutter' }, 'perf-' + runId)
  try {
    const db = getFirestore(app)
    const tripIds = Array.from(
      { length: 20 },
      (_, index) => 'perf-' + runId + '-' + String(index).padStart(2, '0'),
    )
    const now = new Date()
    for (const [index, id] of tripIds.entries()) {
      const batch = db.batch()
      const trip = db.collection('trips').doc(id)
      batch.create(trip, {
        name: 'Timing fixture ' + (index + 1), createdBy: owner, memberUids: [owner, peer],
        members: { [owner]: {displayName: 'Timing owner'}, [peer]: {displayName: 'Timing peer'} },
        hasBudget: true, allowEditing: true, totalSpent: 250, totalBudget: 0, createdAt: now,
      })
      for (let entry = 0; entry < 25; entry++) {
        batch.create(trip.collection('expenses').doc('seed-' + entry), {
          tripId: id, title: 'Fixture expense ' + (entry + 1), createdBy: owner,
          paidBy: owner, paidByName: 'Timing owner', sharedWith: [owner, peer],
          splitAmount: 5, amount: 10, createdAt: now, isDeleted: false,
        })
      }
      await batch.commit()
    }
    return tripIds
  } finally {
    await deleteApp(app)
  }
}
