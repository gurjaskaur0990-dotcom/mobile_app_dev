// The same document keys and major-currency values that the Flutter app writes.
export const legacyTrip = {
  name: 'Jaipur',
  createdBy: 'asha',
  memberUids: ['asha', 'bharat', 'charu'],
  members: Object.fromEntries(
    ['asha', 'bharat', 'charu'].map((id) => [
      id,
      {
        displayName: id,
        email: id + '@example.test',
        username: id,
        photoURL: '',
        hideEmail: false,
      },
    ]),
  ),
  hasBudget: true,
  allowEditing: true,
  totalSpent: 120,
  totalBudget: 60,
  createdAt: { seconds: 1700000000, nanoseconds: 0 },
}
export const dinner = {
  title: 'Dinner',
  amount: 120,
  paidBy: 'asha',
  paidByName: 'Asha',
  sharedWith: ['asha', 'bharat', 'charu'],
  splitAmount: 40,
  createdBy: 'asha',
  tripId: 'jaipur',
  tripName: 'Jaipur',
  isSettlement: false,
  createdAt: legacyTrip.createdAt,
  isEdited: false,
  isDeleted: false,
  editedAt: null,
  deletedAt: null,
}
export const advance = {
  contributorUid: 'bharat',
  contributorName: 'Bharat',
  amount: 60,
  createdBy: 'bharat',
  createdAt: legacyTrip.createdAt,
  isDeleted: false,
  deletedAt: null,
}
export const paid = {
  ...dinner,
  title: 'Settlement: Charu to Asha',
  paidBy: 'charu',
  paidByName: 'Charu',
  amount: 60,
  sharedWith: ['asha'],
  splitAmount: 60,
  isSettlement: true,
}
