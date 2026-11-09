import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { IonIcon } from '@ionic/react'
import { arrowBackOutline } from 'ionicons/icons'

export function useAction() {
  const working = useRef(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  async function run(task: () => Promise<string | void>) {
    if (working.current) return
    working.current = true
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      setMessage((await task()) || '')
    } catch (error) {
      setFailed(true)
      setMessage(error instanceof Error ? error.message : 'The request failed.')
    } finally {
      working.current = false
      setBusy(false)
    }
  }
  const status = message ? <p role={failed ? 'alert' : 'status'}>{message}</p> : null
  return { busy, run, status }
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const changed = () => setOnline(navigator.onLine)
    window.addEventListener('online', changed)
    window.addEventListener('offline', changed)
    return () => {
      window.removeEventListener('online', changed)
      window.removeEventListener('offline', changed)
    }
  }, [])
  return online
}

export function ReadState({
  state,
  children,
}: {
  state: { loading: boolean; cached: boolean; error: string | null }
  children: ReactNode
}) {
  if (state.error) return <p role="alert">{state.error}</p>
  if (state.loading) return <p role="status">Loading…</p>
  return (
    <>
      {state.cached && <p role="status">Showing a saved copy.</p>}
      {children}
    </>
  )
}
export type Person = {
  uid: string
  displayName: string
  username: string
  email?: string
  suspended?: boolean
}
export function PersonName({ person }: { person: Person }) {
  return (
    <span>
      <strong>{person.displayName}</strong>{' '}
      <small>
        @{person.username}
        {person.email && ` · ${person.email}`}
      </small>
    </span>
  )
}
export function DateText({ value }: { value: number }) {
  if (!value) return <span>Date unknown</span>
  const date = new Date(value)
  return (
    <time dateTime={date.toISOString()}>
      {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
    </time>
  )
}

export function PageHeading({ title, fallback = '/' }: { title: string; fallback?: string }) {
  const navigate = useNavigate()
  return (
    <header className="collaboration-heading">
      <button
        type="button"
        className="secondary"
        aria-label="Back"
        onClick={() => {
          if (window.history.state?.idx > 0) navigate(-1)
          else navigate(fallback)
        }}
      >
        <IonIcon icon={arrowBackOutline} aria-hidden="true" />
      </button>
      <h1>{title}</h1>
    </header>
  )
}
