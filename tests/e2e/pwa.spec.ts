import { expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, relative, extname } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Page } from '@playwright/test'

const formats: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
}

// Serve the real immutable build on a new origin. Only the worker response changes,
// so worker installation and activation exercise the browser's actual update lifecycle.
async function versionedBuild() {
  const root = resolve('dist-emulator')
  let version = 1
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url || '/', 'http://localhost').pathname
      const path = resolve(
        root,
        '.' + (extname(pathname) ? pathname : '/index.html'),
      )
      if (relative(root, path).startsWith('..')) {
        res.writeHead(404).end()
        return
      }
      const source = await readFile(path)
      res.writeHead(200, {
        'Content-Type': formats[extname(path)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      if (pathname === '/sw.js')
        res.end(
          Buffer.concat([
            source,
            Buffer.from('\n// Acceptance build ' + version + '\n'),
          ]),
        )
      else res.end(source)
    } catch {
      res.writeHead(404).end()
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {
    origin: 'http://127.0.0.1:' + (server.address() as AddressInfo).port,
    release: () => {
      version++
    },
    close: async () => {
      const closed = once(server, 'close')
      server.close()
      server.closeAllConnections()
      await closed
    },
  }
}

async function deferredUpdate(
  page: Page,
  release: () => void,
  input: ReturnType<Page['getByLabel']>,
  draft: string,
) {
  await input.fill(draft)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  release()
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    await registration.update()
  })
  await expect(
    page.getByRole('button', { name: 'Reload to update' }),
  ).toBeVisible()
  await expect(input).toHaveValue(draft)
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Reload to update' }).click()
  await expect(input).toHaveValue(draft)
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await expect(input).toHaveValue(draft)
  await expect(
    page.getByRole('button', { name: 'Later', exact: true }),
  ).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          !!(await navigator.serviceWorker.getRegistration())?.waiting,
      ),
    )
    .toBe(true)
}

test('the install manifest and its browser-decoded icons provide the standalone PWA', async ({
  playwright,
  baseURL,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Desktop verifies installability and browser zoom using a clean persistent profile.',
  )
  const profile = await playwright.chromium.launchPersistentContext('', {
    channel:
      process.env.SPLITTRIP_SYSTEM_CHROME === '1' ? 'chrome' : 'chromium',
    viewport: null,
    headless: true,
    args: ['--window-size=1440,960'],
  })
  try {
    const page = await profile.newPage()
    await page.goto(baseURL!)
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector<HTMLLinkElement>('link[rel=manifest]')
      if (!link) throw Error('Manifest link missing')
      const response = await fetch(link.href)
      if (!response.ok) throw Error('Manifest unavailable')
      const manifest = await response.json()
      const icons = await Promise.all(
        manifest.icons.map(async (icon: { src: string; purpose?: string }) => {
          const image = new Image()
          image.src = new URL(icon.src, link.href).href
          await image.decode()
          return {
            width: image.naturalWidth,
            height: image.naturalHeight,
            purpose: icon.purpose || 'any',
          }
        }),
      )
      await navigator.serviceWorker.ready
      return {
        id: manifest.id,
        scope: manifest.scope,
        display: manifest.display,
        name: manifest.name,
        start: manifest.start_url,
        icons,
      }
    })
    expect(manifest).toMatchObject({
      id: '/',
      scope: '/',
      display: 'standalone',
      name: 'SplitTrip',
      start: '/',
    })
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        { width: 192, height: 192, purpose: 'any' },
        { width: 512, height: 512, purpose: 'any' },
        { width: 512, height: 512, purpose: 'maskable' },
      ]),
    )
    {
      const cdp = await page.context().newCDPSession(page)
      const { installabilityErrors } = await cdp.send(
        'Page.getInstallabilityErrors',
      )
      expect(installabilityErrors).toEqual([])
      await cdp.detach()
    }
    const settings = await profile.newPage()
    await settings.goto('chrome://settings/appearance')
    const originalWidth = await page.evaluate(() => window.innerWidth)
    const originalRatio = await page.evaluate(() => window.devicePixelRatio)
    await settings.evaluate(async () => {
      const api = (globalThis as any).chrome.settingsPrivate
      await api.setDefaultZoom(2)
    })
    await settings.close()
    await page.bringToFront()
    await expect
      .poll(() => page.evaluate(() => window.devicePixelRatio))
      .toBe(originalRatio * 2)
    await expect
      .poll(() => page.evaluate(() => window.innerWidth))
      .toBe(Math.round(originalWidth / 2))
    await page.getByRole('button', { name: 'Asha', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('button', { name: 'New Trip', exact: true }),
    ).toBeVisible()
    const create = page.getByRole('button', { name: 'New trip' })
    await create.focus()
    await page.keyboard.press('Enter')
    const name = page.getByLabel('Trip name')
    await expect(name).toBeFocused()
    await page.keyboard.type('Keyboard draft')
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Track budget contributions')).toBeFocused()
    await page.keyboard.press('Space')
    await expect(page.getByLabel('Track budget contributions')).toBeChecked()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const measured = await name.boundingBox()
    expect(measured).not.toBeNull()
    expect(measured!.x + measured!.width).toBeLessThanOrEqual(
      await page.evaluate(() => innerWidth),
    )
    const screenshotSession = await profile.newCDPSession(page)
    const capture = await screenshotSession.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    })
    await writeFile(
      testInfo.outputPath('desktop-200-percent.png'),
      Buffer.from(capture.data, 'base64'),
    )
    await screenshotSession.detach()
  } finally {
    await profile.close()
  }
})

test('another tab can activate the new worker while a deferred profile form stays open', async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Two desktop tabs exercise the shared worker.',
  )
  const site = await versionedBuild()
  try {
    await page.goto(site.origin + '/profile')
    await page.getByRole('button', { name: 'Asha', exact: true }).click()
    await page.getByRole('button', { name: 'Edit display name' }).click()
    const field = page.getByRole('textbox', { name: 'Display name' })
    await expect(field).toBeVisible()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await page.reload()
    await page.getByRole('button', { name: 'Edit display name' }).click()
    await expect(field).toBeVisible()
    const sibling = await context.newPage()
    await sibling.goto(site.origin + '/settings')
    const signIn = sibling.getByRole('button', { name: 'Asha', exact: true })
    const settings = sibling.getByRole('heading', {
      name: 'Settings',
      exact: true,
    })
    await expect(signIn.or(settings)).toBeVisible()
    if (await signIn.isVisible()) await signIn.click()
    await expect(settings).toBeVisible()
    await deferredUpdate(page, site.release, field, 'Keep this form open')
    const original = await page.evaluate(() => performance.timeOrigin)
    const siblingLoad = await sibling.evaluate(() => performance.timeOrigin)
    sibling.once('dialog', (dialog) => dialog.accept())
    await sibling.getByRole('button', { name: 'Reload to update' }).click()
    await expect
      .poll(() =>
        sibling.evaluate(() => performance.timeOrigin).catch(() => siblingLoad),
      )
      .not.toBe(siblingLoad)
    await expect
      .poll(() =>
        sibling
          .evaluate(
            async () =>
              !!(await navigator.serviceWorker.getRegistration())?.waiting,
          )
          .catch(() => true),
      )
      .toBe(false)
    await expect(field).toHaveValue('Keep this form open')
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(original)
    await sibling.close()
  } finally {
    await site.close()
  }
})
