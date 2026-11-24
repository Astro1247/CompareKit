import { checkText, defaults, type ComparisonOptions, type Document } from './text'
import { mergeLayout, type MergeState } from './three-way'

export type Workspace = { left: Document; right: Document; base: Document }
export const defaultDocumentNames = { left: 'Original', right: 'Modified', base: 'Base' }
export type Session = Workspace & {
  version: 1
  title: string
  options: ComparisonOptions
  bookmarks: number[]
  mode: 'text' | 'three'
  merge?: MergeState
}
export const empty = (): Workspace => ({
  left: { name: defaultDocumentNames.left, text: '' },
  right: { name: defaultDocumentNames.right, text: '' },
  base: { name: defaultDocumentNames.base, text: '' },
})
export const blankSession = (): Session => ({
  ...empty(),
  version: 1,
  title: 'Untitled comparison',
  options: { ...defaults },
  bookmarks: [],
  mode: 'text',
})
export const MAX_SESSION = 28 * 1024 * 1024
const MAX_FRAGMENT = 24_000
const PREFIX = '#ck1='

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || !value || Array.isArray(value))
    throw new Error('Invalid comparison session.')
  return value as Record<string, unknown>
}
function document(value: unknown): Document {
  const { name, text } = object(value)
  if (typeof text !== 'string' || typeof name !== 'string' || name.length > 512)
    throw new Error('Invalid document.')
  checkText(text)
  return { name, text }
}
export function parseSession(serialized: string): Session {
  if (serialized.length > MAX_SESSION) throw new Error('Comparison session is too large.')
  const input = object(JSON.parse(serialized))
  if (input.version !== 1 || typeof input.title !== 'string' || input.title.length > 120) {
    throw new Error('Unsupported comparison session version or title.')
  }
  const fields = object(input.options)
  const options = { ...defaults }
  for (const key of [
    'whitespace',
    'leading',
    'trailing',
    'blank',
    'case',
    'eol',
    'unicode',
    'json',
    'jsonKeys',
  ] as const) {
    options[key] = fields[key] === true
  }
  if (typeof fields.context === 'number' && Number.isInteger(fields.context)) {
    options.context = Math.max(0, Math.min(100, fields.context))
  }
  if (Array.isArray(fields.regex)) {
    if (fields.regex.length > 20 || fields.regex.some((x) => typeof x !== 'string' || x.length > 256)) {
      throw new Error('Invalid ignore rules.')
    }
    for (const expression of fields.regex) new RegExp(expression, 'u')
    options.regex = [...fields.regex]
  }
  let merge: MergeState | undefined
  if (input.merge !== undefined) {
    const data = object(input.merge)
    const entries = Object.entries(object(data.choices))
    if (entries.length > 10_000) throw new Error('Session has too many conflict resolutions.')
    const choices: MergeState['choices'] = {}
    // Older indexes refer to coarser hunks and can point at different lines in the new layout.
    for (const [id, value] of data.layout === mergeLayout ? entries : []) {
      if (!/^\d{1,6}$/.test(id)) throw new Error('Invalid conflict identifier.')
      const entry = object(value)
      if (typeof entry.manual === 'string') {
        checkText(entry.manual)
        choices[Number(id)] = { manual: entry.manual }
      } else if (
        entry.choice === 'A' ||
        entry.choice === 'B' ||
        entry.choice === 'Base' ||
        entry.choice === 'Both'
      ) {
        choices[Number(id)] = { choice: entry.choice }
      }
    }
    if (typeof data.result === 'string') checkText(data.result)
    merge =
      typeof data.result === 'string'
        ? { layout: mergeLayout, choices, result: data.result }
        : { layout: mergeLayout, choices }
  }
  return {
    version: 1,
    title: input.title,
    left: document(input.left),
    right: document(input.right),
    base: document(input.base),
    mode: input.mode === 'three' ? 'three' : 'text',
    options,
    bookmarks: Array.isArray(input.bookmarks)
      ? input.bookmarks.slice(0, 1000).filter((item) => Number.isInteger(item) && item >= 0 && item < 200_000)
      : [],
    ...(merge && { merge }),
  }
}

export async function encodeShare(session: Session): Promise<string> {
  const data = JSON.stringify(session)
  if (data.length > MAX_SESSION) throw new Error('Comparison is too large. Export it as JSON instead.')
  const compressed = await new Response(
    new Blob([data]).stream().pipeThrough(new CompressionStream('gzip')),
  ).arrayBuffer()
  if (compressed.byteLength > Math.floor((MAX_FRAGMENT * 3) / 4)) {
    throw new Error('Comparison is too large for a share link. Export it as JSON instead.')
  }
  const encoded = btoa(String.fromCharCode(...new Uint8Array(compressed)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return PREFIX + encoded
}
export async function decodeShare(fragment: string): Promise<Session> {
  const encoded = fragment.slice(PREFIX.length)
  if (!fragment.startsWith(PREFIX) || encoded.length > MAX_FRAGMENT || !/^[\w-]+$/.test(encoded)) {
    throw new Error('Invalid or oversized share link.')
  }
  const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), (char) =>
    char.charCodeAt(0),
  )
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let length = 0
  let output = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) return parseSession(output + decoder.decode())
      length += value.length
      if (length > MAX_SESSION) throw new Error('Decompressed comparison is too large.')
      output += decoder.decode(value, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
