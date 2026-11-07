import { useEffect, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit as limitRows,
  type WhereFilterOp,
} from 'firebase/firestore'
import { auth, db } from './firebase'
import { useApp } from './context'
import { access, isTrusted } from './storage'
import { scopedName } from './environment'
type ReadOptions = { orderBy?: [string, 'asc' | 'desc']; limit?: number }
type Filter = [string, WhereFilterOp, any]
type State<T> = {
  data: T
  loading: boolean
  error: string | null
  cached: boolean
}

function tripScope(path: string, filters: Filter[]): string | undefined {
  if (path.startsWith('trips/')) return path.split('/')[1]
  if (path === 'invitations')
    return filters.find((f) => f[0] === 'tripId' && f[1] === '==')?.[2]
}
function cachedScope(key: string) {
  if (!key.startsWith('[')) return
  const [, path, , filters] = JSON.parse(key)
  return path
    ? { path, tripId: tripScope(path, JSON.parse(filters)) }
    : undefined
}
function withCacheLock<T>(uid: string, work: () => Promise<T>) {
  return navigator.locks.request(scopedName('splittrip.records.' + uid), work)
}
const denialKey = (id: string) => 'deniedTrip/' + id
const deniedMessage = 'Permission denied for this trip.'
const invalidationEvent = scopedName('splittrip-record-access')
const invalidationChannel =
  typeof BroadcastChannel === 'undefined'
    ? null
    : new BroadcastChannel(invalidationEvent)
function announce(uid: string, ids: string[]) {
  if (!ids.length) return
  const detail = { uid, ids }
  window.dispatchEvent(new CustomEvent(invalidationEvent, { detail }))
  invalidationChannel?.postMessage(detail)
}

async function invalidate(
  uid: string,
  trusted: boolean,
  keys: string[],
  removed: Set<string>,
) {
  if (!removed.size) return
  await Promise.all(
    [...removed].map((id) =>
      access(uid, trusted, 'records', 'set', denialKey(id), true),
    ),
  )
  for (const key of keys) {
    const scope = cachedScope(key)
    if (scope?.tripId && removed.has(scope.tripId))
      await access(uid, trusted, 'records', 'delete', key)
    if (scope?.path === 'trips') {
      const rows = await access<{ id: string }[] | undefined>(
        uid,
        trusted,
        'records',
        'get',
        key,
      )
      if (rows?.some((row) => removed.has(row.id)))
        await access(
          uid,
          trusted,
          'records',
          'set',
          key,
          rows.filter((row) => !removed.has(row.id)),
        )
    }
  }
  announce(uid, [...removed])
}

