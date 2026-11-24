import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { blankSession } from '../../src/core/session'
import { base, merged, versionA, versionB } from '../fixtures/three-way'
import { whitespaceModified, whitespaceOriginal } from '../fixtures/whitespace'

const workspace = (page: Page) => page.getByRole('region', { name: 'Text comparison', exact: true })
const source = (page: Page) => page.locator('.editor.original .view-lines')
const target = (page: Page) => page.locator('.editor.modified .view-lines')
const monacoShortcut = process.platform === 'darwin' ? 'Meta' : 'Control'
async function paste(page: Page, side: 'Original' | 'Modified', value: string) {
  await page
    .locator(`.editor.${side.toLowerCase()} .view-line`)
    .first()
    .click({ position: { x: 2, y: 4 } })
  await page.keyboard.insertText(value)
}
async function sample(page: Page) {
  await page.getByRole('button', { name: 'Try sample' }).click()
  await expect(page.getByRole('button', { name: 'Apply change 1 to modified', exact: true })).toBeVisible()
}
async function exportDialog(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Export and import' })).toBeVisible()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(workspace(page)).toBeVisible()
})
test('edits both sides, applies both directions, and walks global history', async ({ page }) => {
  await paste(page, 'Original', 'one\nleft\nthree')
  await paste(page, 'Modified', 'one\nright\nthree')
  await expect(source(page)).toContainText('left')
  await expect(target(page)).toContainText('right')
  await page.getByRole('button', { name: 'Apply change 1 to modified', exact: true }).click()
  await expect(target(page)).toContainText('left')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(target(page)).toContainText('right')
  await page.getByRole('button', { name: 'Apply change 1 to original', exact: true }).click()
  await expect(source(page)).toContainText('right')
  await page.keyboard.press(`${monacoShortcut}+z`)
  await expect(source(page)).toContainText('left')
  await page.keyboard.press(`${monacoShortcut}+Shift+z`)
  await expect(source(page)).toContainText('right')
  await page.getByRole('button', { name: 'Swap sides' }).click()
  await expect(page.getByRole('textbox', { name: 'Modified version name' })).toHaveValue('Original')
  await page.getByRole('button', { name: 'Workspace menu', exact: true }).click()
  await page.getByRole('button', { name: 'Clear both sides' }).click()
  await expect(page.getByRole('button', { name: 'Try sample' })).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(target(page)).toContainText('right')
})
test('marks indentation without removal colors and keeps genuine insertions and merge actions', async ({
  page,
}) => {
  const picker = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open files', exact: true }).click()
  await (await picker).setFiles([
    { name: 'before.yaml', mimeType: 'text/plain', buffer: Buffer.from(whitespaceOriginal) },
    { name: 'after.yaml', mimeType: 'text/plain', buffer: Buffer.from(whitespaceModified) },
  ])
  await expect(page.getByText('5 whitespace-only', { exact: true })).toBeVisible()
  await expect(page.locator('.stat-add')).toHaveText('+1')
  await expect(page.locator('.stat-remove')).toHaveText('−0')
  await expect(page.locator('.editor.modified .formatting-whitespace').first()).toBeVisible()
  await expect(page.locator('.editor.original .line-delete').filter({ visible: true })).toHaveCount(0)
  await expect(page.locator('.editor.modified .line-insert').filter({ visible: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Apply change 2 to original', exact: true }).click()
  await expect(page.getByText('5 whitespace-only', { exact: true })).toHaveCount(0)
  await expect(page.locator('.stat-add')).toHaveText('+1')
})

test('reveals a whitespace-only change from the change navigator when folding is enabled', async ({
  page,
}) => {
  const contents = Array.from({ length: 85 }, (_, index) => 'step ' + (index + 1)).join('\n')
  const picker = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open files', exact: true }).click()
  await (await picker).setFiles([
    { name: 'before.txt', mimeType: 'text/plain', buffer: Buffer.from(contents) },
    {
      name: 'after.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(contents.replace('step 60', '\tstep 60')),
    },
  ])
  await expect(page.getByText('1 whitespace-only', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Fold unchanged sections', exact: true }).click()
  await page.getByRole('button', { name: 'Next change', exact: true }).click()
  await expect(page.locator('.editor.modified .formatting-whitespace').first()).toBeVisible()
})

test('theme, unified layout, fold, keyboard navigation, and responsive workspace', async ({ page }) => {
  await sample(page)
  await page.keyboard.press('F7')
  await expect(page.getByLabel('Change count')).toHaveText(/1 \/ /)
  await page.getByRole('button', { name: 'Unified', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unified', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Fold unchanged sections' }).click()
  await expect(page.getByRole('button', { name: 'Fold unchanged sections' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Editor', exact: true }).click()
  await page.getByLabel('Theme', { exact: true }).selectOption('dark')
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  for (const viewport of [
    { width: 3840, height: 2160 },
    { width: 2560, height: 1440 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport)
    await expect
      .poll(async () => (await workspace(page).boundingBox())!.height / viewport.height)
      .toBeGreaterThan(0.84)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
  }
  await page.setViewportSize({ width: 360, height: 760 })
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'Fullscreen workspace' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => !!document.fullscreenElement || document.querySelector('.focus-mode') !== null),
    )
    .toBeTruthy()
})
test('imports local files, generates and removes share payloads, and downloads patches and reports', async ({
  page,
}) => {
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open files', exact: true }).click()
  await (await chooserPromise).setFiles([
    { name: 'config-before.txt', mimeType: 'text/plain', buffer: Buffer.from('old\n🧪') },
    { name: 'config-after.txt', mimeType: 'text/plain', buffer: Buffer.from('new\nї') },
  ])
  await expect(target(page)).toContainText('new')
  await exportDialog(page)
  const patchDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download patch' }).click()
  const patch = await patchDownload
  expect(await readFile((await patch.path())!, 'utf8')).toContain('+++ b/config-after.txt')
  const htmlDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'HTML report' }).click()
  const html = await htmlDownload
  expect(await readFile((await html.path())!, 'utf8')).toMatch(/<!doctype html>/i)
  await page.getByRole('button', { name: 'Create share link' }).click()
  await expect(
    page.getByText('The URL itself contains the compared content.', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Generate link' }).click()
  const link = await page.getByRole('textbox', { name: 'Share link' }).inputValue()
  expect(link).toContain('#ck1=')
  expect(new URL(page.url()).hash).toBe('')
  await page.goto(link)
  await expect(target(page)).toContainText('new')
  await page.getByRole('button', { name: 'Remove data from URL' }).click()
  await expect.poll(() => new URL(page.url()).hash).toBe('')
})
test('compares picked folders locally and stages edited text for ZIP export', async ({ page }) => {
  await page.getByRole('button', { name: 'Folders', exact: true }).click()
  await page
    .getByLabel('Original directory', { exact: true })
    .setInputFiles(resolve('tests/fixtures/folders/original'))
  await page
    .getByLabel('Modified directory', { exact: true })
    .setInputFiles(resolve('tests/fixtures/folders/modified'))
  await page.getByRole('button', { name: 'Compare folders' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'app.conf' })).toContainText('Modified')
  await expect(page.getByRole('row').filter({ hasText: 'same.txt' })).toContainText('Identical')
  await page.getByRole('button', { name: 'app.conf', exact: true }).click()
  await expect(source(page)).toContainText('port=80')
  await expect(target(page)).toContainText('port=443')
  await page.getByRole('button', { name: 'Apply change 1 to modified' }).click()
  await page.getByRole('button', { name: 'Stage modified' }).click()
  await page.getByRole('button', { name: 'Folder results' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'app.conf' })).toContainText('Staged')
  const zipEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Changed files ZIP' }).click()
  expect((await zipEvent).suggestedFilename()).toBe('changed-files.zip')
})
test('explains the three-way inputs and keeps both versions when switching to Text', async ({ page }) => {
  await paste(page, 'Original', 'version one')
  await paste(page, 'Modified', 'version two')
  await page.getByRole('button', { name: 'Three-way', exact: true }).click()
  const three = page.getByRole('region', { name: 'Three-way merge' })
  await expect(three.getByText('Shared starting point', { exact: true })).toBeVisible()
  await expect(three.locator('.three-panes header').filter({ hasText: /Original|Modified/ })).toHaveCount(0)
  await three.getByRole('button', { name: 'Compare two files', exact: true }).click()
  await expect(source(page)).toContainText('version one')
  await expect(target(page)).toContainText('version two')
})

test('resolves a three-way conflict and exports the chosen merge result', async ({ page }) => {
  await page.getByRole('button', { name: 'Three-way', exact: true }).click()
  for (const [name, text] of [
    ['Base', 'setting=base'],
    ['Version A', 'setting=ours'],
    ['Version B', 'setting=theirs'],
  ]) {
    await page.getByRole('textbox', { name: `${name} editor`, exact: true }).focus()
    await page.keyboard.insertText(text)
  }
  await expect(page.getByText('1 unresolved of 1 conflicts')).toBeVisible()
  await page.getByRole('button', { name: 'Accept A', exact: true }).click()
  await expect(page.getByText('No unresolved conflicts')).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByText('1 unresolved of 1 conflicts')).toBeVisible()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(page.getByText('No unresolved conflicts')).toBeVisible()
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download result' }).click()
  expect(await readFile((await (await event).path())!, 'utf8')).toBe('setting=ours')
})
test('highlights three-way changes and applies only the selected conflict', async ({ page }) => {
  await page.getByRole('button', { name: 'Three-way', exact: true }).click()
  const added = Array.from({ length: 85 }, (_, i) => '# unchanged ' + i).join('\n')
  const trail = added + '\nlimit: old\n'
  for (const [label, name, text] of [
    ['Base', 'base.yaml', base + trail],
    ['Version A', 'version-a.yaml', versionA + trail],
    ['Version B', 'version-b.yaml', versionB + trail.replace('limit: old', 'limit: new')],
  ]) {
    const selection = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Open file for ' + label, exact: true }).click()
    await (await selection).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) })
    await expect(page.getByText(name, { exact: true })).toBeVisible()
  }
  await expect(page.getByText('1 unresolved of 1 conflicts')).toBeVisible()
  await page.getByRole('button', { name: 'Next conflict', exact: true }).click()
  await expect(page.locator('.merge-line.merge-tone-conflict').first()).toBeVisible()
  await expect(page.locator('.merge-line.merge-tone-b').first()).toBeVisible()
  const selection = page.getByRole('complementary', { name: 'Selected merge change' })
  await selection.getByText('A', { exact: true }).click()
  await expect(selection.locator('details[open] pre')).toHaveText('host: 3.0.0.0')

  await page.getByRole('button', { name: 'Previous merge change' }).click()
  await expect(page.getByRole('button', { name: 'Apply B for change 6' })).toBeVisible()
  const editorLines = page.locator('.three-pane .view-lines')
  for (const i of [0, 1, 2, 3]) await expect(editorLines.nth(i)).toContainText('limit:')
  await page.getByRole('button', { name: 'Next conflict', exact: true }).click()
  await page.getByRole('button', { name: 'Apply A for change 1' }).click()
  await expect(page.getByText('No unresolved conflicts')).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download result' }).click()
  expect(await readFile((await (await download).path())!, 'utf8')).toBe(
    merged + trail.replace('limit: old', 'limit: new'),
  )
})

test('syncs three-way scrolling by default and lets each pane scroll independently', async ({ page }) => {
  await page.getByRole('button', { name: 'Three-way', exact: true }).click()
  const shared = Array.from({ length: 170 }, (_, i) => 'shared line ' + (i + 1))
  const added = Array.from({ length: 12 }, (_, i) => 'additional line ' + (i + 1))
  const files = [
    ['Base', 'base.txt', ['setting: base', ...shared]],
    ['Version A', 'version-a.txt', ['setting: ours', ...shared]],
    ['Version B', 'version-b.txt', ['setting: base', ...shared.slice(0, 20), ...added, ...shared.slice(20)]],
  ] as const
  for (const [label, name, text] of files) {
    const selection = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Open file for ' + label, exact: true }).click()
    await (await selection).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text.join('\n')) })
    await expect(page.getByText(name, { exact: true })).toBeVisible()
  }

  await expect(page.getByText('No unresolved conflicts')).toBeVisible()
  const toggle = page.getByRole('button', { name: 'Sync scrolling' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const editors = page.locator('.three-workspace .three-pane .monaco-editor')
  const topLines = () =>
    editors.evaluateAll((panes) =>
      panes.map((editor) => {
        const top = editor.getBoundingClientRect().top
        return (
          Array.from(editor.querySelectorAll('.view-line'))
            .filter((line) => line.getBoundingClientRect().bottom > top + 1)
            .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0]
            ?.textContent?.trim()
            .replace(/\s+/g, ' ') ?? ''
        )
      }),
    )
  async function scroll(pane: number, amount: number) {
    await editors.nth(pane).hover()
    await page.mouse.wheel(0, amount)
  }

  // PageDown advances by the editor's viewport regardless of the browser's wheel normalization.
  await page.getByRole('textbox', { name: 'Version B editor', exact: true }).focus()
  for (let step = 0; step < 4; step++) await page.keyboard.press('PageDown')
  await expect
    .poll(async () => {
      const visible = await topLines()
      const line = Number(visible[2].match(/^shared line (\d+)$/)?.[1])
      return line > 20 && new Set(visible).size === 1
    })
    .toBe(true)

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  const before = await topLines()
  await scroll(2, 300)
  await expect.poll(async () => (await topLines())[2]).not.toBe(before[2])
  const after = await topLines()
  for (const index of [0, 1, 3]) expect(after[index]).toBe(before[index])

  await toggle.click()
  await scroll(3, 260)
  await expect.poll(async () => new Set(await topLines()).size).toBe(1)

  await page.getByRole('textbox', { name: 'Merge result editor', exact: true }).focus()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home')
  await page.keyboard.insertText('manually added heading\n')
  await expect(page.getByRole('button', { name: 'Restore generated result' })).toBeVisible()
  await expect(editors.nth(3).locator('.view-lines')).toContainText(/manually\s+added\s+heading/)
  await expect
    .poll(async () => {
      const visible = await topLines()
      await scroll(3, visible[3].startsWith('shared line') ? 120 : 1250)
      const next = await topLines()
      return next[3].startsWith('shared line') && new Set(next).size === 1
    })
    .toBe(true)

  await toggle.click()
  await page.reload()
  await page.getByRole('button', { name: 'Three-way', exact: true }).click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
})

