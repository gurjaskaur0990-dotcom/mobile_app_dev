import { randomUUID } from 'node:crypto'
import { test, expect, type BrowserContext } from '@playwright/test'
import { initializeApp, deleteApp } from 'firebase/app'
import {
  connectAuthEmulator,
  getAuth,
  signInWithCredential,
  GoogleAuthProvider,
} from 'firebase/auth'
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'

async function traveler(context: BrowserContext, administrator = false) {
  const id = 'traveler-' + randomUUID(),
    email = administrator ? 'officiallanshsharma@gmail.com' : id + '@example.test'
  const app = initializeApp({ projectId: 'demo-splittrip-flutter', apiKey: 'demo-key' }, id)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const { user } = await signInWithCredential(
    auth,
    GoogleAuthProvider.credential(
      JSON.stringify({
        sub: administrator ? 'local-Administrator' : id,
        email,
        email_verified: true,
        name: administrator ? 'Administrator' : 'Travel companion',
      }),
    ),
  )
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  await context.addInitScript(
    (saved) => {
      if (sessionStorage.getItem('fixtureSessionReady')) return
      sessionStorage.setItem('firebase:authUser:demo-key:splittrip-flutter-client', saved)
      sessionStorage.setItem('fixtureSessionReady', 'yes')
    },
    JSON.stringify({ ...user.toJSON(), appName: 'splittrip-flutter-client' }),
  )
  return { email, profile: doc(db, 'users', user.uid), app }
}

test('edits a Flutter profile and moderates feedback, notifications and accounts across sessions', async ({
  browser,
  context,
  page,
}) => {
  const subject = 'Train update ' + randomUUID()
  const message = 'Feedback ' + randomUUID()
  const fixture = await traveler(context)
  const moderator = await browser.newContext({
    baseURL: 'http://127.0.0.1:4175',
    viewport: page.viewportSize() || undefined,
  })
  try {
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Edit display name', exact: true }).click()
    await page.getByLabel('Display name', { exact: true }).fill('Trip companion')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Profile updated.')).toBeVisible()
    await page.getByRole('checkbox', { name: /Hide email/ }).click()
    await expect
      .poll(async () => (await getDocFromServer(fixture.profile)).get('hideEmail'))
      .toBe(true)
    await page.getByRole('button', { name: /Submit feedback \/ bug report/i }).click()
    await page.getByLabel('Message', { exact: true }).fill(message)
    await page.getByRole('button', { name: 'Submit feedback', exact: true }).click()
    await expect(page.getByText('Feedback received.')).toBeVisible()
    // The original Functions worker includes non-null registrations. Empty means no FCM network call.
    await setDoc(fixture.profile, { fcmToken: '' }, { merge: true })
    const staff = await moderator.newPage()
    await staff.goto('/admin')
    await staff.getByRole('button', { name: 'Administrator', exact: true }).click()
    await staff.getByRole('button', { name: 'Feedback', exact: true }).click()
    const ticket = staff.getByRole('listitem').filter({ hasText: message })
    await ticket.getByRole('combobox').selectOption('in_progress')
    await ticket.getByLabel('Admin notes').fill('Follow up')
    await ticket.getByRole('button', { name: 'Save changes' }).click()
    await expect(ticket.getByText('Feedback updated.')).toBeVisible()
    await staff.getByRole('button', { name: 'Broadcast', exact: true }).click()
    await staff.getByLabel('Notification title').fill(subject)
    await staff.getByLabel('Message body').fill('Train times changed.')
    await staff.getByRole('button', { name: 'Send broadcast', exact: true }).click()
    await expect(staff.getByText('Broadcast queued.')).toBeVisible()
    const history = staff.getByRole('listitem').filter({ hasText: subject })
    await expect(history.getByText(/completed/)).toBeVisible()
    await page.goto('/notifications')
    const item = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('checkbox', { name: subject }) })
    await expect(item.getByText(/^Read ·/)).toBeVisible()
    await item.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Delete selected' }).click()
    await expect(item).toHaveCount(0)
    await staff.getByRole('button', { name: 'Users', exact: true }).click()
    await staff.getByLabel('Search by name, email or username').fill(fixture.email)
    staff.once('dialog', (d) => d.accept())
    await staff.getByRole('button', { name: 'Suspend account' }).click()
    await expect(page.getByRole('heading', { name: /^Account suspended$/i })).toBeVisible()
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: /^Account suspended$/i })).toBeVisible()
    staff.once('dialog', (d) => d.accept())
    await staff.getByRole('button', { name: 'Reactivate account' }).click()
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible()
  } finally {
    await moderator.close()
    await deleteApp(fixture.app)
  }
})