function useLive<T>(
  path: string | null,
  list: boolean,
  filters: Filter[],
  empty: T,
  config: ReadOptions = {},
): State<T> {
  const { uid, trusted } = useApp()
  const spec = JSON.stringify(filters)
  const key = JSON.stringify([uid, path, list, spec, trusted, config])
  const initial = { data: empty, loading: !!path, error: null, cached: false }
  const [snap, set] = useState<State<T> & { key: string }>({ ...initial, key })
  useEffect(() => {
    if (!path) return
    let current = true,
      confirmed = false,
      sequence = 0
    const rules = JSON.parse(spec) as Filter[]
    const tripId = tripScope(path, rules)
    const fullMembership =
      path === 'trips' &&
      rules.length === 1 &&
      rules[0][0] === 'memberUids' &&
      !config.limit &&
      rules[0][1] === 'array-contains' &&
      rules[0][2] === uid
    const sameAccount = () =>
      auth.currentUser?.uid === uid && isTrusted(uid) === trusted
    const show = (value: State<T>) => {
      if (current) set({ ...value, key })
    }
    const loadCache = async () => {
      const version = sequence
      if (confirmed) return
      try {
        const value = await withCacheLock(uid, async () => {
          if (
            tripId &&
            (await access(uid, trusted, 'records', 'get', denialKey(tripId)))
          )
            return { denied: true, data: undefined }
          return {
            denied: false,
            data: await access<T | undefined>(
              uid,
              trusted,
              'records',
              'get',
              key,
            ),
          }
        })
        if (confirmed || version !== sequence) return
        if (value.denied)
          show({
            data: empty,
            loading: false,
            cached: false,
            error: deniedMessage,
          })
        else if (value.data !== undefined)
          show({ data: value.data, loading: false, cached: true, error: null })
        else if (!navigator.onLine)
          show({
            data: empty,
            loading: false,
            cached: true,
            error: 'This page has not been saved on this device.',
          })
      } catch {
        /* A changed storage preference invalidates the old subscription. */
      }
    }
    // Allow normal online reads to establish access before displaying a saved copy.
    const timer = window.setTimeout(
      () => void loadCache(),
      navigator.onLine ? 1800 : 0,
    )
    const receive = (data: T, fromCache: boolean) => {
      if (!current) return
      if (fromCache) {
        if (confirmed)
          set((old) => (old.key === key ? { ...old, cached: true } : old))
        return
      }
      confirmed = true
      sequence++
      show({ data, loading: false, cached: false, error: null })
      void withCacheLock(uid, async () => {
        if (!sameAccount()) return
        if (fullMembership) {
          const ids = new Set((data as { id: string }[]).map((r) => r.id))
          const keys = await access<string[]>(
            uid,
            trusted,
            'records',
            'keys',
            '',
          )
          const removed = new Set<string>()
          for (const saved of keys) {
            const scoped = cachedScope(saved)?.tripId
            if (scoped && !ids.has(scoped)) removed.add(scoped)
            if (
              saved.startsWith('deniedTrip/') &&
              ids.has(saved.slice('deniedTrip/'.length))
            )
              await access(uid, trusted, 'records', 'delete', saved)
          }
          await invalidate(uid, trusted, keys, removed)
        } else if (tripId) {
          await access(uid, trusted, 'records', 'delete', denialKey(tripId))
        }
        if (sameAccount())
          await access(uid, trusted, 'records', 'set', key, data)
      }).catch(() => {})
    }
    const fail = (error: Error & { code?: string }) => {
      if (!current) return
      if (error.code === 'unavailable' || error.code === 'deadline-exceeded') {
        confirmed = false
        void loadCache()
        return
      }
      confirmed = true
      sequence++
      show({
        data: empty,
        loading: false,
        cached: false,
        error:
          error.code === 'permission-denied'
            ? 'Permission denied.'
            : error.message,
      })
      void withCacheLock(uid, async () => {
        if (!sameAccount()) return
        if (error.code === 'permission-denied' && tripId) {
          await invalidate(
            uid,
            trusted,
            await access<string[]>(uid, trusted, 'records', 'keys', ''),
            new Set([tripId]),
          )
        } else {
          await access(uid, trusted, 'records', 'delete', key)
        }
      }).catch(() => {})
    }
    const revoked = (event: { uid: string; ids: string[] }) => {
      if (
        current &&
        tripId &&
        event.uid === uid &&
        event.ids.includes(tripId)
      ) {
        sequence++
        show({
          data: empty,
          loading: false,
          cached: false,
          error: deniedMessage,
        })
      }
    }
    const local = (e: Event) => revoked((e as CustomEvent).detail)
    const remote = (e: MessageEvent) => revoked(e.data)
    window.addEventListener(invalidationEvent, local)
    invalidationChannel?.addEventListener('message', remote)
    const options = { includeMetadataChanges: true }
    const unsubscribe = list
      ? onSnapshot(
          query(
            collection(db, path),
            ...rules.map((f) => where(...f)),
            ...(config.orderBy ? [orderBy(...config.orderBy)] : []),
            ...(config.limit ? [limitRows(config.limit)] : []),
          ),
          options,
          (s) =>
            receive(
              s.docs.map((d) => ({ ...d.data(), id: d.id })) as T,
              s.metadata.fromCache,
            ),
          fail,
        )
      : onSnapshot(
          doc(db, path),
          options,
          (s) =>
            receive(
              (s.exists() ? { ...s.data(), id: s.id } : null) as T,
              s.metadata.fromCache,
            ),
          fail,
        )
    const offline = () => {
      if (confirmed)
        set((old) => (old.key === key ? { ...old, cached: true } : old))
      else void loadCache()
    }
    window.addEventListener('offline', offline)
    return () => {
      current = false
      unsubscribe()
      window.clearTimeout(timer)
      window.removeEventListener('offline', offline)
      window.removeEventListener(invalidationEvent, local)
      invalidationChannel?.removeEventListener('message', remote)
    }
  }, [key])
  return snap.key === key ? snap : initial
}
export function useRecord<T>(path: string | null) {
  return useLive<T | null>(path, false, [], null)
}
export function useRows<T>(
  path: string | null,
  filters: Filter[] = [],
  config: ReadOptions = {},
) {
  return useLive<T[]>(path, true, filters, [], config)
}
