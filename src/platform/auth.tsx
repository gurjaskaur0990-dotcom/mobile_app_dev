import { useState, useEffect, type ReactNode } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithCredential,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db, emulator } from './firebase'
import { native, getNativeGoogleIdToken, signOutNative } from './native'
import { access, clearMemory, isTrusted } from './storage'
import { SessionContext } from './context'
import { useOutbox } from './outbox'
import { useUpdate } from './update'
import {
  ensureLegacyProfile,
  adaptProfile,
  isLegacyAdmin,
} from '../legacy/account'
import {
  releasePush,
  syncPushBinding,
  attachNativePush,
} from '../collaboration/push'
import type { Profile } from '../../shared/model'

function Login() {
  const update = useUpdate()
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function login(name?: string) {
    setBusy(true)
    setError('')
    try {
      if (emulator && name) {
        const email =
          name === 'Administrator'
            ? 'officiallanshsharma@gmail.com'
            : name.toLowerCase() + '@example.test'
        await signInWithCredential(
          auth,
          GoogleAuthProvider.credential(
            JSON.stringify({
              sub: 'local-' + name,
              name,
              email,
              email_verified: true,
            }),
          ),
        )
      } else if (native) {
        await signInWithCredential(
          auth,
          GoogleAuthProvider.credential(await getNativeGoogleIdToken()),
        )
      } else await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (e) {
      if (native) setError((e as Error).message)
      else {
        const code = (e as { code?: string } | null)?.code
        const messages: Record<string, string> = {
          'auth/popup-closed-by-user': 'Google sign-in ended before your account opened. Please try again.',
          'auth/cancelled-popup-request': 'Please try signing in again.',
          'auth/popup-blocked': 'Allow popups for SplitTrip in your browser, then try again.',
          'auth/network-request-failed': 'Check your internet connection, then try signing in again.',
          'auth/unauthorized-domain': 'Firebase has not enabled Google sign-in for this address.',
        }
        setError((code && messages[code]) || 'Google sign-in could not finish. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="flutter-login">
      <div className="login-identity">
        <img src="/flutter/logo.png" alt="" />
        <h1>SplitTrip</h1>
        <p>
          Split expenses with friends,
          <br />
          effortlessly.
        </p>
      </div>
      <div className="login-controls">
        <button className="button" disabled={busy} onClick={() => void login()}>
          {busy ? 'Signing in…' : 'Sign in with Google'}
        </button>
        {emulator && (
          <fieldset>
            <legend>Local demo accounts</legend>
            {['Asha', 'Bharat', 'Charu', 'Administrator'].map((name) => (
              <button
                key={name}
                disabled={busy}
                onClick={() => void login(name)}
              >
                {name}
              </button>
            ))}
          </fieldset>
        )}
        {error && <p role="alert">{error}</p>}
        {update.ready && (
          <button disabled={busy} onClick={update.activate}>Reload to update SplitTrip</button>
        )}
      </div>
    </main>
  )
}
function Account({ user, children }: { user: User; children: ReactNode }) {
  const uid = user.uid,
    trusted = isTrusted(uid)
  const [profile, setProfile] = useState<Profile | null>(null),
    [error, setError] = useState(''),
    [attempt, retry] = useState(0)
  const outbox = useOutbox(uid, trusted)
  useEffect(() => {
    let active = true,
      verified = false
    const ref = doc(db, 'users', uid)
    void access<Profile>(uid, trusted, 'records', 'get', 'profile')
      .then((p) => {
        if (active && !verified && p) setProfile(p)
      })
      .catch(() => {})
    const refresh = () => {
      if (navigator.onLine)
        void ensureLegacyProfile(db, user).catch((e) => {
          if (active && !verified) setError(e.message)
        })
    }
    const unsubscribe = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!active || !snapshot.exists() || snapshot.metadata.fromCache) return
        const value = adaptProfile(uid, snapshot.data())
        verified = true
        setProfile(value)
        setError('')
        if (value.suspended) void access(uid, trusted, 'records', 'clear', '')
        void access(uid, trusted, 'records', 'set', 'profile', value).catch(
          () => {},
        )
      },
      (e) => {
        if (active) {
          setProfile(null)
          setError(e.message)
        }
      },
    )
    refresh()
    window.addEventListener('online', refresh)
    return () => {
      active = false
      unsubscribe()
      window.removeEventListener('online', refresh)
    }
  }, [user, uid, trusted, attempt])
  useEffect(() => {
    if (!profile || profile.suspended) return
    const remove = attachNativePush(uid, outbox.command)
    let active = true
    if (navigator.onLine)
      void import('../legacy/ledger')
        .then((m) => {
          if (active && auth.currentUser?.uid === uid)
            return m.purgeExpiredFlutterItems(uid)
        })
        .catch(() => {})
    return () => {
      active = false
      remove?.()
    }
  }, [uid, !!profile, profile?.suspended])
  async function logout() {
    await releasePush(outbox.command).catch(() => {})
    if (native) await signOutNative().catch(() => {})
    await signOut(auth)
    clearMemory(uid)
  }
  if (profile?.suspended)
    return (
      <main className="status-screen">
        <h1>Account Suspended</h1>
        <p>
          Your account has been suspended by the administrator. Contact{' '}
          <a href="mailto:officiallanshsharma@gmail.com">SplitTrip support</a>{' '}
          for help.
        </p>
        <button onClick={() => void logout()}>Sign Out</button>
      </main>
    )
  if (!profile || error)
    return (
      <main className="status-screen">
        <h1>
          {error
            ? 'Unable to open your account'
            : navigator.onLine
              ? 'Opening your account…'
              : 'You are offline'}
        </h1>
        <p role="status">{error}</p>
        {error && (
          <button
            onClick={() => {
              setError('')
              retry((n) => n + 1)
            }}
          >
            Retry
          </button>
        )}
        <button onClick={() => void logout()}>Sign Out</button>
      </main>
    )
  return (
    <SessionContext.Provider
      value={{
        uid,
        profile,
        admin: isLegacyAdmin(user.email),
        trusted,
        logout,
        ...outbox,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}
export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        syncPushBinding(u?.uid ?? null)
        setUser(u)
      }),
    [],
  )
  if (user === undefined)
    return <main className="status-screen">Opening SplitTrip…</main>
  if (!user) return <Login />
  return (
    <Account key={user.uid} user={user}>
      {children}
    </Account>
  )
}
