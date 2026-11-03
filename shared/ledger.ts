interface EntryBase {
  id: string
  tripId: string
  amount: number
  authorId: string
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface ExpenseEntry extends EntryBase {
  type: 'expense'
  title: string
  payerId: string
  participantIds: string[]
  shares: Record<string, number>
}

export interface RepaymentEntry extends EntryBase {
  type: 'repayment'
  debtorId: string
  creditorId: string
}

export interface ContributionEntry extends EntryBase {
  type: 'contribution'
  contributorId: string
}

export type Entry = ExpenseEntry | RepaymentEntry | ContributionEntry
export interface Transfer {
  debtorId: string
  creditorId: string
  amount: number
}
