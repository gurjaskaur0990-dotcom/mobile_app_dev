import { useEffect, useRef, useState } from 'react'
import { useApp } from './context'
import { access } from './storage'
export function useDraft<T>(key: string, initial: T): [T, (v: T) => void, () => void] {
  const { uid, trusted } = useApp()
  const scope = JSON.stringify([uid, key, trusted])
  const [saved, set] = useState({ scope, value: initial })
  const latest = useRef(initial)
  latest.current = initial
  const generation = useRef(0)
  useEffect(() => {
    let live = true
    const version = generation.current
    void access<T>(uid, trusted, 'drafts', 'get', key)
      .then((value) => {
        if (live && generation.current === version && value !== undefined) set({ scope, value })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [scope])
  return [
    saved.scope === scope ? saved.value : initial,
    (v) => {
      generation.current++
      set({ scope, value: v })
      void access(uid, trusted, 'drafts', 'set', key, v).catch(() => {})
    },
    () => {
      generation.current++
      set({ scope, value: latest.current })
      void access(uid, trusted, 'drafts', 'delete', key).catch(() => {})
    },
  ]
}
