import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { blankSession, encodeShare } from '../../src/core/session'

const subpath = '/comparekit/'
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
])

async function servePages(root: string) {
  // Match Pages' project subpath with ordinary static responses. The restrictions come from index.html.
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
      if (!pathname.startsWith(subpath)) {
        response.writeHead(404).end()
        return
      }
      const file = resolve(root, pathname.slice(subpath.length) || 'index.html')
      if (!file.startsWith(root + sep)) {
        response.writeHead(404).end()
        return
      }
      const body = await readFile(file)
      response
        .writeHead(200, { 'Content-Type': types.get(extname(file)) ?? 'application/octet-stream' })
        .end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('The Pages test server did not bind to TCP.')
  }
  return {
    site: new URL(subpath, `http://127.0.0.1:${address.port}`).href,
    close: () => new Promise<void>((closed) => server.close(() => closed())),
  }
}

test('runs the Pages build under a repository path with browser-only restrictions', async ({ browser }) => {
  const { site, close } = await servePages(resolve('dist'))
  try {
    const unexpected: string[] = []
    const context = await browser.newContext({ serviceWorkers: 'block' })
    try {
      await context.addInitScript(() =>
        Object.defineProperty(navigator, 'globalPrivacyControl', { value: true }),
      )
      await context.route('**/*', (route) => {
        const url = route.request().url()
        if (url.startsWith(site)) return route.continue()
        unexpected.push(url)
        return route.abort()
      })
      context.on('response', (response) => {
        if (response.status() >= 400) unexpected.push(response.url())
      })
      const page = await context.newPage()
      await page.goto(site)
      await expect(page.getByRole('complementary', { name: 'Usage metrics' })).toHaveCount(0)
      await page.getByRole('button', { name: 'Try sample' }).click()
      await expect(
        page.getByRole('button', { name: 'Apply change 1 to original', exact: true }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Folders', exact: true }).click()
      // Exercise the folder worker without depending on Playwright's native directory picker events.
      for (const folder of ['original', 'modified']) {
        const directory = resolve('tests/fixtures/folders', folder)
        const names = await readdir(directory)
        const files = await Promise.all(
          names.map(async (name) => ({ name, text: await readFile(resolve(directory, name), 'utf8') })),
        )
        await page.getByLabel(new RegExp(`^${folder} directory$`, 'i')).evaluate(
          (input: HTMLInputElement, { folder, files }) => {
            const selection = new DataTransfer()
            for (const { name, text } of files) {
              const file = new File([text], name)
              Object.defineProperty(file, 'webkitRelativePath', { value: `${folder}/${name}` })
              selection.items.add(file)
            }
            input.files = selection.files
            input.dispatchEvent(new Event('change', { bubbles: true }))
          },
          { folder, files },
        )
      }
      await page.getByRole('button', { name: 'Compare folders' }).click()
      await expect(page.getByRole('row').filter({ hasText: 'app.conf' })).toContainText('Modified')
      expect(unexpected).toEqual([])
    } finally {
      await context.close()
    }
  } finally {
    await close()
  }
})

test('sends only fixed usage events and stops after opt-out', async ({ browser }, testInfo) => {
  test.setTimeout(90_000)
  const endpoint = 'https://comparekit-metrics.invalid/api/send'
  const website = '00000000-0000-4000-8000-000000000001'
  const root = testInfo.outputPath('usage-build')
  await promisify(execFile)(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'build', '--outDir', root, '--logLevel', 'error'],
    {
      env: {
        ...process.env,
        COMPAREKIT_UMAMI_ENDPOINT: endpoint,
        COMPAREKIT_UMAMI_WEBSITE_ID: website,
        COMPAREKIT_UMAMI_DEFAULT_ENDPOINT: 'https://comparekit-default.invalid/api/send',
        COMPAREKIT_UMAMI_DEFAULT_WEBSITE_ID: '00000000-0000-4000-8000-000000000002',
      },
    },
  )
  const html = await readFile(resolve(root, 'index.html'), 'utf8')
  expect(html).toContain(`connect-src ${endpoint};`)
  expect(html).toContain("script-src 'self';")
  expect(html).not.toContain('comparekit-default.invalid')
  const { site, close } = await servePages(root)
  const context = await browser.newContext({ serviceWorkers: 'block' })
  try {
    const requests: { body: unknown; referrer?: string; cookie?: string }[] = []
    const outside: string[] = []
    await context.route('**/*', (route) => {
      const request = route.request()
      if (request.url().startsWith(site)) return route.continue()
      if (request.url() !== endpoint || !['POST', 'OPTIONS'].includes(request.method())) {
        outside.push(request.url())
        return route.abort()
      }
      if (request.method() === 'POST') {
        requests.push({
          body: request.postDataJSON(),
          referrer: request.headers().referer,
          cookie: request.headers().cookie,
        })
      }
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST',
          'access-control-allow-headers': 'content-type',
        },
      })
    })
    await context.addInitScript(() =>
      Object.defineProperty(navigator, 'globalPrivacyControl', { value: false }),
    )
    const data = blankSession()
    data.title = 'private-session'
    data.left = { name: 'private-original.txt', text: 'same\nprivate-original\nlast\n' }
    data.right = { name: 'private-modified.txt', text: 'same\nprivate-modified\nlast\n' }
    const page = await context.newPage()
    await page.goto(`${site}?token=private-query${await encodeShare(data)}`)
    const notice = page.getByRole('complementary', { name: 'Usage metrics' })
    await expect(notice).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Original version name' })).toHaveValue(data.left.name)
    await page.getByRole('button', { name: 'Apply change 1 to original', exact: true }).click()
    await page.getByRole('button', { name: 'Unified', exact: true }).click()
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.getByText('Leading whitespace', { exact: true }).click()
    await page.getByLabel('Regular expression').fill('private-regex')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await page.getByRole('button', { name: 'Three-way', exact: true }).click()

    const payload = { website, hostname: '127.0.0.1', url: '/' }
    const allowed = [
      'text_compared',
      'text_merge_arrow_original',
      'layout_unified',
      'settings_opened',
      'option_leading',
      'option_regex',
      'settings_tab_editor',
      'mode_three_way',
      'three_way_compared',
    ]
    const expected = [
      { type: 'event', payload },
      ...allowed.map((name) => ({ type: 'event', payload: { ...payload, name } })),
    ]
    await expect.poll(() => requests.map((request) => request.body)).toEqual(expect.arrayContaining(expected))
    expect(requests).toHaveLength(expected.length)
    expect(requests.every(({ referrer, cookie }) => referrer === undefined && cookie === undefined)).toBe(
      true,
    )
    expect(await page.evaluate(() => localStorage.getItem('comparekit.sessions.v1'))).toBeNull()

    await notice.getByRole('button', { name: 'Turn off' }).click()
    await expect(notice).toHaveCount(0)
    await page.getByRole('button', { name: 'Folders', exact: true }).click()
    await page.reload()
    await expect(notice).toHaveCount(0)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Privacy', exact: true }).click()
    const toggle = page.getByRole('checkbox', { name: 'Send usage metrics to Umami' })
    await expect(toggle).not.toBeChecked()
    expect(requests).toHaveLength(expected.length)

    await toggle.check()
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await page.getByRole('button', { name: 'Folders', exact: true }).click()
    await expect
      .poll(() => requests.map((request) => request.body))
      .toContainEqual({
        type: 'event',
        payload: { ...payload, name: 'mode_folders' },
      })
    expect(outside).toEqual([])
  } finally {
    await context.close()
    await close()
  }
})
