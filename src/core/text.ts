import { diffArrays } from 'diff'

export type Side = 'left' | 'right'
export type Document = { name: string; text: string }
export type ComparisonOptions = {
  whitespace: boolean
  leading: boolean
  trailing: boolean
  blank: boolean
  case: boolean
  eol: boolean
  unicode: boolean
  json: boolean
  jsonKeys: boolean
  regex: string[]
  context: number
}

export const defaults: ComparisonOptions = {
  whitespace: false,
  leading: false,
  trailing: false,
  blank: false,
  case: false,
  eol: false,
  unicode: false,
  json: false,
  jsonKeys: false,
  regex: [],
  context: 3,
}
export const MAX_TEXT = 8 * 1024 * 1024
export const MAX_LINES = 200_000

export type Block = { a: number; b: number; aCount: number; bCount: number; whitespace?: true }
export type Comparison = {
  blocks: Block[]
  removed: number
  added: number
  leftLines: number
  rightLines: number
}

export function lines(text: string): string[] {
  return text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? []
}
export function ending(text: string): string {
  return text.match(/\r\n|\r|\n/)?.[0] ?? '\n'
}
export function displayText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n')
}
export function fromEditor(text: string, previous: string): string {
  return (previous.startsWith('\uFEFF') ? '\uFEFF' : '') + text.replace(/\n/g, ending(previous))
}
export function applyEditorChanges(
  previous: string,
  changes: { rangeOffset: number; rangeLength: number; text: string }[],
) {
  const newline = ending(previous)
  let offset = previous.startsWith('\uFEFF') ? 1 : 0
  let displayOffset = 0
  const output = [previous.slice(0, offset)]
  function advance(until: number) {
    while (displayOffset < until && offset < previous.length) {
      offset += previous[offset] === '\r' && previous[offset + 1] === '\n' ? 2 : 1
      displayOffset++
    }
  }
  for (const change of [...changes].sort((a, b) => a.rangeOffset - b.rangeOffset)) {
    const before = offset
    advance(change.rangeOffset)
    output.push(previous.slice(before, offset), change.text.replace(/\r\n|\r|\n/g, newline))
    advance(change.rangeOffset + change.rangeLength)
  }
  output.push(previous.slice(offset))
  return output.join('')
}
export function checkText(text: string): void {
  const fail = () => {
    throw new Error('Text exceeds the 8 MiB or 200,000-line workspace limit.')
  }
  if (text.length > MAX_TEXT) fail()
  if (text.length <= MAX_LINES) return
  const newline = /\r\n|\r|\n/g
  let count = 0
  while (newline.exec(text)) {
    count++
    if (count > MAX_LINES || (count === MAX_LINES && newline.lastIndex < text.length)) fail()
  }
}
export function prettyJSON(text: string, sort = false): string {
  const content = text.replace(/^\uFEFF/, '')
  JSON.parse(content)
  const tokens = content.match(/"(?:[^"\\]|\\.)*"|[^\s",:[\]{}]+|[,:{}[\]]/gu) ?? []
  let cursor = 0
  function node(depth: number): string {
    if (depth > 100) throw new Error('JSON nesting exceeds 100 levels.')
    const token = tokens[cursor++]
    if (token !== '[' && token !== '{') return token
    const object = token === '{'
    const close = object ? '}' : ']'
    if (tokens[cursor] === close) {
      cursor++
      return token + close
    }
    const values: { key: string; value: string }[] = []
    const keys = new Set<string>()
    do {
      const key = object ? tokens[cursor++] : ''
      if (object) cursor++
      const value = node(depth + 1)
      const label: string = key ? JSON.parse(key) : ''
      if (object && sort && keys.has(label)) throw new Error('Cannot sort an object with duplicate keys.')
      keys.add(label)
      values.push({ key: label, value: object ? `${key}: ${value}` : value })
      if (tokens[cursor++] !== ',') break
    } while (cursor < tokens.length)
    if (object && sort) values.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    const indent = `\n${'  '.repeat(depth + 1)}`
    return `${token + indent + values.map((item) => item.value).join(`,${indent}`)}\n${'  '.repeat(depth)}${close}`
  }
  return node(0)
}

