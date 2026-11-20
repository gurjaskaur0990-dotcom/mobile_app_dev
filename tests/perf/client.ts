import { createElement, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { auth, db, emulator, send } from '../../src/platform/firebase'
import { useOutbox } from '../../src/platform/outbox'
import { trustKey } from '../../src/platform/storage'

if (!emulator || location.hostname !== '127.0.0.1')
  throw Error('Start the timing fixture on the loopback demo environment.')
const clock = () => performance.timeOrigin + performance.now()
const arrivals = new Map<string, number>()
let queueExpense: ReturnType<typeof useOutbox>['command']

function Session({ uid }: { uid: string }) {
  const { command } = useOutbox(uid, true)
  useEffect(() => {
    queueExpense = command
  }, [command])
  return createElement('span', null, 'Connected')
}

export const perfClient = {
  async login(identity: string) {
    const email = identity + '@example.test'
    const credential = GoogleAuthProvider.credential(
      JSON.stringify({ sub: 'local-' + identity, email, email_verified: true, name: identity }),
    )
    const { user } = await signInWithCredential(auth, credential)
    const start = clock()
    await send({ name: 'profile.ensure', opId: crypto.randomUUID(), payload: {} })
    const firstProfileWriteMs = clock() - start
    localStorage.setItem(trustKey(user.uid), 'yes')
    createRoot(document.getElementById('session')!).render(
      createElement(Session, { uid: user.uid }),
    )
    return { uid: user.uid, firstProfileWriteMs }
  },
  async observe(tripId: string) {
    const uid = auth.currentUser!.uid
    // Keep the active trip list and one open ledger warm, as they would be on the trip page.
    const home = new Promise<number>((resolve, reject) =>
      onSnapshot(
        query(collection(db, 'trips'), where('memberUids', 'array-contains', uid)),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!snapshot.metadata.fromCache) resolve(snapshot.size)
        },
        reject,
      ),
    )
    const entries = new Promise<number>((resolve, reject) =>
      onSnapshot(
        collection(db, 'trips', tripId, 'expenses'),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return
          for (const change of snapshot.docChanges()) {
            if (change.type !== 'added') continue
            document.getElementById('latest')!.textContent = change.doc.get('title')
            arrivals.set(change.doc.id, clock())
          }
          resolve(snapshot.size)
        },
        reject,
      ),
    )
    const [trips, expenses] = await Promise.all([home, entries])
    return { trips, expenses }
  },
  async add(tripId: string, entryId: string, peer: string) {
    const uid = auth.currentUser!.uid
    const payload = {
      tripId,
      entryId,
      title: entryId,
      amount: 100,
      payerId: uid,
      participantIds: [uid, peer],
    }
    const start = clock()
    // Exercise the same account-scoped command and acknowledgement path as the expense form.
    const result = await queueExpense('entry.expense', payload)
    const end = clock()
    return { start, end, ackMs: end - start, pending: Boolean(result.pending) }
  },
  seen(id: string) {
    return arrivals.get(id) ?? null
  },
  clock,
}

declare global {
  interface Window {
    splitTripPerf: typeof perfClient
  }
}
window.splitTripPerf = perfClient
