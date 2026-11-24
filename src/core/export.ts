import { applyPatch, createTwoFilesPatch, diffChars, parsePatch } from 'diff'
import { checkText, compare, lines, type ComparisonOptions, type Document } from './text'

export function safePath(name: string): string {
  const path = name.replace(/\\/g, '/')
  if (
    path.length === 0 ||
    path.length > 512 ||
    [...path].some(unsafeCharacter) ||
    path.split('/').some((piece) => !piece || piece === '.' || piece === '..')
  ) {
    throw new Error('A filename contains an unsafe path. Rename it before exporting.')
  }
  return path
}
function unsafeCharacter(character: string) {
  return character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || ':"*?<>|'.includes(character)
}
export function makePatch(left: string | null, right: string | null, name: string, context = 3): string {
  if (left === right) return ''
  const file = safePath(name)
  // Git requires quoting backslashes and double quotes; safePath rejects both in the final path.
  const oldName = left === null ? '/dev/null' : `a/${file}`
  const newName = right === null ? '/dev/null' : `b/${file}`
  const mode = left === null ? 'new file mode 100644\n' : right === null ? 'deleted file mode 100644\n' : ''
  const validName =
    /^[\x20-\x7e]+$/.test(file) && !file.includes(' ')
      ? file
      : `"${Array.from(new TextEncoder().encode(file), (byte) =>
          byte < 32 || byte > 126 ? `\\${byte.toString(8).padStart(3, '0')}` : String.fromCharCode(byte),
        ).join('')}"`
  function gitHeader(prefix: string): string {
    return validName.startsWith('"') ? `"${prefix}${validName.slice(1)}` : prefix + file
  }
  const header = `diff --git ${gitHeader('a/')} ${gitHeader('b/')}\n${mode}`
  if (!(left ?? '') && !(right ?? '')) return header
  const standard = createTwoFilesPatch(oldName, newName, left ?? '', right ?? '', undefined, undefined, {
    context,
    timeout: 1600,
  })
  if (!standard) throw new Error('The patch exceeded its time budget.')
  return (
    header +
    standard
      .slice(standard.indexOf('--- '))
      .replace(
        /^--- .*\n\+\+\+ .*\n/,
        () =>
          `--- ${left === null ? '/dev/null' : gitHeader('a/')}\n+++ ${right === null ? '/dev/null' : gitHeader('b/')}\n`,
      )
  )
}
export function previewPatch(content: string, patch: string): string {
  checkText(patch)
  const patches = parsePatch(patch)
  if (patches.length !== 1 || !patches[0].hunks.length)
    throw new Error('Choose a patch with one file and at least one hunk.')
  const output = applyPatch(content, patches[0], { autoConvertLineEndings: false, fuzzFactor: 0 })
  if (output === false) throw new Error('At least one patch hunk did not match exactly.')
  checkText(output)
  return output
}