export function compare(left: string, right: string, options: ComparisonOptions = defaults): Comparison {
  return compareLines(left, right, options, false)
}

export function compareWorkspace(
  left: string,
  right: string,
  options: ComparisonOptions = defaults,
): Comparison {
  return compareLines(left, right, options, true)
}

function compareLines(
  left: string,
  right: string,
  options: ComparisonOptions,
  alignWhitespace: boolean,
): Comparison {
  checkText(left)
  checkText(right)
  const aLines = lines(left)
  const bLines = lines(right)
  const regex = options.regex.map((rule) => new RegExp(rule, 'u'))
  if (options.json || options.jsonKeys) {
    try {
      if (prettyJSON(left, options.jsonKeys) === prettyJSON(right, options.jsonKeys)) {
        return { blocks: [], removed: 0, added: 0, leftLines: aLines.length, rightLines: bLines.length }
      }
    } catch {
      // Invalid JSON still participates in the ordinary line comparison.
    }
  }
  function normalize(records: string[]) {
    return records.flatMap((record, index) => {
      const eol = record.match(/(?:\r\n|\r|\n)$/)?.[0] ?? ''
      let key = record.slice(0, record.length - eol.length)
      if ((options.blank && !key.trim()) || regex.some((rule) => rule.test(key))) return []
      if (options.whitespace) key = key.replace(/\s/gu, '')
      if (options.leading) key = key.trimStart()
      if (options.trailing) key = key.trimEnd()
      if (options.case) key = key.toLowerCase()
      if (options.unicode) key = key.normalize('NFC')
      const ending = options.eol && eol ? '\n' : eol
      const alignment = alignWhitespace ? key.replace(/^[ \t]+|[ \t]+$/g, '') : key
      return [{ index, key: key + ending, alignment: alignment + ending }]
    })
  }
  const a = normalize(aLines)
  const b = normalize(bLines)
  const changes = diffArrays(a, b, { comparator: (x, y) => x.alignment === y.alignment, timeout: 1800 })
  if (!changes) throw new Error('Comparison exceeded its time budget. Compare smaller sections.')
  const blocks: Block[] = []
  let ai = 0
  let bi = 0
  let removed = 0
  let added = 0
  let startA = 0
  let startB = 0
  function finish() {
    let x = startA
    let y = startB
    while (x < ai || y < bi) {
      const fromA = a[x]?.index ?? aLines.length
      const fromB = b[y]?.index ?? bLines.length
      let countA = Math.min(1, ai - x)
      let countB = Math.min(1, bi - y)
      while (x + countA < ai || y + countB < bi) {
        const nextA = x + countA < ai
        const nextB = y + countB < bi
        if (
          (nextA && a[x + countA].index !== fromA + countA) ||
          (nextB && b[y + countB].index !== fromB + countB)
        )
          break
        if (nextA) countA++
        if (nextB) countB++
      }
      blocks.push({ a: fromA, b: fromB, aCount: countA, bCount: countB })
      x += countA
      y += countB
    }
  }
  for (const change of changes) {
    if (!change.added && !change.removed) {
      finish()
      if (alignWhitespace) {
        for (let offset = 0; offset < change.count; offset++) {
          const leftLine = a[ai + offset]
          const rightLine = b[bi + offset]
          if (leftLine.key === rightLine.key) continue
          const previous = blocks.at(-1)
          if (
            previous?.whitespace &&
            leftLine.index === previous.a + previous.aCount &&
            rightLine.index === previous.b + previous.bCount
          ) {
            previous.aCount++
            previous.bCount++
          } else {
            blocks.push({ a: leftLine.index, b: rightLine.index, aCount: 1, bCount: 1, whitespace: true })
          }
        }
      }
      ai += change.count
      bi += change.count
      startA = ai
      startB = bi
      continue
    }
    if (change.removed) {
      ai += change.count
      removed += change.count
    } else {
      bi += change.count
      added += change.count
    }
  }
  finish()
  return { blocks, removed, added, leftLines: aLines.length, rightLines: bLines.length }
}