test('offline invitation responses remain scoped to the traveler who accepted or declined them', async ({
  browser,
  context,
  page,
}) => {
  const guest = await traveler(context),
    other = await browser.newContext(),
    host = await traveler(other)
  const guestId = guest.profile.id,
    owner = host.profile.id
  const trip = async () => {
    const id = randomUUID(),
      name = 'Weekend ' + id.slice(0, 8)
    const ref = doc(host.profile.firestore, 'trips', id)
    await setDoc(ref, {
      name,
      createdBy: owner,
      createdAt: serverTimestamp(),
      memberUids: [owner],
      members: { [owner]: { displayName: 'Trip owner' } },
      pendingMemberUids: [guestId],
      pendingMembers: { [guestId]: { displayName: 'Invited traveler' } },
      allowEditing: true,
      hasBudget: false,
      isDeleted: false,
      isArchived: false,
      totalSpent: 0,
    })
    return { ref, name }
  }
  try {
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
    const [join, decline] = await Promise.all([trip(), trip()])
    await page.goto('/')
    const card = (name: string) =>
      page.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) })
    await expect(card(join.name)).toBeVisible()
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    await context.setOffline(true)
    await card(join.name).getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(card(join.name).getByText('Acceptance pending sync.')).toBeVisible()
    await card(decline.name).getByRole('button', { name: 'Decline', exact: true }).click()
    await expect(card(decline.name).getByText('Decline pending sync.')).toBeVisible()
    await page.reload()
    await expect(card(join.name).getByText('Acceptance pending sync.')).toBeVisible()
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
    await context.setOffline(false)
    await page.getByRole('button', { name: 'Bharat', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
    expect((await getDocFromServer(join.ref)).get('pendingMemberUids')).toContain(guestId)
    expect((await getDocFromServer(decline.ref)).get('pendingMemberUids')).toContain(guestId)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
    const saved = JSON.stringify({
      ...getAuth(guest.app).currentUser!.toJSON(),
      appName: 'splittrip-flutter-client',
    })
    await page.evaluate(
      (token) =>
        sessionStorage.setItem('firebase:authUser:demo-key:splittrip-flutter-client', token),
      saved,
    )
    await page.goto('/')
    await expect
      .poll(async () => (await getDocFromServer(join.ref)).get('memberUids'))
      .toContain(guestId)
    await expect
      .poll(async () => (await getDocFromServer(decline.ref)).get('pendingMemberUids'))
      .not.toContain(guestId)
    expect((await getDocFromServer(decline.ref)).get('memberUids')).not.toContain(guestId)
    const ownerPage = await other.newPage()
    await ownerPage.goto(new URL('/trips/' + join.ref.id + '/members', page.url()).href)
    const remove = ownerPage.getByRole('button', { name: 'Remove', exact: true })
    await expect(remove).toBeVisible()
    await other.setOffline(true)
    ownerPage.once('dialog', (dialog) => dialog.accept())
    await remove.click()
    await expect(ownerPage.getByRole('button', { name: 'Removal pending sync' })).toBeDisabled()
    expect((await getDocFromServer(join.ref)).get('memberUids')).toContain(guestId)
    await other.setOffline(false)
    await expect
      .poll(async () => (await getDocFromServer(join.ref)).get('memberUids'))
      .not.toContain(guestId)
  } finally {
    await other.close()
    await Promise.all([deleteApp(guest.app), deleteApp(host.app)])
  }
})

test('a dismissed home announcement reappears when its message changes', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'The Firebase project has one shared announcement.',
  )
  const staff = await traveler(context, true)
  const ref = doc(staff.profile.firestore, 'config', 'announcement')
  const original = await getDocFromServer(ref)
  const first = 'Train update ' + randomUUID()
  const publish = (message: string) =>
    setDoc(ref, { message, isEnabled: true, updatedAt: serverTimestamp() })
  try {
    await publish(first)
    await page.goto('/')
    const banner = page.getByRole('complementary', { name: 'Announcement' })
    await expect(banner).toContainText(first)
    await banner.getByRole('button', { name: 'Dismiss announcement' }).click()
    await expect(banner).toHaveCount(0)
    await publish(first)
    await expect(banner).toHaveCount(0)
    const next = 'Departure update ' + randomUUID()
    await publish(next)
    await expect(banner).toContainText(next)
  } finally {
    if (original.exists()) await setDoc(ref, original.data())
    else await deleteDoc(ref)
    await deleteApp(staff.app)
  }
})