export function escapeHTML(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return value.replace(/[&<>"']/g, (char) => entities[char])
}
export function reportPage(title: string, body: string): string {
  return (
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none';style-src 'unsafe-inline';base-uri 'none';form-action 'none'\">" +
    '<title>' +
    escapeHTML(title) +
    '</title><style>body{font:14px system-ui;margin:1.5rem;color:#182236}' +
    'table{width:100%;table-layout:fixed;border-collapse:collapse}td{font:13px monospace;white-space:pre-wrap;' +
    'overflow-wrap:anywhere;border-bottom:1px solid #e5e7eb;vertical-align:top;padding:4px}td.num{width:4em;text-align:right;color:#52627a}' +
    '.del{background:#ffe4e6}.add{background:#dcfce7}del{background:#ffafb8}ins{background:#a4e6b6;text-decoration:none}' +
    'details{margin:.25rem 0}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>' +
    '<h1>' +
    escapeHTML(title) +
    '</h1>' +
    body +
    '</html>'
  )
}

export function textReport(
  left: Document,
  right: Document,
  options: ComparisonOptions,
  unified = false,
): string {
  const diff = compare(left.text, right.text)
  const a = lines(left.text)
  const b = lines(right.text)
  const title = `${left.name} → ${right.name}`
  if (unified)
    return reportPage(
      title,
      `<pre>${escapeHTML(makePatch(left.text, right.text, 'comparison.txt', options.context))}</pre>`,
    )
  const body: string[] = []
  const row = (i: number | null, j: number | null, av: string, bv: string, changed = false) =>
    '<tr><td class="num">' +
    (i === null ? '' : i + 1) +
    '</td><td class="' +
    (changed && i !== null ? 'del' : '') +
    '">' +
    av +
    '</td><td class="num">' +
    (j === null ? '' : j + 1) +
    '</td><td class="' +
    (changed && j !== null ? 'add' : '') +
    '">' +
    bv +
    '</td></tr>'
  let ai = 0
  let bi = 0
  function unchanged(until: number, trailing = false) {
    const count = until - ai
    const keep = trailing ? options.context : options.context * 2
    const rows = Array.from({ length: count }, (_, i) =>
      row(ai + i, bi + i, escapeHTML(a[ai + i]), escapeHTML(b[bi + i])),
    )
    const table = (items: string[]) => `<table>${items.join('')}</table>`
    if (count > keep + 1) {
      body.push(table(rows.slice(0, options.context)))
      body.push(
        '<details><summary>' +
          (count - keep) +
          ' unchanged lines</summary>' +
          table(rows.slice(options.context, trailing ? count : count - options.context)) +
          '</details>',
      )
      if (!trailing && options.context) body.push(table(rows.slice(-options.context)))
    } else if (count) body.push(table(rows))
    ai += count
    bi += count
  }
  for (const block of diff.blocks) {
    unchanged(block.a)
    const rows = []
    for (let i = 0; i < Math.max(block.aCount, block.bCount); i++) {
      const av = i < block.aCount ? a[block.a + i] : ''
      const bv = i < block.bCount ? b[block.b + i] : ''
      const highlights = av.length + bv.length < 2000 ? diffChars(av, bv, { timeout: 20 }) : undefined
      const text = (removed: boolean) =>
        highlights
          ?.filter((item) => (removed ? !item.added : !item.removed))
          .map((item) => {
            const escaped = escapeHTML(item.value)
            return item.added ? `<ins>${escaped}</ins>` : item.removed ? `<del>${escaped}</del>` : escaped
          })
          .join('') ?? escapeHTML(removed ? av : bv)
      rows.push(
        row(
          i < block.aCount ? block.a + i : null,
          i < block.bCount ? block.b + i : null,
          text(true),
          text(false),
          true,
        ),
      )
    }
    body.push(`<table>${rows.join('')}</table>`)
    ai = block.a + block.aCount
    bi = block.b + block.bCount
  }
  unchanged(a.length, true)
  const active = Object.entries(options).filter(
    ([key, val]) => key !== 'context' && (Array.isArray(val) ? val.length : val),
  )
  return reportPage(
    title,
    '<p>' +
      diff.added +
      ' added · ' +
      diff.removed +
      ' removed · ' +
      diff.blocks.length +
      ' changed blocks · ' +
      new Date().toISOString() +
      '</p><p>Workspace options (report compares original text) ' +
      escapeHTML(
        active.map(([key, val]) => (Array.isArray(val) ? `${key} ${val.join(', ')}` : key)).join(' · ') ||
          'None',
      ) +
      '</p>' +
      body.join(''),
  )
}

export function download(name: string, content: BlobPart, type = 'text/plain;charset=utf-8'): void {
  const leaf =
    [...(name.split(/[\\/]/).at(-1) ?? '')]
      .map((character) => (unsafeCharacter(character) ? '_' : character))
      .join('') || 'comparison.txt'
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = leaf
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function copy(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      /* try the HTTP fallback */
    }
  }
  const active = document.activeElement
  const input = document.createElement('textarea')
  input.value = text
  input.style.cssText = 'position:fixed;left:-9999px'
  document.body.append(input)
  input.select()
  const success = document.execCommand('copy')
  input.remove()
  if (active instanceof HTMLElement) active.focus()
  if (!success) throw new Error('Clipboard access is unavailable. Use the download option.')
}
