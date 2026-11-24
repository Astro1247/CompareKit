import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { diffChars } from 'diff'
import { unzipSync } from 'fflate'
import { makePatch, previewPatch, safePath, textReport } from '../src/core/export'
import {
  describeFile,
  fileKind,
  folderPatch,
  folderZip,
  type PickedFolder,
  readText,
  scanFolders,
} from '../src/core/folders'
import { WorkspaceHistory } from '../src/core/history'
import { alignScrollLine } from '../src/core/scroll-alignment'
import { blankSession, decodeShare, encodeShare, parseSession } from '../src/core/session'
import {
  applyEditorChanges,
  compare,
  compareWorkspace,
  defaults,
  displayText,
  fromEditor,
  lines,
  mergeBlocks,
  prettyJSON,
  whitespaceRanges,
} from '../src/core/text'
import { mergeLayout, mergeResult, renderMerge, threeWay } from '../src/core/three-way'
import { base, merged, versionA, versionB } from './fixtures/three-way'
import { whitespaceModified, whitespaceOriginal } from './fixtures/whitespace'

test('two-way workspace isolates changed whitespace from real additions and preserves merge ranges', () => {
  const diff = compareWorkspace(whitespaceOriginal, whitespaceModified)
  assert.deepEqual(diff.blocks, [
    { a: 1, b: 1, aCount: 0, bCount: 1 },
    { a: 1, b: 2, aCount: 5, bCount: 5, whitespace: true },
  ])
  assert.equal(diff.added, 1)
  assert.equal(diff.removed, 0)
  assert.equal(mergeBlocks(whitespaceOriginal, whitespaceModified, 'left', diff.blocks), whitespaceModified)
  assert.equal(mergeBlocks(whitespaceOriginal, whitespaceModified, 'right', diff.blocks), whitespaceOriginal)
  const ignored = compareWorkspace(whitespaceOriginal, whitespaceModified, { ...defaults, leading: true })
  assert.deepEqual(ignored.blocks, [diff.blocks[0]])
  assert.equal(compareWorkspace('x\r\n', 'x\n').blocks[0].whitespace, undefined)
  assert.equal(compareWorkspace('x y\n', 'x\ty\n').blocks[0].whitespace, undefined)
})

test('whitespace decorations only cover changed spaces and tabs', () => {
  assert.deepEqual(whitespaceRanges('  item\t', ' \t item\t ', defaults), {
    left: [],
    right: [
      { start: 1, end: 2 },
      { start: 8, end: 9 },
    ],
  })
  assert.deepEqual(whitespaceRanges('  item', '\titem', defaults), {
    left: [{ start: 0, end: 2 }],
    right: [{ start: 0, end: 1 }],
  })
  assert.deepEqual(whitespaceRanges('item', '\titem ', { ...defaults, leading: true }), {
    left: [],
    right: [{ start: 5, end: 6 }],
  })
})

