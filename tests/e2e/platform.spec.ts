import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

const requireFixture = createRequire(
  new URL('../../functions/package.json', import.meta.url),
)
const admin = requireFixture('firebase-admin/app')
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
const app = admin.initializeApp(
  { projectId: 'demo-splittrip-flutter' },
  'platform-browser',
)
const db = requireFixture('firebase-admin/firestore').getFirestore(app)
const accounts = requireFixture('firebase-admin/auth').getAuth(app)

test('opens a shared Flutter hash link after login, saves the theme and switches accounts', async ({
  page,
}) => {
  await page.goto('/#/trip/sample-jaipur/expense/station-breakfast')
  await page.getByRole('button', { name: 'Charu', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Station breakfast', exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL(
    /\/trip\/sample-jaipur\/expense\/station-breakfast$/,
  )
  await page.goto('/settings')
  await page.getByLabel('Theme Mode').selectOption('dark')
  await page.getByRole('button', { name: 'Ocean Blue' }).click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(
    page.getByRole('button', { name: 'Ocean Blue' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Trips', exact: true })
    .click()
  await page
    .getByRole('searchbox', { name: 'Search trips' })
    .fill('Jaipur weekend')
  await expect(
    page.locator('a[href="/trips/sample-jaipur/expenses"]'),
  ).toBeVisible()
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click()
  await page.getByRole('button', { name: 'Administrator', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible()
  await page.goto('/trip/sample-jaipur')
  await expect(page.getByText(/don’t have access/).first()).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Jaipur weekend' }),
  ).toHaveCount(0)
})

test('saves an offline expense across reload and sends it once on reconnect', async ({
  page,
  context,
}) => {
  const { uid } = await accounts.getUserByEmail('charu@example.test')
  const id = randomUUID(),
    name = 'Offline train ' + id.slice(0, 8)
  const trip = db.doc('trips/' + id)
  await trip.set({
    name,
    createdBy: uid,
    memberUids: [uid],
    members: { [uid]: { displayName: 'Charu' } },
    allowEditing: true,
    hasBudget: false,
    totalSpent: 0,
    createdAt: new Date(),
  })
  await page.goto('/trip/' + id + '/add-expense')
  await page.getByRole('button', { name: 'Charu', exact: true }).click()
  await page.getByLabel('Expense title').fill('Train ticket')
  await page.getByLabel('Amount (INR)').fill('82.75')
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByRole('link', { name: /pending sync/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: /pending sync/ })).toBeVisible()
  expect((await trip.collection('expenses').get()).empty).toBe(true)
  await context.setOffline(false)
  await expect(
    page.getByText('Train ticket', { exact: true }).first(),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /pending sync/ })).toHaveCount(0)
  const data = await trip.collection('expenses').get()
  expect(data.size).toBe(1)
  expect(data.docs[0].data()).toMatchObject({
    amount: 82.75,
    splitAmount: 82.75,
    sharedWith: [uid],
    paidBy: uid,
  })
  expect((await trip.get()).get('totalSpent')).toBe(82.75)
})
