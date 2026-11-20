import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

const requireFunctions = createRequire(
  new URL('../../functions/package.json', import.meta.url),
)
const admin = requireFunctions('firebase-admin/app')
const firestore = requireFunctions('firebase-admin/firestore')
const adminAuth = requireFunctions('firebase-admin/auth')
const projectId = 'demo-splittrip-flutter'
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
const app =
  admin.getApps().find((a: { name: string }) => a.name === 'cache-browser') ||
  admin.initializeApp({ projectId }, 'cache-browser')
const db = firestore.getFirestore(app)

async function trust(page: Page) {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Bharat', exact: true }).click()
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true)
  return (await adminAuth.getAuth(app).getUserByEmail('bharat@example.test'))
    .uid as string
}
async function trip(uid: string) {
  const id = randomUUID(),
    name = 'Cache trip ' + id.slice(0, 8)
  const ref = db.collection('trips').doc(id)
  await ref.set({
    id,
    name,
    createdBy: 'test-owner',
    memberUids: ['test-owner', uid],
    members: {
      'test-owner': { displayName: 'Test owner' },
      [uid]: { displayName: 'Bharat' },
    },
    pendingMemberUids: [],
    totalBudget: 0,
    totalSpent: 0,
    hasBudget: false,
    allowEditing: true,
    createdAt: new Date(),
  })
  return { id, name, ref, path: `/trips/${id}/expenses` }
}
test('retains permitted offline pages and evicts a trip when confirmed membership is removed', async ({
  page,
  context,
}) => {
  const uid = await trust(page)
  const [allowed, removed] = await Promise.all([trip(uid), trip(uid)])
  for (const t of [allowed, removed]) {
    await page.goto(t.path)
    await expect(
      page.getByRole('heading', { name: t.name, exact: true }),
    ).toBeVisible()
    // The cache has committed before moving to the next route.
    await expect
      .poll(() =>
        page.evaluate(
          async ({ uid, id }) => {
            const db = await new Promise<IDBDatabase>((res, rej) => {
              const r = indexedDB.open('splittrip.flutter.v1.' + uid)
              r.onsuccess = () => res(r.result)
              r.onerror = () => rej(r.error)
            })
            try {
              return await new Promise<boolean>((res) => {
                const r = db
                  .transaction('records')
                  .objectStore('records')
                  .getAllKeys()
                r.onsuccess = () =>
                  res(r.result.some((k) => String(k).includes('trips/' + id)))
              })
            } finally {
              db.close()
            }
          },
          { uid, id: t.id },
        ),
      )
      .toBe(true)
  }
  await page.goto('/trips/' + randomUUID() + '/expenses')
  await expect(page.getByText(/don’t have access/)).toBeVisible()
  await page.goto('/')
  await expect(
    page.getByRole('link', { name: new RegExp(removed.name) }),
  ).toBeVisible()
  await removed.ref.update({ memberUids: ['test-owner'] })
  await expect(
    page.getByRole('link', { name: new RegExp(removed.name) }),
  ).toHaveCount(0)
  await context.setOffline(true)
  await page.goto(removed.path)
  await expect(
    page.getByText(/don’t have access|not been saved/).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: removed.name, exact: true }),
  ).toHaveCount(0)
  await page.goto(allowed.path)
  await expect(
    page.getByRole('heading', { name: allowed.name, exact: true }),
  ).toBeVisible()
})
