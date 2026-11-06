import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommandOptions, Result } from '../../shared/model'
import { access, accountLock, isTrusted, queueLockName, type Queued } from './storage'
import { auth, send } from './firebase'

const transient = (e: any) =>
  [
    'unavailable',
    'deadline-exceeded',
    'functions/unavailable',
    'functions/deadline-exceeded',
    'functions/cancelled',
    'functions/internal',
    'functions/unknown',
    'auth/network-request-failed',
  ].includes(e?.code)
export function useOutbox(uid: string, trusted: boolean) {
  const [queue, setQueue] = useState<Queued[]>([])
  const active = useRef(true)
  const scope = useRef(trusted)
  scope.current = trusted
  const owns = useCallback(
    () =>
      active.current &&
      auth.currentUser?.uid === uid &&
      scope.current === trusted &&
      isTrusted(uid) === trusted,
    [uid, trusted],
  )
  const rows = useCallback(
    async () =>
      (await access<Queued[]>(uid, trusted, 'queue', 'list', '')).sort(
        (a, b) => a.order - b.order || a.opId.localeCompare(b.opId),
      ),
    [uid, trusted],
  )
  const refresh = useCallback(async () => {
    if (owns()) {
      const items = await rows()
      if (owns()) setQueue(items)
    }
  }, [rows, owns])
  const put = (item: Queued) =>
    access(uid, trusted, 'queue', 'set', item.opId, item)
  const drop = (id: string) => access(uid, trusted, 'queue', 'delete', id)
  const requireOwner = () => {
    if (!owns())
      throw Error('This session or device storage mode changed. Try again.')
  }

  // The caller holds the account lock until the server result and its local receipt are applied.
  const drain = useCallback(
    async (wanted?: string): Promise<Result> => {
      if (!navigator.onLine || !owns()) return { pending: true }
      for (const item of await rows()) {
        if (!owns() || !navigator.onLine || item.error) break
        try {
          const result = await send(
            {
              name: item.name,
              payload: item.payload,
              opId: item.opId,
              ...(item.expectedRevision === undefined
                ? {}
                : { expectedRevision: item.expectedRevision }),
            },
            uid,
          )
          await drop(item.opId)
          if (item.opId === wanted) return result
        } catch (error: any) {
          if (!navigator.onLine || transient(error) || !owns()) break
          await put({
            ...item,
            error: error.message || 'Review this change.',
            code: String(error.code || ''),
          })
          if (item.opId === wanted) throw error
          break
        }
      }
      return { pending: true }
    },
    [uid, trusted, owns, rows],
  )
  const flush = useCallback(async () => {
    if (!owns()) return
    // An active tab handles replay. Others immediately reload the current queue.
    await navigator.locks.request(
      queueLockName(uid),
      { ifAvailable: true },
      async (lock) => {
        if (lock && owns()) await drain()
      },
    )
    await refresh()
  }, [uid, owns, drain, refresh])
  useEffect(() => {
    active.current = true
    const run = () => {
      void flush().catch(() => {})
    }
    run()
    window.addEventListener('online', run)
    const timer = window.setInterval(run, 3000)
    return () => {
      active.current = false
      window.removeEventListener('online', run)
      clearInterval(timer)
    }
  }, [flush])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    if (queue.length && !trusted) window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [queue.length, trusted])
  async function command(
    name: string,
    payload: Record<string, any>,
    options: CommandOptions = {},
  ): Promise<Result> {
    requireOwner()
    const input = {
      opId: crypto.randomUUID(),
      name,
      payload,
      ...(options.expectedRevision === undefined
        ? {}
        : { expectedRevision: options.expectedRevision }),
    }
    if (
      options.onlineOnly ||
      !(
        /^(trip|entry)\./.test(name) ||
        name === 'invitation.respond' ||
        name === 'member.remove'
      )
    ) {
      if (!navigator.onLine) throw Error('Connect to the internet to continue.')
      return send(input, uid)
    }
    try {
      const result = await accountLock(uid, async () => {
        requireOwner()
        const items = await rows()
        const order = Math.max(
          Date.now() * 1000,
          (items.at(-1)?.order || 0) + 1,
        )
        await put({ ...input, order })
        await refresh()
        return drain(input.opId)
      })
      return result.pending
        ? { ...result, id: payload.entryId || payload.tripId }
        : result
    } finally {
      await refresh()
    }
  }
  async function retry(item: Queued, revision?: number) {
    try {
      await accountLock(uid, async () => {
        requireOwner()
        const current = await access<Queued | undefined>(
          uid,
          trusted,
          'queue',
          'get',
          item.opId,
        )
        if (!current) return
        const next = { ...current }
        delete next.error
        delete next.code
        if (revision !== undefined) next.expectedRevision = revision
        await put(next)
        await drain(item.opId)
      })
    } finally {
      await refresh()
    }
  }
  async function discard(item: Queued) {
    try {
      await accountLock(uid, async () => {
        requireOwner()
        await drop(item.opId)
        await drain()
      })
    } finally {
      await refresh()
    }
  }
  return { queue, command, retry, discard }
}
