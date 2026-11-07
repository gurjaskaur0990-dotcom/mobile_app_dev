import { useRecord, useRows } from '../platform/live'
import { useApp } from '../platform/context'
import type { Trip } from '../../shared/model'
import type { Entry as LedgerEntry } from '../../shared/ledger'
import { readFlutterTrip, readFlutterExpense, readFlutterContribution } from '../legacy/ledger'

type Raw = Record<string, any> & { id: string }
export type Entry = LedgerEntry & {
  sharedWith?: string[]
  splitRupees?: number
  isEdited?: boolean
  storedTitle?: string
  paidByName?: string
  contributorName?: string
  rupees?: number
}
export type { Trip }

function expense(tripId: string, raw: Raw): Entry {
  return {
    ...readFlutterExpense(tripId, raw.id, raw),
    storedTitle: raw.title,
    splitRupees: typeof raw.splitAmount === 'number' ? raw.splitAmount : 0,
    isEdited: raw.isEdited === true,
    paidByName: raw.paidByName,
    rupees: raw.amount,
  }
}
export function useTrips() {
  const { uid } = useApp()
  const rows = useRows<Raw>(uid ? 'trips' : null, [['memberUids', 'array-contains', uid]])
  return { ...rows, data: rows.data.map((raw) => readFlutterTrip(raw.id, raw)) }
}
export function useTrip(id?: string) {
  const row = useRecord<Raw>(id ? 'trips/' + id : null)
  return { ...row, data: row.data ? readFlutterTrip(row.data.id, row.data) : null }
}
export function useExpense(tripId?: string, entryId?: string) {
  const row = useRecord<Raw>(tripId && entryId ? 'trips/' + tripId + '/expenses/' + entryId : null)
  return { ...row, data: row.data && tripId ? expense(tripId, row.data) : null }
}
export function useExpenses(tripId?: string) {
  const rows = useRows<Raw>(tripId ? 'trips/' + tripId + '/expenses' : null)
  return { ...rows, data: rows.data.map((raw) => expense(tripId!, raw)) }
}
export function useContributions(tripId?: string) {
  const rows = useRows<Raw>(tripId ? 'trips/' + tripId + '/contributions' : null)
  return {
    ...rows,
    data: rows.data.map((raw) => ({
      ...readFlutterContribution(tripId!, raw.id, raw),
      contributorName: raw.contributorName,
      rupees: raw.amount,
    })),
  }
}
