import type { User } from 'firebase/auth'
import { updateProfile as updateAuthProfile } from 'firebase/auth'
import {
  collection,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  runTransaction,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import type { Profile } from '../../shared/model'

export const isLegacyAdmin = (email?: string | null) => email === 'officiallanshsharma@gmail.com'

export function millis(value: unknown): number {
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  if (value && typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number')
    return (
      value.seconds * 1000 +
      Math.floor(Number('nanoseconds' in value ? value.nanoseconds : 0) / 1e6)
    )
  return 0
}
export function adaptProfile(uid: string, data: DocumentData): Profile {
  return {
    uid,
    displayName: data.displayName || 'User',
    username: data.username || '',
    email: data.email || '',
    emailVisible: !data.hideEmail,
    photoURL: data.photoURL || '',
    suspended: !!data.isSuspended,
    createdAt: millis(data.createdAt),
    revision: 0,
  }
}
export function memberSnapshot(data: DocumentData) {
  return {
    displayName: data.displayName || 'User',
    email: data.email || '',
    photoURL: data.photoURL || '',
    username: data.username || '',
    hideEmail: !!data.hideEmail,
  }
}
export async function ensureLegacyProfile(db: Firestore, user: User) {
  const ref = doc(db, 'users', user.uid)
  const data = (await getDoc(ref)).data()
  // Preserve customized names, privacy choices and creation time on repeated logins.
  if (data?.username) return { id: user.uid }
  let stem = (user.email?.split('@')[0] || user.displayName || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '_')
    .slice(0, 20)
  if (stem.length < 3) stem += '_user'
  let username = stem
  for (let i = 1; ; i++) {
    const found = await getDocs(
      query(collection(db, 'users'), where('username', '==', username), limit(1)),
    )
    if (found.empty || found.docs[0].id === user.uid) break
    username = stem.slice(0, 20 - String(i).length) + i
  }
  await runTransaction(db, async (tx) => {
    const existing = (await tx.get(ref)).data()
    if (existing?.username) return
    const fields: DocumentData = { username }
    if (!existing) {
      Object.assign(fields, {
        displayName: user.displayName || 'User',
        email: (user.email || '').toLowerCase(),
        photoURL: user.photoURL || '',
        isSuspended: false,
        hideEmail: false,
        createdAt: serverTimestamp(),
      })
    }
    tx.set(ref, fields, { merge: true })
  })
  return { id: user.uid }
}
export async function updateLegacyProfile(db: Firestore, user: User, p: DocumentData) {
  const ref = doc(db, 'users', user.uid)
  const current = (await getDoc(ref)).data()
  if (!current || current.isSuspended) throw Error('Account unavailable.')
  const fields: Record<string, string | boolean> = {}
  if (p.displayName !== undefined) {
    const name = String(p.displayName).trim()
    if (!name) throw Error('Enter a display name.')
    fields.displayName = name
  }
  if (p.username !== undefined) {
    const username = String(p.username).trim().toLowerCase()
    if (!/^[a-z0-9_.]{3,20}$/.test(username))
      throw Error('Use 3–20 letters, numbers, periods or underscores for your username.')
    if (username !== current.username) {
      const found = await getDocs(query(collection(db, 'users'), where('username', '==', username)))
      if (found.docs.some((row) => row.id !== user.uid))
        throw Error('This username is already taken.')
    }
    fields.username = username
  }
  if (typeof p.emailVisible === 'boolean') fields.hideEmail = !p.emailVisible
  const entries = Object.entries(fields)
  if (!entries.length) return { id: user.uid }
  const trips = await getDocs(
    query(collection(db, 'trips'), where('memberUids', 'array-contains', user.uid)),
  )
  const docs = trips.docs
  // Keep the user and all possible member snapshots together within the Firestore batch limit.
  for (let offset = 0; offset < Math.max(docs.length, 1); offset += 450) {
    const batch = writeBatch(db)
    if (offset === 0) batch.update(ref, fields)
    for (const trip of docs.slice(offset, offset + 450)) {
      const [[key, value], ...rest] = entries
      batch.update(
        trip.ref,
        new FieldPath('members', user.uid, key),
        value,
        ...rest.flatMap(([field, val]) => [new FieldPath('members', user.uid, field), val]),
      )
    }
    await batch.commit()
  }
  if (typeof fields.displayName === 'string' && user.displayName !== fields.displayName)
    await updateAuthProfile(user, { displayName: fields.displayName })
  return { id: user.uid }
}
