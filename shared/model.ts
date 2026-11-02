export type Member = { displayName: string; photoURL?: string }
export interface Profile {
  uid: string
  displayName: string
  username: string
  email: string
  emailVisible: boolean
  photoURL: string
  suspended: boolean
  createdAt: number
  revision: number
}
export interface Trip {
  id: string
  name: string
  ownerId: string
  memberIds: string[]
  members: Record<string, Member>
  budgetEnabled: boolean
  editingEnabled: boolean
  state: 'active' | 'archived' | 'deleted' | 'purging'
  revision: number
  spending: number
  funding: number
  balances: Record<string, number>
  createdAt: number
  deletedAt?: number | null
}
export interface Command {
  originUid?: string
  opId: string
  name: string
  payload: Record<string, any>
  expectedRevision?: number
}
export type Result = { id?: string; pending?: boolean; [key: string]: any }
export interface CommandOptions {
  onlineOnly?: boolean
  expectedRevision?: number
}
