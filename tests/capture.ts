import { type ChildProcess, spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { sampleLeft, sampleRight } from '../src/core/sample'
import { base, versionA, versionB } from './fixtures/three-way'
import { whitespaceModified, whitespaceOriginal } from './fixtures/whitespace'

const root = resolve('.')
const folders = ['tests/fixtures/folders/original', 'tests/fixtures/folders/modified'].map((path) =>
  resolve(path),
)
const sizes = [
  [1280, 720],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
]
const upstream = process.argv.includes('--references')
const processes: ChildProcess[] = []
function start(port: number, directory?: string) {
  const server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), ...(directory ? { STATIC_ROOT: resolve(directory) } : {}) },
    windowsHide: true,
    stdio: 'ignore',
  })
  processes.push(server)
  return `http://127.0.0.1:${port}`
}
async function ready(origin: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`${origin}/healthz`)).ok) return
    } catch {
      /* wait for start */
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Could not start local capture server at ${origin}`)
}

const app = start(4180)
const reference = upstream ? start(4181, 'references/text-diff-view/out/renderer') : ''
const delta = upstream ? start(4182, 'references/delta/delta') : ''
const browser = await chromium.launch()
try {
  await Promise.all([app, reference, delta].filter(Boolean).map(ready))
  await mkdir('docs/screenshots', { recursive: true })
  await mkdir('qa-artifacts/reference', { recursive: true })
  const page = await browser.newPage({ colorScheme: 'light' })
  const violations: string[] = []
  page.on('pageerror', (error) => violations.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /security policy|fetch|network/i.test(message.text()))
      violations.push(message.text())
  })
  await page.goto(`${app}/`)
  await page.getByRole('button', { name: 'Try sample' }).click()
  await expect(page.getByRole('button', { name: 'Apply change 1 to modified' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height })
    await expect
      .poll(async () => (await page.getByRole('region', { name: 'Text comparison' }).boundingBox())!.height)
      .toBeGreaterThanOrEqual(height * 0.84)
    await page.screenshot({ path: `docs/screenshots/workspace-${width}.png`, animations: 'disabled' })
  }
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Editor', exact: true }).click()
  await page.getByLabel('Theme', { exact: true }).selectOption('dark')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.screenshot({ path: 'docs/screenshots/workspace-dark.png', animations: 'disabled' })
  const whitespaceFile = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open files', exact: true }).click()
  await (await whitespaceFile).setFiles([
    { name: 'before.yaml', mimeType: 'text/plain', buffer: Buffer.from(whitespaceOriginal) },
    { name: 'after.yaml', mimeType: 'text/plain', buffer: Buffer.from(whitespaceModified) },
  ])
  await expect(page.locator('.editor.modified .formatting-whitespace').first()).toBeVisible()
  await page.screenshot({ path: 'docs/screenshots/whitespace-diff.png', animations: 'disabled' })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.getByRole('button', { name: 'Three-way', exact: true }).click()
  for (const [label, name, input] of [
    ['Base', 'base.yaml', base],
    ['Version A', 'version-a.yaml', versionA],
    ['Version B', 'version-b.yaml', versionB],
  ]) {
    const selection = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Open file for ' + label, exact: true }).click()
    await (await selection).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(input) })
    await expect(page.getByText(name, { exact: true })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: 'Apply A for change 1' })).toBeVisible()
  await page.getByRole('button', { name: 'Next conflict', exact: true }).click()
  await page.screenshot({ path: 'docs/screenshots/three-way.png', animations: 'disabled' })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.getByRole('button', { name: 'Folders', exact: true }).click()
  await page.getByLabel('Original directory', { exact: true }).setInputFiles(folders[0])
  await page.getByLabel('Modified directory', { exact: true }).setInputFiles(folders[1])
  await page.getByRole('button', { name: 'Compare folders' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'app.conf' })).toContainText('Modified')
  await page.screenshot({ path: 'docs/screenshots/folders.png', animations: 'disabled' })
  if (violations.length) throw new Error(violations.join('\n'))
  console.log(
    'CompareKit screenshots captured at four desktop sizes with additional dark and folder captures.',
  )
  if (upstream) {
    const textDiff = await browser.newPage({ colorScheme: 'light', viewport: { width: 1280, height: 720 } })
    await textDiff.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: reference })
    await textDiff.goto(`${reference}/`)
    for (const [side, input] of [
      ['original', sampleLeft],
      ['modified', sampleRight],
    ]) {
      const editor = textDiff.locator(`.editor.${side} .view-line`).first()
      await editor.click({ position: { x: 2, y: 4 } })
      await textDiff.evaluate((text) => navigator.clipboard.writeText(text), input)
      await textDiff.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v')
    }
    await expect(textDiff.locator('.editor.modified .view-lines')).toContainText('8443')
    await expect(textDiff.locator('.line-insert').first()).toBeVisible()
    for (const [width, height] of sizes) {
      await textDiff.setViewportSize({ width, height })
      await textDiff.screenshot({
        path: `qa-artifacts/reference/text-diff-view-${width}.png`,
        animations: 'disabled',
      })
    }
    const deltaPage = await browser.newPage({ colorScheme: 'light', viewport: { width: 1280, height: 720 } })
    await deltaPage.goto(`${delta}/`)
    await deltaPage.locator('#text-a').fill(sampleLeft)
    await deltaPage.locator('#text-b').fill(sampleRight)
    await deltaPage.locator('#compare-button').click()
    await expect(deltaPage.getByText(/changes/i).first()).toBeVisible()
    await deltaPage.screenshot({ path: 'qa-artifacts/reference/delta-text.png', animations: 'disabled' })
    await deltaPage.locator('[data-app-mode="folder"]').click()
    await deltaPage.locator('#folder-input-a').setInputFiles(folders[0])
    await deltaPage.locator('#folder-input-b').setInputFiles(folders[1])
    await deltaPage.locator('#folder-compare-button').click()
    await expect(deltaPage.locator('#folder-diff-list')).toContainText('app.conf')
    await deltaPage.screenshot({ path: 'qa-artifacts/reference/delta-folders.png', animations: 'disabled' })
    console.log(
      'Ran Text Diff View with the same text fixture and Delta with the same text and folder fixtures.',
    )
  }
} finally {
  await browser.close()
  for (const server of processes) server.kill()
}
