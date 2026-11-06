import { createContext, useContext } from 'react'
import type { CommandOptions, Profile, Result } from '../../shared/model'
import type { Queued } from './storage'

export interface AppSession {
  uid: string
  profile: Profile
  admin: boolean
  trusted: boolean
  command: (name: string, payload: Record<string, any>, options?: CommandOptions) => Promise<Result>
  queue: Queued[]
  retry: (item: Queued, revision?: number) => Promise<void>
  discard: (item: Queued) => Promise<void>
  logout: () => Promise<void>
}
export const SessionContext = createContext<AppSession | null>(null)
export function useApp() {
  const value = useContext(SessionContext)
  if (!value) throw Error('An active session is required')
  return value
}
