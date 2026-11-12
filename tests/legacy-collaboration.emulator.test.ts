import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app'
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  setDoc,
  connectFirestoreEmulator,
  getFirestore,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore'
import {
  adaptProfile,
  ensureLegacyProfile,
  isLegacyAdmin,
  updateLegacyProfile,
  memberSnapshot,
} from '../src/legacy/account'
import { legacyCollaboration } from '../src/legacy/collaboration'

const apps: FirebaseApp[] = []
async function identity(admin = false) {
  const id = admin ? 'local-Administrator' : randomUUID()
  const email = admin ? 'officiallanshsharma@gmail.com' : id + '@example.test'
  const app = initializeApp(
    { projectId: 'demo-splittrip-flutter', apiKey: 'demo-key' },
    randomUUID(),
  )
  apps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const { user } = await signInWithCredential(
    auth,
    GoogleAuthProvider.credential(
      JSON.stringify({ sub: id, name: 'Traveler ' + id.slice(0, 5), email, email_verified: true }),
    ),
  )
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  await ensureLegacyProfile(db, user)
  return {
    uid: user.uid,
    user,
    db,
    run: (name: string, payload: Record<string, any> = {}) =>
      legacyCollaboration(db, user, { opId: randomUUID(), name, payload }),
  }
}
let a: Awaited<ReturnType<typeof identity>>, b: typeof a, staff: typeof a
beforeAll(async () => {
  ;[a, b, staff] = await Promise.all([identity(), identity(), identity(true)])
})
afterAll(async () => {
  await Promise.all(apps.map(deleteApp))
})
describe('React interoperability with the Flutter rules, documents and Functions', () => {
  it('preserves profile preferences, syncs member cards and uses original invitation transitions', async () => {
    const uid = a.uid,
      id = randomUUID()
    const ref = doc(a.db, 'trips', id)
    const card = memberSnapshot((await getDocFromServer(doc(a.db, 'users', uid))).data()!)
    await setDoc(ref, {
      name: 'Shared itinerary',
      createdBy: uid,
      memberUids: [uid],
      members: { [uid]: card },
      pendingMemberUids: [],
      pendingMembers: {},
      createdAt: serverTimestamp(),
      isDeleted: false,
      isArchived: false,
      allowEditing: true,
      totalSpent: 0,
    })
    const username = 'ruby_' + randomUUID().slice(0, 6)
    await updateLegacyProfile(a.db, a.user, { displayName: 'Riya', username, emailVisible: false })
    await ensureLegacyProfile(a.db, a.user)
    const raw = (await getDocFromServer(doc(a.db, 'users', uid))).data()!
    expect(adaptProfile(uid, raw)).toMatchObject({
      displayName: 'Riya',
      username,
      emailVisible: false,
    })
    expect(raw).not.toHaveProperty('revision')
    expect((await getDocFromServer(ref)).get('members')[uid]).toMatchObject({
      displayName: 'Riya',
      username,
      hideEmail: true,
    })
    expect((await b.run('member.lookup', { query: a.user.email })).user).not.toHaveProperty('email')
    await a.run('member.invite', { tripId: id, recipientId: b.uid })
    await a.run('member.invite', { tripId: id, recipientId: b.uid })
    const invited = await getDocsFromServer(
      query(collection(b.db, 'trips'), where('pendingMemberUids', 'array-contains', b.uid)),
    )
    expect(invited.docs.some((s) => s.id === id)).toBe(true)
    await b.run('invitation.respond', { tripId: id, accept: false })
    expect((await getDocFromServer(ref)).get('pendingMemberUids')).toEqual([])
    await a.run('member.invite', { tripId: id, recipientId: b.uid })
    await b.run('invitation.respond', { tripId: id, accept: true })
    expect((await getDocFromServer(ref)).get('memberUids')).toEqual([uid, b.uid])
    await expect
      .poll(
        async () =>
          (await getDocsFromServer(collection(b.db, 'users', b.uid, 'notifications'))).docs.some(
            (n) => n.get('tripId') === id && n.get('title') === 'Trip Invitation',
          ),
        { timeout: 20000 },
      )
      .toBe(true)
    await a.run('member.remove', { tripId: id, memberId: b.uid })
    expect((await getDocFromServer(ref)).get('members')).not.toHaveProperty(b.uid)
    await expect(getDocFromServer(doc(b.db, 'trips', id))).rejects.toMatchObject({
      code: 'permission-denied',
    })
  })
  it('uses legacy moderator identity, feedback fields, announcement configuration and suspension', async () => {
    expect(isLegacyAdmin(staff.user.email)).toBe(true)
    const result = await b.run('feedback.submit', {
      category: 'feature',
      body: 'An itinerary export',
    })
    const ticket = doc(staff.db, 'feedback', result.id!)
    expect((await getDocFromServer(ticket)).data()).toMatchObject({
      type: 'feature',
      message: 'An itinerary export',
      status: 'open',
      userId: b.uid,
    })
    await expect(
      b.run('feedback.moderate', { id: result.id, status: 'resolved', notes: 'x' }),
    ).rejects.toThrow()
    await staff.run('feedback.moderate', {
      id: result.id,
      status: 'in_progress',
      notes: 'Under review',
    })
    expect((await getDocFromServer(ticket)).get('adminNotes')).toBe('Under review')
    await staff.run('announcement.save', { enabled: true, body: 'QA banner' })
    expect((await getDocFromServer(doc(a.db, 'config', 'announcement'))).data()).toMatchObject({
      isEnabled: true,
      message: 'QA banner',
    })
    await staff.run('account.suspend', { uid: b.uid, suspended: true })
    expect(
      adaptProfile(b.uid, (await getDocFromServer(doc(b.db, 'users', b.uid))).data()!).suspended,
    ).toBe(true)
    await expect(b.run('feedback.submit', { body: 'Paused' })).rejects.toThrow(
      'Account unavailable',
    )
    await staff.run('account.suspend', { uid: b.uid, suspended: false })
    await staff.run('feedback.delete', { id: result.id })
    expect((await getDocFromServer(ticket)).exists()).toBe(false)
  })
  it('reads original notification and broadcast documents without client fanout', async () => {
    const ref = doc(b.db, 'users', b.uid)
    // The original worker selects non-null token fields and skips sending empty tokens to real FCM.
    await setDoc(ref, { fcmToken: '' }, { merge: true })
    const title = 'Bulletin ' + randomUUID()
    const result = await staff.run('broadcast.send', { title, body: 'Hello' })
    await expect
      .poll(
        async () => (await getDocFromServer(doc(staff.db, 'broadcasts', result.id!))).get('status'),
        { timeout: 20000 },
      )
      .toBe('completed')
    const matching = await getDocsFromServer(
      query(collection(ref, 'notifications'), where('title', '==', title)),
    )
    expect(matching.size).toBe(1)
    const item = matching.docs[0]
    await b.run('inbox.read', { ids: [item.id] })
    expect((await getDocFromServer(item.ref)).get('isRead')).toBe(true)
    await b.run('inbox.clear', { ids: [item.id] })
    expect((await getDocFromServer(item.ref)).exists()).toBe(false)
    await staff.run('broadcast.delete', { id: result.id })
    expect((await getDocFromServer(doc(staff.db, 'broadcasts', result.id!))).exists()).toBe(false)
  })
})
