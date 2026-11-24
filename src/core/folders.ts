import { sha256 } from '@noble/hashes/sha2.js'
import { zipSync } from 'fflate'
import ignore from 'ignore'
import { escapeHTML, makePatch, reportPage, safePath } from './export'
import { checkText, MAX_TEXT } from './text'

const chunkSize = 1024 * 1024
const maxFolderBytes = 8 * 1024 ** 3
const maxExportBytes = 64 * 1024 ** 2
const maxFiles = 25_000
export const ignorePreset =
  '.git/\nnode_modules/\ndist/\nbuild/\n.cache/\n.venv/\n.idea/\n.vscode/\n__pycache__/'
export type PickedFolder = { name: string; entries: Map<string, File | null>; unreadable?: string[] }
export type PathStatus = 'left' | 'right' | 'modified' | 'identical' | 'error'
export type FileDetails = { size: number; hash: string; kind: 'text' | 'binary' | 'image' }
export type FolderEntry = {
  path: string
  status: PathStatus
  left?: FileDetails
  right?: FileDetails
  directory?: boolean
}
export type FolderResult = { entries: FolderEntry[]; skipped: number; bytes: number }
export type Filters = { includes: string; excludes: string; extensions: string }

export function folderFromInput(input: FileList | File[]): PickedFolder {
  const entries: PickedFolder['entries'] = new Map()
  let name = ''
  for (const file of input) {
    const [first, ...parts] = file.webkitRelativePath.split('/')
    if (!first || !parts.length) throw new Error('Choose a directory using the folder picker.')
    name = first
    entries.set(safePath(parts.join('/')), file)
  }
  return { name, entries }
}
export async function folderFromHandle(root: FileSystemDirectoryHandle): Promise<PickedFolder> {
  const entries: PickedFolder['entries'] = new Map()
  const unreadable: string[] = []
  type IterableDirectory = FileSystemDirectoryHandle & {
    values(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>
  }
  async function walk(directory: FileSystemDirectoryHandle, prefix = '') {
    for await (const entry of (directory as IterableDirectory).values()) {
      const name = safePath(prefix + entry.name)
      if (entries.size >= maxFiles) throw new Error('Folder selection exceeds 25,000 entries.')
      if (entry.kind === 'directory') {
        entries.set(`${name}/`, null)
        await walk(entry as FileSystemDirectoryHandle, `${name}/`)
      } else {
        try {
          entries.set(name, await (entry as FileSystemFileHandle).getFile())
        } catch {
          entries.set(name, null)
          unreadable.push(name)
        }
      }
    }
  }
  await walk(root)
  const paths = new Set(entries.keys())
  for (const entry of paths) {
    const separator = entry.slice(0, -1).lastIndexOf('/')
    if (separator !== -1) paths.delete(entry.slice(0, separator + 1))
  }
  return { name: root.name, entries: new Map([...entries].filter(([key]) => paths.has(key))), unreadable }
}
const rasterTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  ico: 'image/x-icon',
}
export function imageType(name: string): string | undefined {
  const ext = name.split('.').at(-1)?.toLowerCase() ?? ''
  return Object.hasOwn(rasterTypes, ext) ? rasterTypes[ext] : undefined
}
function utf16(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | undefined {
  if (bytes[0] === 255 && bytes[1] === 254) return 'utf-16le'
  if (bytes[0] === 254 && bytes[1] === 255) return 'utf-16be'
}
export function fileKind(sample: Uint8Array, name: string): FileDetails['kind'] {
  if (imageType(name)) return 'image'
  if (utf16(sample)) return 'text'
  if (
    sample.some(
      (byte) => byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13 && byte !== 12),
    )
  )
    return 'binary'
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream: true })
    return 'text'
  } catch {
    return 'binary'
  }
}
export async function readText(file?: File | null): Promise<string> {
  if (!file) return ''
  if (file.size > MAX_TEXT) throw new Error('The file exceeds the 8 MiB editor limit.')
  const data = new Uint8Array(await file.arrayBuffer())
  if (fileKind(data.subarray(0, 8192), file.name) !== 'text')
    throw new Error('This file is binary or its encoding is unsupported.')
  try {
    const text = new TextDecoder(utf16(data) ?? 'utf-8', { fatal: true, ignoreBOM: true }).decode(data)
    checkText(text)
    return text
  } catch (error) {
    if (error instanceof TypeError)
      throw new Error('Only valid UTF-8 or BOM-marked UTF-16 text is supported.')
    throw error
  }
}
export async function describeFile(file: File, aborted: () => boolean = () => false): Promise<FileDetails> {
  const hash = sha256.create()
  let kind: FileDetails['kind'] = 'text'
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let utf8 = false
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    if (aborted()) throw new Error('Folder scan cancelled.')
    const bytes = new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer())
    if (!offset) {
      kind = fileKind(bytes.subarray(0, 8192), file.name)
      utf8 = kind === 'text' && !utf16(bytes)
    }
    if (utf8) {
      try {
        decoder.decode(bytes, { stream: offset + chunkSize < file.size })
      } catch {
        kind = 'binary'
        utf8 = false
      }
    }
    hash.update(bytes)
  }
  return {
    size: file.size,
    hash: Array.from(hash.digest(), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    kind,
  }
}
function filterFunction(filters: Filters): (path: string) => boolean {
  for (const patterns of [filters.includes, filters.excludes, filters.extensions]) {
    if (patterns.length > 4000) throw new Error('Filter text exceeds 4,000 characters.')
  }
  const include = filters.includes.trim() ? ignore().add(filters.includes) : null
  const exclude = filters.excludes.trim() ? ignore().add(filters.excludes) : null
  const extensions = filters.extensions
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((x) => x.toLowerCase().replace(/^\./, ''))
  return (path) =>
    (!include || include.ignores(path)) &&
    (!exclude || !exclude.ignores(path)) &&
    (!extensions.length ||
      path.endsWith('/') ||
      extensions.includes(path.split('.').at(-1)?.toLowerCase() ?? ''))
}
export async function scanFolders(
  a: PickedFolder,
  b: PickedFolder,
  filters: Filters,
  progress: (value: number, total: number) => void,
  aborted: () => boolean = () => false,
): Promise<FolderResult> {
  const accepted = filterFunction(filters)
  const all = [...new Set([...a.entries.keys(), ...b.entries.keys()])].sort()
  if (all.length > maxFiles) throw new Error('Choose directories with at most 25,000 combined entries.')
  const paths = all.filter(accepted)
  const totalBytes = paths.reduce(
    (size, path) => size + (a.entries.get(path)?.size ?? 0) + (b.entries.get(path)?.size ?? 0),
    0,
  )
  if (totalBytes > maxFolderBytes)
    throw new Error('The selected files exceed 8 GiB. Use filters to scan smaller groups.')
  const entries = new Array<FolderEntry>(paths.length)
  const unreadable = new Set([...(a.unreadable ?? []), ...(b.unreadable ?? [])])
  let cursor = 0
  let finished = 0
  let bytes = 0
  progress(0, paths.length)
  async function worker() {
    while (!aborted() && cursor < paths.length) {
      const index = cursor++
      const path = paths[index]
      const leftFile = a.entries.get(path)
      const rightFile = b.entries.get(path)
      try {
        if (unreadable.has(path)) throw new Error('Unavailable file.')
        const left = leftFile ? await describeFile(leftFile, aborted) : undefined
        const right = rightFile ? await describeFile(rightFile, aborted) : undefined
        const status = !a.entries.has(path)
          ? 'right'
          : !b.entries.has(path)
            ? 'left'
            : left?.hash === right?.hash
              ? 'identical'
              : 'modified'
        entries[index] = { path, left, right, status, directory: leftFile === null || rightFile === null }
        bytes += (left?.size ?? 0) + (right?.size ?? 0)
      } catch {
        entries[index] = { path, status: 'error' }
      }
      finished++
      if (finished % 20 === 0 || finished === paths.length) progress(finished, paths.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, paths.length) }, worker))
  if (aborted()) throw new Error('Folder scan cancelled.')
  return { entries, skipped: all.length - paths.length, bytes }
}
export const statusLabels: Record<PathStatus, string> = {
  left: 'Only original',
  right: 'Only modified',
  modified: 'Modified',
  identical: 'Identical',
  error: 'Read failed',
}
export function folderSummary(result: FolderResult): string {
  return [
    `${result.entries.length} entries, ${result.skipped} excluded, ${result.bytes} bytes read`,
    ...result.entries.map((entry) => `${statusLabels[entry.status]}\t${entry.path}`),
  ].join('\n')
}
export function folderReport(result: FolderResult): string {
  return reportPage('Folder comparison', `<pre>${escapeHTML(folderSummary(result))}</pre>`)
}
function exportable(result: FolderResult) {
  return result.entries.filter(
    (entry) => !entry.directory && entry.status !== 'identical' && entry.status !== 'error',
  )
}
export async function folderPatch(
  result: FolderResult,
  a: PickedFolder,
  b: PickedFolder,
  edits: Map<string, string>,
  context: number,
) {
  const output: string[] = []
  let inputBytes = 0
  for (const { path, left, right } of exportable(result)) {
    if ((left && left.kind !== 'text') || (right && right.kind !== 'text')) continue
    inputBytes += (left?.size ?? 0) + (right?.size ?? 0) + (edits.get(path)?.length ?? 0) * 2
    if (inputBytes > maxExportBytes)
      throw new Error('Folder patch inputs exceed 64 MiB. Narrow the scan using filters.')
    const before = left ? await readText(a.entries.get(path)) : null
    const after = edits.get(path) ?? (right ? await readText(b.entries.get(path)) : null)
    output.push(makePatch(before, after, path, context))
  }
  return output.join('')
}
export async function folderZip(result: FolderResult, b: PickedFolder, edits: Map<string, string>) {
  const output: Record<string, Uint8Array> = Object.create(null)
  let bytes = 0
  for (const { path } of exportable(result)) {
    const file = b.entries.get(path)
    const text = edits.get(path)
    if (text === undefined && !file) continue
    bytes += text === undefined ? (file?.size ?? 0) : text.length * 3
    if (bytes > maxExportBytes) throw new Error('ZIP input exceeds 64 MiB. Narrow the scan using filters.')
    output[safePath(path)] =
      text === undefined && file ? new Uint8Array(await file.arrayBuffer()) : new TextEncoder().encode(text)
  }
  return zipSync(output, { level: 0 })
}