test('two-way changes are reversible with empty inputs, duplicate and reordered lines, missing EOF newline and Unicode', () => {
  const samples = [
    ['', 'new'],
    ['old', ''],
    ['last', 'last\n'],
    ['a\nb\n', 'a\nnew\nb\n'],
    ['a\nb\nnew\n', 'a\nb\n'],
    ['a\na\nb\na\n', 'a\nb\na\na\n'],
    ['1\n2\n3\n4\n', '4\n3\n2\n1\n'],
    ['🦊\nї', '🦉\nє'],
    ['foo\r\nbar\r\n', 'foo\r\nbaz\r\n'],
    ['\uFEFFhello\n', '\uFEFFhi\n'],
  ]
  for (const [left, right] of samples) {
    const { blocks } = compare(left, right)
    assert.ok(blocks.length > 0)
    assert.equal(mergeBlocks(left, right, 'right', blocks), left)
    assert.equal(mergeBlocks(left, right, 'left', blocks), right)
  }
  const chars = diffChars('hello 🌍', 'hello 🌎')
  assert.deepEqual(
    chars?.filter((part) => part.added || part.removed).map((part) => part.value),
    ['🌍', '🌎'],
  )
})
test('merge touches only selected ranges and preserves the destination line-ending convention', () => {
  const left = 'same\r\nold\r\nsame\r\nother\r\n'
  const right = 'same\nnew\nsame\nanother\n'
  const { blocks } = compare(left, right, { ...defaults, eol: true })
  assert.equal(blocks.length, 2)
  assert.equal(mergeBlocks(left, right, 'left', blocks.slice(0, 1)), 'same\r\nnew\r\nsame\r\nother\r\n')
  assert.equal(mergeBlocks(left, right, 'right', blocks.slice(-1)), 'same\nnew\nsame\nother\n')
  assert.deepEqual(lines('a\r\nb\rc\n'), ['a\r\n', 'b\r', 'c\n'])
  assert.equal(
    fromEditor(displayText('\uFEFFone\r\ntwo\r\n'), '\uFEFFone\r\ntwo\r\n'),
    '\uFEFFone\r\ntwo\r\n',
  )
})
test('normalization ignores only requested differences and maps ranges to originals', () => {
  const left = 'Title\r\n\r\nGenerated: 123\r\nvalue = old\r\n  cafe\u0301\r\n'
  const right = 'title\nGenerated: 456\nvalue = new\ncafé   \n'
  const options = {
    ...defaults,
    blank: true,
    case: true,
    regex: ['^Generated:'],
    eol: true,
    leading: true,
    trailing: true,
    unicode: true,
  }
  const { blocks } = compare(left, right, options)
  assert.deepEqual(blocks, [{ a: 3, b: 2, aCount: 1, bCount: 1 }])
  assert.equal(mergeBlocks(left, right, 'left', blocks), left.replace('old', 'new'))
  assert.equal(compare('a\n', 'a', options).blocks.length, 1)
  assert.equal(compare(' A B \n', 'AB\n', { ...defaults, whitespace: true }).blocks.length, 0)
  assert.equal(
    compare('{"a": 1, "b": 2}', '{\n"b":2,"a":1}', { ...defaults, jsonKeys: true }).blocks.length,
    0,
  )
  assert.throws(() => compare('a', 'b', { ...defaults, regex: ['['] }), SyntaxError)
})
test('editor edits preserve mixed newlines and BOM outside changed ranges', () => {
  const previous = '\uFEFFline one\r\nline two\nlast\r'
  const next = applyEditorChanges(previous, [
    { rangeOffset: 14, rangeLength: 3, text: 'TWO' },
    { rangeOffset: 0, rangeLength: 4, text: 'LINE' },
  ])
  assert.equal(next, '\uFEFFLINE one\r\nline TWO\nlast\r')
  assert.equal(mergeBlocks('all\r\n', 'all\n', 'right', compare('all\r\n', 'all\n').blocks), 'all\r\n')
})
test('ignore rules preserve ignored lines between merged blocks and JSON formatting preserves precision', () => {
  const left = 'header\nleft-1\nGenerated: 123\nleft-2\nend\n'
  const right = 'header\nright-1\nGenerated: 456\nright-2\nend\n'
  const filtered = compare(left, right, { ...defaults, regex: ['^Generated:'] })
  assert.equal(filtered.blocks.length, 2)
  assert.equal(mergeBlocks(left, right, 'right', filtered.blocks), left.replace('123', '456'))
  assert.equal(mergeBlocks(left, right, 'left', filtered.blocks), right.replace('456', '123'))
  const json = '{"z":900719925474099387, "a":1e800, "x":[true, null, "escaped\\\""]}'
  assert.match(prettyJSON(json, true), /"z": 900719925474099387/)
  assert.match(prettyJSON(json, true), /"a": 1e800/)
  assert.equal(
    compare('{"id":9007199254740992}', '{"id":9007199254740993}', { ...defaults, json: true }).blocks.length,
    1,
  )
  assert.throws(() => prettyJSON('{"x":1,"x":2}', true), /duplicate/)
})
test('three-way merge resolves disjoint edits, overlaps, deletions, equal insertions and final newlines', () => {
  let parts = threeWay('a\nb\nc\n', 'A\nb\nc\n', 'a\nb\nC\n')
  assert.equal(mergeResult(parts, {}), 'A\nb\nC\n')
  parts = threeWay('', 'new line', 'new line')
  assert.equal(mergeResult(parts, {}), 'new line')
  parts = threeWay('', 'A', 'B')
  let conflict = parts.find((part) => typeof part !== 'string')
  assert.ok(conflict)
  assert.match(mergeResult(parts, {}), /<<<<<<< A/)
  assert.equal(mergeResult(parts, { [conflict.id]: { choice: 'Both' } }), 'A\nB')
  parts = threeWay('a\nb\nc\n', 'a\n', 'a\nB\nc\n')
  conflict = parts.find((part) => typeof part !== 'string')
  assert.ok(conflict)
  assert.equal(mergeResult(parts, { [conflict.id]: { choice: 'Base' } }), 'a\nb\nc\n')
  assert.equal(mergeResult(parts, { [conflict.id]: { manual: 'resolved\n' } }), 'a\nresolved\n')
  assert.equal(mergeResult(threeWay('x\n', 'x', 'x\n'), {}), 'x')
  assert.equal(mergeResult(threeWay('a\nb\n', 'a\nB\n', 'a\nX\nb\n'), {}), 'a\nX\nB\n')
})