export function whitespaceRanges(
  left: string,
  right: string,
  options: Pick<ComparisonOptions, 'leading' | 'trailing'>,
) {
  function edges(line: string) {
    const leading = line.match(/^[ \t]*/)?.[0] ?? ''
    const trailing = leading.length < line.length ? (line.match(/[ \t]*$/)?.[0] ?? '') : ''
    return { leading, trailing }
  }
  const a = edges(left)
  const b = edges(right)
  const ranges: Record<Side, { start: number; end: number }[]> = { left: [], right: [] }
  for (const edge of ['leading', 'trailing'] as const) {
    if (options[edge] || a[edge] === b[edge]) continue
    const original = a[edge]
    const modified = b[edge]
    const length = Math.min(original.length, modified.length)
    let start = 0
    while (start < length && original[start] === modified[start]) start++
    let end = 0
    while (end < length - start && original.at(-1 - end) === modified.at(-1 - end)) end++
    for (const [side, text, whitespace] of [
      ['left', left, original],
      ['right', right, modified],
    ] as const) {
      const offset = edge === 'leading' ? 0 : text.length - whitespace.length
      if (start < whitespace.length - end)
        ranges[side].push({ start: offset + start, end: offset + whitespace.length - end })
    }
  }
  return ranges
}

export function mergeBlocks(left: string, right: string, target: Side, blocks: Block[]): string {
  const incoming = lines(target === 'left' ? right : left)
  const original = target === 'left' ? left : right
  const outgoing = lines(original)
  const newline = original ? ending(original) : ending(target === 'left' ? right : left)
  const ordered = [...blocks].sort((first, second) => first.a - second.a || first.b - second.b)
  const output: string[] = []
  let previous = 0
  for (const { a, b, aCount, bCount } of ordered) {
    const [position, count, source, length] =
      target === 'left' ? [a, aCount, b, bCount] : [b, bCount, a, aCount]
    if (
      position < previous ||
      count < 0 ||
      position + count > outgoing.length ||
      source < 0 ||
      source + length > incoming.length
    ) {
      throw new Error('This change is no longer valid for the selected text.')
    }
    const sourceLines = incoming.slice(source, source + length)
    const needsLineEndingChange =
      count === length &&
      sourceLines.every((line, index) => displayText(line) === displayText(outgoing[position + index]))
    output.push(outgoing.slice(previous, position).join(''))
    output.push(
      needsLineEndingChange ? sourceLines.join('') : sourceLines.join('').replace(/\r\n|\r|\n/g, newline),
    )
    previous = position + count
  }
  output.push(outgoing.slice(previous).join(''))
  return output
    .filter(Boolean)
    .reduce(
      (result, segment) =>
        result && !/[\r\n]$/.test(result) ? result + newline + segment : result + segment,
      '',
    )
}

export function detectLanguage(document: Document): string {
  const name = document.name.split('/').at(-1)?.toLowerCase() ?? ''
  if (name.startsWith('dockerfile')) return 'dockerfile'
  if (name.includes('nginx')) return 'nginx'
  const ext: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    jsx: 'javascript',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    html: 'html',
    htm: 'html',
    md: 'markdown',
    py: 'python',
    php: 'php',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    ps1: 'powershell',
    ini: 'ini',
    toml: 'toml',
    nginx: 'nginx',
    cfg: 'ini',
    css: 'css',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
  }
  const known = Object.hasOwn(ext, name.split('.').at(-1) ?? '')
    ? ext[name.split('.').at(-1) ?? '']
    : undefined
  if (known) return known
  const sample = document.text.trimStart()
  if (sample.startsWith('{') || sample.startsWith('[')) {
    try {
      JSON.parse(sample)
      return 'json'
    } catch {
      /* use plain text */
    }
  }
  if (/^<\?xml\b/i.test(sample)) return 'xml'
  if (/^<!doctype html\b|^<html\b/i.test(sample)) return 'html'
  return 'plaintext'
}
