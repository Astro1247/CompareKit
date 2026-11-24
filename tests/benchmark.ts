import { performance } from 'node:perf_hooks'
import { type PickedFolder, scanFolders } from '../src/core/folders'
import { compare, defaults } from '../src/core/text'

function data(size: number, changed: boolean, padding = 0) {
  return Array.from(
    { length: size },
    (_, index) =>
      'setting' + index + '=' + 'x'.repeat(padding) + (changed && index % 733 === 0 ? 'new' : 'old') + '\n',
  ).join('')
}
for (const [count, padding] of [
  [40, 0],
  [10_000, 0],
  [100_000, 0],
  [100_000, 24],
]) {
  const left = data(count, false, padding)
  const right = data(count, true, padding)
  const results: number[] = []
  let changes = 0
  for (let run = 0; run < 5; run++) {
    const start = performance.now()
    changes = compare(left, right, defaults).blocks.length
    results.push(performance.now() - start)
  }
  results.sort((a, b) => a - b)
  console.log(
    JSON.stringify({ count, bytesPerSide: left.length, changes, medianMs: Number(results[2].toFixed(1)) }),
  )
}
function folder(changed: boolean): PickedFolder {
  return {
    name: 'synthetic',
    entries: new Map(
      Array.from({ length: 3000 }, (_, index) => {
        const name = `config/${index}.txt`
        return [name, new File([data(40, changed && index % 40 === 0)], name)]
      }),
    ),
  }
}
const left = folder(false)
const right = folder(true)
const started = performance.now()
const result = await scanFolders(left, right, { excludes: '', extensions: '', includes: '' }, () => {})
console.log(
  JSON.stringify({
    paths: result.entries.length,
    bytes: result.bytes,
    milliseconds: Number((performance.now() - started).toFixed(1)),
  }),
)