test('scroll alignment preserves shared lines around insertions, deletions and expanded conflicts', () => {
  const ranges = [
    { base: { start: 3, count: 0 }, A: { start: 3, count: 4 }, result: { start: 3, count: 4 } },
    { base: { start: 8, count: 2 }, A: { start: 12, count: 0 }, result: { start: 12, count: 6 } },
  ]
  assert.equal(alignScrollLine(2.5, 'base', 'A', ranges), 2.5)
  assert.equal(alignScrollLine(3, 'base', 'A', ranges), 7)
  assert.equal(alignScrollLine(5.5, 'A', 'base', ranges), 3)
  assert.equal(alignScrollLine(9, 'base', 'result', ranges), 15)
  assert.equal(alignScrollLine(10, 'base', 'A', ranges), 12)
  assert.equal(alignScrollLine(21.5, 'result', 'base', ranges), 13.5)
})

test('three-way choices preserve adjacent one-sided settings and track pane ranges', () => {
  const parts = threeWay(base, versionA, versionB)
  const changes = parts.filter((part) => typeof part !== 'string')
  const [conflict] = changes
  assert.deepEqual(
    changes.map((change) => change.kind),
    ['conflict', 'B', 'B', 'B', 'B'],
  )
  assert.equal(conflict.base, '  host: 2.0.0.0\n')
  assert.equal(conflict.A, '  host: 3.0.0.0\n')
  assert.equal(conflict.B, '  host: 1.0.0.0\n')
  assert.deepEqual(conflict.ranges.base, { start: 1, count: 1 })
  const unresolved = renderMerge(parts, {})
  assert.deepEqual(unresolved.ranges.get(changes[1].id), { start: 8, count: 1 })
  assert.equal(mergeResult(parts, { [conflict.id]: { choice: 'A' } }), merged)
  assert.equal(mergeResult(parts, { [conflict.id]: { choice: 'B' } }), versionB)
  assert.equal(
    mergeResult(parts, { [conflict.id]: { choice: 'Base' } }),
    versionB.replace('1.0.0.0', '2.0.0.0'),
  )
  assert.equal(
    mergeResult(parts, { [conflict.id]: { manual: '  host: localhost' } }),
    versionB.replace('1.0.0.0', 'localhost'),
  )
})

test('three-way merge retains a conflict for insertions inside a competing edited block', () => {
  const parts = threeWay('header\nx\ny\nend\n', 'header\nX\nY\nend\n', 'header\nx\ninserted\ny\nend\n')
  const changes = parts.filter((part) => typeof part !== 'string')
  assert.equal(changes.length, 1)
  assert.equal(changes[0].kind, 'conflict')
})