test('no external traffic or automatic persistence with untrusted content', async ({ page, context }) => {
  const outside: string[] = []
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:4173') await route.continue()
    else {
      outside.push(route.request().url())
      await route.abort('internetdisconnected')
    }
  })
  const before = await page.request.get('/')
  expect(before.headers()['content-security-policy']).toContain("connect-src 'none'")
  const secret = 'private-marker <img src=https://invalid.example/pixel onerror=alert(1)>'
  const data = blankSession()
  data.left = { name: '<script>window.compromised=true</script>.txt', text: secret }
  data.right.text = '<script>window.compromised=true</script>\nnew'
  await exportDialog(page)
  const importEvent = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import session JSON' }).click()
  await (await importEvent).setFiles({
    name: 'import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  })
  await expect(source(page)).toContainText('private-marker')
  expect(await page.evaluate(() => localStorage.getItem('comparekit.sessions.v1'))).toBeNull()
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0)
  expect(await page.evaluate(() => Object.hasOwn(window, 'compromised'))).toBe(false)
  await page.getByLabel('Syntax language').selectOption('html')
  await page.getByRole('button', { name: 'Workspace menu', exact: true }).click()
  await page.getByRole('button', { name: 'Document preview' }).click()
  const preview = page.getByRole('region', { name: 'Original preview' })
  await expect(preview).toContainText('private-marker')
  expect(await preview.locator('img, script, iframe, a').count()).toBe(0)
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Try sample' })).toBeVisible()
  await sample(page)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Workspace menu', exact: true }).click()
  await page.getByRole('button', { name: 'Clear workspace' }).click()
  await expect(page.getByRole('button', { name: 'Try sample' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  expect(outside).toEqual([])
})
test('keeps a multi-thousand-line comparison usable', async ({ page }) => {
  const text = Array.from({ length: 10_000 }, (_, i) => `line ${i}`).join('\n')
  const input = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open files', exact: true }).click()
  await (await input).setFiles([
    { name: 'large-left.txt', mimeType: 'text/plain', buffer: Buffer.from(text) },
    {
      name: 'large-right.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(text.replace('line 9842', 'edited 9842')),
    },
  ])
  await expect(page.getByRole('button', { name: 'Next change' })).toBeEnabled({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Next change' }).click()
  await expect(target(page)).toContainText('edited')
})

test('compares folders over plain HTTP without secure-context APIs', async ({ page, context }) => {
  await context.route('http://comparekit.test/**', async (route) => {
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: new URL(url.pathname, 'http://127.0.0.1:4173').href })
    const headers = response.headers()
    delete headers['content-encoding']
    delete headers['content-length']
    await route.fulfill({ status: response.status(), headers, body: await response.body() })
  })
  await page.goto('http://comparekit.test/')
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false)
  await page.getByRole('button', { name: 'Folders', exact: true }).click()
  await page
    .getByLabel('Original directory', { exact: true })
    .setInputFiles(resolve('tests/fixtures/folders/original'))
  await page
    .getByLabel('Modified directory', { exact: true })
    .setInputFiles(resolve('tests/fixtures/folders/modified'))
  await page.getByRole('button', { name: 'Compare folders' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'app.conf' })).toContainText('Modified')
})
