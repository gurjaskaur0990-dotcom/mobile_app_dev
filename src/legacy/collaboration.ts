import { getAuth, type User } from 'firebase/auth'
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocsFromServer,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import type { Command, Result } from '../../shared/model'
import { adaptProfile, isLegacyAdmin, memberSnapshot } from './account'

function id(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.includes('/') ||
    value === '.' ||
    value === '..'
  )
    throw Error('Invalid record identifier.')
  return value
}
function required(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw Error('Enter the required text.')
  return value.trim()
}
export async function legacyCollaboration(
  db: Firestore,
  user: User,
  input: Command,
): Promise<Result> {
  const { uid } = user,
    { name, payload: p } = input
  if (
    (input.originUid && input.originUid !== uid) ||
    (name === 'invitation.respond' && p.recipientId !== undefined && p.recipientId !== uid)
  )
    throw Error('This response belongs to another account.')
  const own = doc(db, 'users', uid)
  const person = (await getDoc(own)).data()
  if (!person || person.isSuspended) throw Error('Account unavailable.')
  if (
    /^(admin|account|broadcast|announcement)\.|^feedback\.(moderate|delete)/.test(name) &&
    !isLegacyAdmin(user.email)
  )
    throw Error('Administrator access required.')
  if (name === 'member.lookup' || name === 'admin.lookup') {
    const term = required(p.query).toLowerCase()
    const field = term.includes('@') ? 'email' : 'username'
    const result = await getDocsFromServer(
      query(collection(db, 'users'), where(field, '==', term), limit(1)),
    )
    const found = result.docs[0]
    if (!found) return { user: null }
    const target = adaptProfile(found.id, found.data())
    return {
      user: {
        uid: found.id,
        username: target.username,
        displayName: target.displayName,
        ...(target.emailVisible ? { email: target.email } : {}),
        ...(name === 'admin.lookup' ? { suspended: target.suspended } : {}),
      },
    }
  }
  if (name === 'member.invite' || name === 'invitation.respond' || name === 'member.remove') {
    const trip = doc(db, 'trips', id(p.tripId))
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(trip),
        row = snap.data()
      if (getAuth(db.app).currentUser?.uid !== uid) throw Error('This account has signed out.')
      if (!row) throw Error('This trip is unavailable.')
      if (name === 'invitation.respond') {
        if (!(row.pendingMemberUids || []).includes(uid)) return { status: 'resolved' }
        if (p.accept) {
          tx.update(
            trip,
            'pendingMemberUids',
            arrayRemove(uid),
            new FieldPath('pendingMembers', uid),
            deleteField(),
            'memberUids',
            arrayUnion(uid),
            new FieldPath('members', uid),
            memberSnapshot(person),
          )
        } else
          tx.update(
            trip,
            'pendingMemberUids',
            arrayRemove(uid),
            new FieldPath('pendingMembers', uid),
            deleteField(),
          )
        return { id: trip.id, status: p.accept ? 'accepted' : 'declined' }
      }
      if (row.isDeleted || row.isArchived) throw Error('This trip is read-only.')
      if (!row.memberUids?.includes(uid)) throw Error('Membership required.')
      if (name === 'member.remove') {
        const target = id(p.memberId)
        if (row.createdBy !== uid || target === uid)
          throw Error('Only the trip creator may remove another member.')
        tx.update(
          trip,
          'memberUids',
          arrayRemove(target),
          new FieldPath('members', target),
          deleteField(),
        )
      } else {
        const target = id(p.recipientId)
        if (row.memberUids.includes(target)) return { id: trip.id, status: 'member' }
        if (row.pendingMemberUids?.includes(target)) return { id: trip.id, status: 'pending' }
        const account = (await tx.get(doc(db, 'users', target))).data()
        if (!account) throw Error('User not found.')
        tx.update(
          trip,
          'pendingMemberUids',
          arrayUnion(target),
          new FieldPath('pendingMembers', target),
          memberSnapshot(account),
        )
      }
      return { id: trip.id }
    })
  }
  if (name === 'inbox.read' || name === 'inbox.delete' || name === 'inbox.clear') {
    const notifications = collection(own, 'notifications')
    const ids: string[] = (p.ids || []).map(id)
    for (let start = 0; start < ids.length; start += 450) {
      const batch = writeBatch(db)
      for (const entry of ids.slice(start, start + 450)) {
        const ref = doc(notifications, entry)
        if (name === 'inbox.read') batch.update(ref, { isRead: true })
        else batch.delete(ref)
      }
      await batch.commit()
    }
    return { count: ids.length }
  }
  if (name === 'push.register' || name === 'push.unregister') {
    const token = required(p.token)
    await runTransaction(db, async (tx) => {
      const current = (await tx.get(own)).data()
      if (name === 'push.register') tx.update(own, { fcmToken: token })
      else if (current?.fcmToken === token) tx.update(own, { fcmToken: null })
    })
    return {}
  }
  switch (name) {
    case 'account.suspend': {
      const target = id(p.uid)
      if (target === uid) throw Error('Choose another account.')
      await updateDoc(doc(db, 'users', target), { isSuspended: !!p.suspended })
      return { suspended: !!p.suspended }
    }
    case 'announcement.save':
      await setDoc(
        doc(db, 'config', 'announcement'),
        {
          message: String(p.body ?? '').trim(),
          isEnabled: !!p.enabled,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      return {}
    case 'broadcast.send': {
      const ref = doc(collection(db, 'broadcasts'))
      await setDoc(ref, {
        title: required(p.title),
        body: required(p.body),
        createdAt: serverTimestamp(),
        senderUid: uid,
        status: 'pending',
      })
      return { id: ref.id }
    }
    case 'broadcast.delete':
      await deleteDoc(doc(db, 'broadcasts', id(p.id)))
      return {}
    case 'feedback.submit': {
      const ref = doc(collection(db, 'feedback'))
      await setDoc(ref, {
        userId: uid,
        userEmail: person.email || '',
        userDisplayName: person.displayName || 'Anonymous',
        type: ['bug', 'feature'].includes(p.category) ? p.category : 'feedback',
        message: required(p.body),
        createdAt: serverTimestamp(),
        status: 'open',
        adminNotes: '',
      })
      return { id: ref.id }
    }
    case 'feedback.moderate':
      if (!['open', 'in_progress', 'resolved'].includes(p.status))
        throw Error('Select a feedback status.')
      await updateDoc(doc(db, 'feedback', id(p.id)), {
        status: p.status,
        adminNotes: String(p.notes || ''),
        updatedAt: serverTimestamp(),
      })
      return {}
    case 'feedback.delete':
      await deleteDoc(doc(db, 'feedback', id(p.id)))
      return {}
    default:
      throw Error('Unsupported collaboration action.')
  }
}