test('older sessions preserve directly edited results without reusing stale conflict indexes', () => {
  const session = blankSession()
  const parsed = parseSession(
    JSON.stringify({
      ...session,
      merge: { choices: { 0: { choice: 'A' } }, result: 'edited by user' },
    }),
  )
  assert.deepEqual(parsed.merge, { layout: mergeLayout, choices: {}, result: 'edited by user' })
  session.merge = { layout: mergeLayout, choices: { 0: { choice: 'B' } } }
  assert.deepEqual(parseSession(JSON.stringify(session)), session)
})
test('undo checkpoints support atomic state, edit bursts, undo and redo invalidation', () => {
  const seed = blankSession()
  const first = { ...seed, left: { name: 'A', text: 'hello' } }
  const second = { ...first, left: { name: 'A', text: 'hello world' } }
  const swapped = { ...second, left: second.right, right: second.left }
  const history = new WorkspaceHistory()
  history.record(seed, 'left', 1)
  history.record(first, 'left', 200)
  history.record(second)
  assert.equal(history.undo(swapped), second)
  assert.equal(history.undo(second), seed)
  assert.equal(history.redo(seed), second)
  history.record(second)
  assert.equal(history.canRedo, false)
})
test('Git patches handle replacement, deletion, creation, empty files, unsafe names and EOF handling', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'comparekit-patch-'))
  try {
    const apply = (patch: string) =>
      execFileSync('git', ['-c', 'core.autocrlf=false', 'apply', '--whitespace=nowarn', '-'], {
        cwd: tmp,
        input: patch,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    const left = 'one\nold ending'
    const right = 'one\nnew ending\n'
    await writeFile(join(tmp, 'λ data.txt'), left)
    await writeFile(join(tmp, 'delete.txt'), 'gone\r\n')
    await writeFile(join(tmp, 'empty-old'), '')
    const patch =
      makePatch(left, right, 'λ data.txt') +
      makePatch(null, 'added\n', 'new.txt') +
      makePatch('gone\r\n', null, 'delete.txt') +
      makePatch(null, '', 'empty-new') +
      makePatch('', null, 'empty-old')
    apply(patch)
    assert.equal(await readFile(join(tmp, 'λ data.txt'), 'utf8'), right)
    assert.equal(await readFile(join(tmp, 'new.txt'), 'utf8'), 'added\n')
    assert.equal(await readFile(join(tmp, 'empty-new'), 'utf8'), '')
    await assert.rejects(readFile(join(tmp, 'delete.txt')))
    await assert.rejects(readFile(join(tmp, 'empty-old')))
    assert.equal(previewPatch(left, makePatch(left, right, 'file.txt')), right)
    assert.throws(() => previewPatch('changed', makePatch(left, right, 'file.txt')), /did not match/)
    assert.throws(() => safePath('../../outside'), /unsafe/)
    assert.throws(() => safePath('evil\n+++ target'), /unsafe/)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})
test('session and compressed link round trips retain Unicode and whitelist properties', async () => {
  const session = blankSession()
  session.right.text = '🧪\nї\uFEFFé'
  session.bookmarks = [0, 3]
  assert.deepEqual(parseSession(JSON.stringify(session)), session)
  const fragment = await encodeShare(session)
  assert.match(fragment, /^#ck1=[\w-]+$/)
  assert.deepEqual(await decodeShare(fragment), session)
  await assert.rejects(() => decodeShare(`#ck1=${'a'.repeat(25000)}`), /oversized/)
  await assert.rejects(() => decodeShare('#ck1=YWJj'), Error)
  assert.throws(() => parseSession('{"version":2}'), /Unsupported/)
  const input = JSON.stringify(session).replace('"title":', '"__proto__":{"polluted":true},"title":')
  assert.equal(Object.hasOwn(parseSession(input), '__proto__'), false)
})
test('GNU patch applies a generated unified file patch', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'comparekit-gnu-patch-'))
  try {
    const executable = process.env.PATCH_EXE ?? 'patch'
    const before = 'same\nold\nlast'
    const after = 'same\nnew\nlast\n'
    await writeFile(join(tmp, 'app.conf'), before)
    execFileSync(executable, ['-p1', '--batch', '--binary'], {
      cwd: tmp,
      input: makePatch(before, after, 'app.conf'),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    assert.equal(await readFile(join(tmp, 'app.conf'), 'utf8'), after)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})
test('folder scans hash file bytes, honor filters and export staged changed files', async () => {
  const file = (data: BlobPart, name: string) => new File([data], name)
  const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  assert.equal((await describeFile(file('abc', 'a.txt'))).hash, expected)
  assert.equal(fileKind(Uint8Array.from([0, 255]), 'sample.bin'), 'binary')
  assert.equal(fileKind(new Uint8Array(), 'name.svg'), 'text')
  assert.equal(await readText(file(new Uint8Array([255, 254, 97, 0]), 'utf16.txt')), '\uFEFFa')
  await assert.rejects(readText(file(new Uint8Array([255, 64]), 'byte.bin')), /binary/)
  const left: PickedFolder = {
    name: 'a',
    entries: new Map([
      ['one.txt', file('old', 'one.txt')],
      ['same.txt', file('abc', 'same.txt')],
      ['gone.txt', file('abc', 'gone.txt')],
      ['.git/meta', file('x', 'meta')],
    ]),
  }
  const right: PickedFolder = {
    name: 'b',
    entries: new Map([
      ['one.txt', file('new', 'one.txt')],
      ['same.txt', file('abc', 'same.txt')],
      ['new.txt', file('abc', 'new.txt')],
    ]),
  }
  const progress: number[] = []
  const result = await scanFolders(
    left,
    right,
    { excludes: '.git/', extensions: '', includes: '' },
    (count) => progress.push(count),
  )
  assert.deepEqual(
    result.entries.map(({ path, status }) => [path, status]),
    [
      ['gone.txt', 'left'],
      ['new.txt', 'right'],
      ['one.txt', 'modified'],
      ['same.txt', 'identical'],
    ],
  )
  assert.equal(result.skipped, 1)
  assert.deepEqual(progress, [0, 4])
  const edited = new Map([['one.txt', 'merged']])
  assert.match(await folderPatch(result, left, right, edited, 3), /\+merged/)
  const zip = unzipSync(await folderZip(result, right, edited))
  assert.equal(new TextDecoder().decode(zip['one.txt']), 'merged')
  assert.equal(zip['gone.txt'], undefined)
})
test('HTML report escapes compared content, names and rules', () => {
  const unsafe = '<img src="https://example.test/x" onerror="alert(1)">'
  const html = textReport(
    { name: unsafe, text: unsafe },
    { name: 'after', text: '<script>doEvil()</script>' },
    { ...defaults, regex: [unsafe] },
  )
  assert.ok(!html.includes('<img'))
  assert.ok(!html.includes('<script>'))
  assert.match(html, /&lt;/)
  assert.match(html, /default-src 'none'/)
})
