import { readdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { expect, test } from '@playwright/test'

const subpath = '/comparekit/'
const root = resolve('dist')
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
])

test('runs the Pages build under a repository path with browser-only restrictions', async ({ browser }) => {
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
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('The Pages test server did not bind to TCP.')
    const site = new URL(subpath, `http://127.0.0.1:${address.port}`).href
    const unexpected: string[] = []
    const context = await browser.newContext({ serviceWorkers: 'block' })
    try {
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
    await new Promise<void>((closed) => server.close(() => closed()))
  }
})
