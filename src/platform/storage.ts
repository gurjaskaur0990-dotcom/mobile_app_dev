import type { Command } from '../../shared/model'
import { scopedName } from './environment'

// Separate physical databases prevent a query or draft key from resolving to another account.
export function trustKey(uid: string) {
  return scopedName('splittrip.flutter.trust.' + uid)
}
export function isTrusted(uid: string) {
  try {
    return localStorage.getItem(trustKey(uid)) !== 'no'
  } catch {
    return false
  }
}
// Web Locks coordinate the durable queue and storage preferences across same-origin tabs.
export function queueLockName(uid: string) {
  return scopedName('splittrip.queue.' + uid)
}
export function accountLock<T>(uid: string, work: () => Promise<T>) {
  return navigator.locks.request(queueLockName(uid), work)
}
interface Stores {
  [name: string]: Map<string, any>
}
const memory = new Map<string, Stores>()
const connections = new Map<string, Promise<IDBDatabase>>()
function store(uid: string, name: string) {
  if (!memory.has(uid)) memory.set(uid, {})
  const stores = memory.get(uid)!
  return (stores[name] ||= new Map())
}
function open(uid: string) {
  let connection = connections.get(uid)
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(scopedName('splittrip.flutter.v1.' + uid), 1)
      req.onupgradeneeded = () => {
        for (const s of ['records', 'drafts', 'queue'])
          req.result.createObjectStore(s)
      }
      req.onsuccess = () => {
        const db = req.result
        db.onversionchange = () => {
          db.close()
          connections.delete(uid)
        }
        resolve(db)
      }
      req.onerror = () => {
        connections.delete(uid)
        reject(req.error)
      }
    })
    connections.set(uid, connection)
  }
  return connection
}
export async function access<T>(
  uid: string,
  trusted: boolean,
  name: string,
  mode: 'get' | 'set' | 'delete' | 'list' | 'keys' | 'clear',
  key: string,
  value?: unknown,
): Promise<T> {
  if (!trusted) {
    const s = store(uid, name)
    if (mode === 'list') return [...s.values()] as T
    if (mode === 'keys') return [...s.keys()] as T
    if (mode === 'get') return s.get(key)
    if (mode === 'set') s.set(key, value)
    if (mode === 'delete') s.delete(key)
    if (mode === 'clear') s.clear()
    return undefined as T
  }
  if (!isTrusted(uid)) throw Error('Device storage mode changed. Try again.')
  const db = await open(uid)
  if (!isTrusted(uid)) throw Error('Device storage mode changed. Try again.')
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      name,
      mode === 'get' || mode === 'list' || mode === 'keys'
        ? 'readonly'
        : 'readwrite',
    )
    const s = tx.objectStore(name)
    const r =
      mode === 'get'
        ? s.get(key)
        : mode === 'set'
          ? s.put(value, key)
          : mode === 'delete'
            ? s.delete(key)
            : mode === 'clear'
              ? s.clear()
              : mode === 'keys'
                ? s.getAllKeys()
                : s.getAll()
    tx.oncomplete = () => resolve(r.result as T)
    tx.onabort = () =>
      reject(tx.error || Error('Browser storage is unavailable.'))
    tx.onerror = () => reject(tx.error)
  })
}
export async function forget(uid: string) {
  localStorage.removeItem(trustKey(uid))
  memory.delete(uid)
  const db = await connections.get(uid)
  db?.close()
  connections.delete(uid)
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(scopedName('splittrip.flutter.v1.' + uid))
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
  })
}
export function clearMemory(uid: string) {
  memory.delete(uid)
}
export type Queued = Command & { order: number; error?: string; code?: string }

// A second shared-mode tab can have its own in-memory edits when this device becomes trusted.
export async function promoteMemory(uid: string) {
  const stores = memory.get(uid)
  if (!stores || !isTrusted(uid)) return
  for (const [name, rows] of Object.entries(stores)) {
    for (const [key, value] of rows) {
      let target = key
      if (name === 'records' && key.startsWith('[')) {
        const parsed = JSON.parse(key)
        parsed[4] = true
        target = JSON.stringify(parsed)
      }
      // A server-confirmed durable copy may be newer than another tab's shared copy.
      if (
        name === 'records' &&
        (await access(uid, true, name, 'get', target)) !== undefined
      )
        continue
      await access(uid, true, name, 'set', target, value)
    }
  }
  memory.delete(uid)
}
