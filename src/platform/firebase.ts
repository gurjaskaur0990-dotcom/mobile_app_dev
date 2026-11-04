import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import {
  initializeFirestore,
  memoryLocalCache,
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
} from 'firebase/firestore'
import type { Command, Result } from '../../shared/model'
import { flutterWebConfig } from '../legacy/firebase-web'
import { ensureLegacyProfile, updateLegacyProfile } from '../legacy/account'
import { legacyCollaboration } from '../legacy/collaboration'
import { emulator, firebaseClientName } from './environment'
export { emulator } from './environment'
export const app = initializeApp(
  emulator
    ? {
        projectId: 'demo-splittrip-flutter',
        apiKey: 'demo-key',
        authDomain: 'demo-splittrip-flutter.firebaseapp.com',
        appId: '1:123:web:compat',
        messagingSenderId: '123',
      }
    : flutterWebConfig,
  firebaseClientName,
)
export const auth = getAuth(app)
export const db = initializeFirestore(app, { localCache: memoryLocalCache() })
export const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || ''
if (emulator) {
  const host = import.meta.env.VITE_EMULATOR_HOST || '127.0.0.1'
  connectAuthEmulator(auth, 'http://' + host + ':9099', {
    disableWarnings: true,
  })
  connectFirestoreEmulator(db, host, 8080)
}
export async function send(
  input: Command,
  originUid = auth.currentUser?.uid,
): Promise<Result> {
  const user = auth.currentUser
  if (!user || user.uid !== originUid)
    throw Error('This account has signed out.')
  if (input.name === 'profile.ensure') return ensureLegacyProfile(db, user)
  if (input.name === 'profile.update' || /^(trip|entry|purge)\./.test(input.name)) {
    // The Flutter rules keep suspension on the profile. Check it again when a queued write replays.
    const profile = await getDocFromServer(doc(db, 'users', user.uid))
    if (!profile.exists() || profile.get('isSuspended')) throw Error('Account unavailable.')
    if (auth.currentUser?.uid !== originUid) throw Error('This account has signed out.')
  }
  if (input.name === 'profile.update')
    return updateLegacyProfile(db, user, input.payload)
  if (/^(trip|entry|purge)\./.test(input.name)) {
    const { dispatchLedger } = await import('../legacy/ledger')
    return dispatchLedger(user.uid, input.name, input.payload, {
      opId: input.opId,
      expectedRevision: input.expectedRevision,
      db,
      isCurrent: () => auth.currentUser?.uid === user.uid,
    })
  }
  return legacyCollaboration(db, user, input)
}
