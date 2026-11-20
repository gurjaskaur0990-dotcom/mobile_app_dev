import { expect, test, type Page } from '@playwright/test'

async function localSignIn(page: Page, name: 'Asha' | 'Bharat') {
  await page.getByRole('button', { name, exact: true }).click()
}

test('two travelers sync an offline expense, record a repayment and recover their trip', async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(110_000)
  const companion = await browser.newContext({ baseURL, viewport: { width: 360, height: 800 } })
  const second = await companion.newPage()
  const tripName = 'Jaipur weekend ' + crypto.randomUUID().slice(0, 8)
  const description = 'Station taxi'
  try {
    await Promise.all([page.goto('/'), second.goto('/')])
    await Promise.all([localSignIn(page, 'Asha'), localSignIn(second, 'Bharat')])
    await expect(second.getByRole('heading', { name: 'My trips' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible()
    await page.getByRole('button', { name: 'New trip' }).click()
    await page.getByLabel('Trip name').fill(tripName)
    await page.getByLabel('Track budget contributions').check()
    await page.getByRole('button', { name: 'Create trip', exact: true }).click()
    await expect(page.getByRole('heading', { name: tripName, exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/trips\/[^/]+\/expenses$/)
    const tripURL = new URL(page.url()).pathname.replace(/\/expenses$/, '')
    const section = (name: string) =>
      page
        .getByRole('navigation', { name: 'Trip sections' })
        .getByRole('link', { name, exact: true })
    await section('Members').click()
    await page.getByRole('button', { name: 'Invite member', exact: true }).click()
    await page.getByLabel('Exact username or email').fill('bharat@example.test')
    await page.getByRole('button', { name: 'Find user' }).click()
    await page.getByRole('button', { name: 'Send invitation' }).click()
    await second
      .getByRole('listitem')
      .filter({ hasText: tripName })
      .getByRole('button', { name: 'Accept' })
      .click()
    await expect(
      page
        .getByRole('button', { name: /Remove Bharat|Remove member Bharat/i })
        .or(page.getByRole('listitem').filter({ hasText: 'Bharat' }))
        .first(),
    ).toBeVisible()

    await section('Expenses').click()
    await expect(page.getByRole('heading', { name: 'No expenses yet' })).toBeVisible()
    await page.getByRole('link', { name: 'Add expense' }).click()
    await page.getByLabel('Expense title').fill(description)
    await page.getByLabel('Amount (INR)', { exact: true }).fill('120.00')
    await expect(page.getByText('₹60 per person', { exact: true })).toBeVisible()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await page.context().setOffline(true)
    await page.getByRole('button', { name: 'Save expense' }).click()
    await expect(page.getByRole('link', { name: /change.*pending sync/i })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: tripName, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /change.*pending sync/i })).toBeVisible()
    await page.context().setOffline(false)
    await expect(page.getByRole('link', { name: new RegExp(description) })).toBeVisible({
      timeout: 20000,
    })
    await second.goto(tripURL + '/expenses')
    await second.getByRole('link', { name: new RegExp(description) }).click()
    await expect(second.getByRole('heading', { name: 'Split details' })).toBeVisible()
    const detailURL = new URL(second.url()).pathname
    await expect(
      second.locator('.ld-receipt-hero').getByText('₹120', { exact: true }),
    ).toBeVisible()
    await expect(second.getByRole('link', { name: 'Edit expense' })).toHaveCount(0)
    const deepContext = await browser.newContext({ baseURL, viewport: { width: 768, height: 900 } })
    try {
      const deep = await deepContext.newPage()
      await deep.goto(detailURL)
      await localSignIn(deep, 'Asha')
      await expect(deep.getByRole('heading', { name: description, exact: true })).toBeVisible()
      await deep.reload()
      await expect(deep.getByRole('link', { name: 'Edit expense' })).toBeVisible()
      await deep.getByRole('link', { name: 'Edit expense' }).focus()
      await deep.keyboard.press('Enter')
      await expect(deep.getByRole('heading', { name: 'Edit expense' })).toBeVisible()
      await deep.goBack()
      await expect(deep.getByRole('heading', { name: description, exact: true })).toBeVisible()
    } finally {
      await deepContext.close()
    }

    await section('Budget').click()
    await page.getByRole('button', { name: 'Add contribution' }).click()
    await page
      .getByRole('combobox', { name: 'Contributor', exact: true })
      .selectOption({ label: 'Bharat' })
    await page.getByLabel('Contribution (INR)').fill('60')
    await page.getByRole('button', { name: 'Save contribution' }).click()
    await expect(page.getByText('Contribution recorded.')).toBeVisible()
    await section('Summary').click()
    await expect(
      page.getByRole('button', { name: 'Record payment: Bharat pays Asha ₹30' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Record payment' }).click()
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.getByText('settled', { exact: true })).toHaveCount(2)
    await section('Budget').click()
    const figures = page.locator('dl').filter({ hasText: 'Total Budget' })
    await expect(figures.getByText('₹120', { exact: true })).toBeVisible()
    await expect(figures.getByText('₹60', { exact: true })).toBeVisible()
    await expect(figures.getByText('-₹60', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Budget Balances' })).toBeVisible()

    await page.screenshot({ path: testInfo.outputPath('budget-after-repayment.png') })
    await page.getByRole('link', { name: 'Trip Info & Settings' }).click()
    await page.getByRole('button', { name: /^Archive Trip/ }).click()
    await expect(page.getByRole('button', { name: 'Unarchive trip' })).toBeVisible()
    await page.getByRole('button', { name: 'Delete trip' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Yes, Delete' }).click()
    await expect(page).toHaveURL(new URL('/', baseURL).href)
    await page.goto('/recently-deleted')
    const removed = page.getByRole('listitem').filter({ hasText: tripName })
    await removed.getByRole('button', { name: 'Restore', exact: true }).click()
    await expect(removed).toHaveCount(0)
    await page.goto('/archive')
    await page.getByRole('link', { name: new RegExp(tripName) }).click()
    await expect(page.getByRole('link', { name: 'Add expense' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: new RegExp(description) })).toBeVisible()
    await expect(page.getByRole('link', { name: /Settlement: Bharat to Asha/ })).toBeVisible()
    await page.goto('/analytics')
    await expect(page.getByRole('link', { name: tripName, exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('trip-analytics.png') })
    await expect(
      await second.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  } finally {
    await companion.close()
  }
})

test('a competing editor can review its draft, undo deletion, and purge selected expenses', async ({
  page,
  browser,
  baseURL,
}) => {
  const independent = await browser.newContext({ baseURL })
  const editor = await independent.newPage()
  const tripName = 'Recovery trip ' + crypto.randomUUID().slice(0, 8)
  try {
    await page.goto('/')
    await localSignIn(page, 'Asha')
    await page.getByRole('button', { name: 'New trip' }).click()
    await page.getByLabel('Trip name').fill(tripName)
    await page.getByRole('button', { name: 'Create trip', exact: true }).click()
    await page.getByRole('link', { name: 'Add expense' }).click()
    await page.getByLabel('Expense title').fill('Lunch')
    await page.getByLabel('Amount (INR)', { exact: true }).fill('50.25')
    await page.getByRole('button', { name: 'Save expense' }).click()
    await page.getByRole('link', { name: /Lunch.*Paid by/ }).click()
    await expect(page.getByRole('heading', { name: 'Lunch', exact: true })).toBeVisible()
    const detail = new URL(page.url()).pathname
    await editor.goto(detail + '/edit')
    await localSignIn(editor, 'Asha')
    await editor.getByLabel('Expense title').fill('Lunch at station')
    await page.getByRole('link', { name: 'Edit expense' }).click()
    await page.getByLabel('Expense title').fill('Lunch for group')
    await page.getByRole('button', { name: 'Save expense' }).click()
    await expect(page.getByRole('heading', { name: 'Lunch for group', exact: true })).toBeVisible()
    await expect(editor.getByRole('heading', { name: 'Review the latest expense' })).toBeVisible()
    await expect(editor.getByLabel('Expense title')).toHaveValue('Lunch at station')
    await expect(editor.getByRole('button', { name: 'Save expense' })).toBeDisabled()
    await editor.getByRole('button', { name: 'Keep my edits' }).click()
    await editor.getByRole('button', { name: 'Save expense' }).click()
    await expect(page.getByRole('heading', { name: 'Lunch at station', exact: true })).toBeVisible()

    const remove = async () => {
      await page.getByRole('button', { name: 'Delete expense', exact: true }).click()
      await page.getByRole('button', { name: 'Confirm deletion' }).click()
    }
    await remove()
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Edit expense', exact: true })).toBeVisible()
    await remove()
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
    await page.goto('/recently-deleted')
    await page
      .getByRole('navigation', { name: 'Recently Deleted categories' })
      .getByRole('button', { name: 'Expenses' })
      .click()
    const discarded = page
      .getByRole('listitem')
      .filter({ hasText: tripName })
      .filter({ hasText: 'Lunch at station' })
    await discarded.getByRole('button', { name: 'Delete Forever' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Permanently Delete' }).click()
    await expect(discarded).toHaveCount(0)
    await page.goto(detail)
    await expect(page.getByRole('heading', { name: 'Entry unavailable' })).toBeVisible()
  } finally {
    await independent.close()
  }
})

test('reads an existing Flutter ledger and writes edited INR into the same document', async ({
  page,
  request,
}) => {
  const project = 'demo-splittrip-flutter'
  const auth = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-key',
    {
      data: {
        requestUri: 'http://localhost',
        returnSecureToken: true,
        postBody: new URLSearchParams({
          providerId: 'google.com',
          id_token: JSON.stringify({
            sub: 'local-Asha',
            name: 'Asha',
            email: 'asha@example.test',
            email_verified: true,
          }),
        }).toString(),
      },
    },
  )
  expect(auth.ok()).toBe(true)
  const { localId: uid } = await auth.json()
  const tripId = 'compat-' + crypto.randomUUID(),
    entryId = 'original-expense'
  const docs =
    'http://127.0.0.1:8080/v1/projects/' +
    project +
    '/databases/(default)/documents/trips/' +
    tripId
  const headers = { Authorization: 'Bearer owner' }
  const str = (v: string) => ({ stringValue: v }),
    amount = (v: number) => ({ doubleValue: v })
  const when = { timestampValue: '2024-04-07T12:00:00Z' }
  const seedTrip = await request.patch(docs, {
    headers,
    data: {
      fields: {
        name: str('Old route ' + tripId),
        createdBy: str(uid),
        createdAt: when,
        memberUids: { arrayValue: { values: [str(uid)] } },
        members: {
          mapValue: {
            fields: {
              [uid]: { mapValue: { fields: { uid: str(uid), displayName: str('Asha') } } },
            },
          },
        },
        hasBudget: { booleanValue: false },
        totalSpent: amount(90.333),
        totalBudget: amount(0),
        isArchived: { booleanValue: false },
        isDeleted: { booleanValue: false },
      },
    },
  })
  expect(seedTrip.ok()).toBe(true)
  const expense = docs + '/expenses/' + entryId
  const seedExpense = await request.patch(expense, {
    headers,
    data: {
      fields: {
        title: str('Boat to island'),
        amount: amount(90.333),
        splitAmount: amount(41.25),
        paidBy: str(uid),
        paidByName: str('Asha'),
        createdAt: when,
        sharedWith: { arrayValue: { values: [str(uid)] } },
        isDeleted: { booleanValue: false },
      },
    },
  })
  expect(seedExpense.ok()).toBe(true)
  await page.goto('/trip/' + tripId + '/expense/' + entryId)
  await localSignIn(page, 'Asha')
  await expect(page.getByRole('heading', { name: 'Boat to island' })).toBeVisible()
  await expect(page.getByText('₹41.25', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Edit expense' }).click()
  await page.getByLabel('Amount (INR)').fill('84.125')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByRole('heading', { name: 'Boat to island' })).toBeVisible()
  const saved = (await (await request.get(expense, { headers })).json()).fields
  expect(saved.amount.doubleValue).toBe(84.125)
  expect(saved.createdAt.timestampValue).toBe(when.timestampValue)
  expect(saved.isEdited.booleanValue).toBe(true)
  expect(saved.lastUpdatedBy.stringValue).toBe(uid)
  expect(saved.amountPaise).toBeUndefined()
  expect(saved.revision).toBeUndefined()
  const trip = (await (await request.get(docs, { headers })).json()).fields
  expect(trip.totalSpent.doubleValue).toBeCloseTo(84.125)
})
