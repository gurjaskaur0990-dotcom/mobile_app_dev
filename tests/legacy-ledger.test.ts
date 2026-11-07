import { describe, expect, it } from 'vitest'
import { advance, dinner, legacyTrip, paid } from './fixtures/legacy-trip'
import {
  calculateFlutterLedger,
  flutterTransfers,
  readFlutterTrip,
  readFlutterExpense,
  readFlutterContribution,
} from '../src/legacy/ledger'

const trip = readFlutterTrip('jaipur', legacyTrip)
const expense = readFlutterExpense('jaipur', 'dinner', dinner)
const contributed = readFlutterContribution('jaipur', 'advance', advance)
const settlement = readFlutterExpense('jaipur', 'payment', paid)

describe('Flutter monetary and historical display contracts', () => {
  it('decodes major-currency amounts and native timestamp fields', () => {
    expect(trip).toMatchObject({
      ownerId: 'asha',
      spending: 12000,
      funding: 6000,
      createdAt: 1700000000000,
    })
    expect(expense).toMatchObject({
      type: 'expense',
      payerId: 'asha',
      amount: 12000,
      shares: { asha: 4000, bharat: 4000, charu: 4000 },
    })
    expect(readFlutterTrip('old', { createdBy: 'a' })).toMatchObject({
      state: 'active',
      budgetEnabled: false,
      editingEnabled: true,
    })
    const { isSettlement: _, ...older } = paid
    expect(readFlutterExpense('jaipur', 'historic', older).type).toBe('repayment')
    expect(readFlutterExpense('jaipur', 'historic', { ...older, isSettlement: false }).type).toBe(
      'expense',
    )
  })
  it('includes budget advances in personal debt and generates separate budget settlements', () => {
    const base = calculateFlutterLedger(trip, [expense, contributed])
    expect(base.balances).toEqual({ asha: 6000, bharat: 0, charu: -6000 })
    expect(base.transfers).toEqual([{ debtorId: 'charu', creditorId: 'asha', amount: 6000 }])
    expect(base.budgetBalances).toEqual({ asha: -4000, bharat: 2000, charu: -4000 })
    expect(calculateFlutterLedger(trip, [expense, contributed, settlement])).toMatchObject({
      spending: 12000,
      funding: 6000,
      balances: { asha: 0, bharat: 0, charu: 0 },
      transfers: [],
    })
  })
  it('rounds balances after summation and uses equal shares without assigning remainder pennies', () => {
    const hundred = readFlutterExpense('jaipur', '100', {
      ...dinner,
      amount: 100,
      splitAmount: 100 / 3,
    })
    expect(calculateFlutterLedger(trip, [hundred]).balances).toEqual({
      asha: 6667,
      bharat: -3333,
      charu: -3333,
    })
    const cent = readFlutterExpense('jaipur', 'cent', {
      ...dinner,
      amount: 0.01,
      splitAmount: 0.01 / 3,
    })
    expect(calculateFlutterLedger(trip, [cent, cent, cent]).balances).toEqual({
      asha: 2,
      bharat: -1,
      charu: -1,
    })
    expect(flutterTransfers({ a: 1, b: -1 })).toEqual([])
  })
  it('ignores deleted records and uses payer as the author for old expense permissions', () => {
    const old = readFlutterExpense('jaipur', 'old', {
      ...dinner,
      createdBy: '',
      isDeleted: true,
      deletedAt: null,
    })
    expect(old.authorId).toBe('asha')
    expect(calculateFlutterLedger(trip, [old]).spending).toBe(0)
  })
})
