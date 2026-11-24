import { compare, ending, lines } from './text'

type Edit = { start: number; end: number; content: string[]; side: 'A' | 'B' }
export type Resolution = 'A' | 'B' | 'Base' | 'Both'
export type LineSpan = { start: number; count: number }
export type MergeChange = {
  id: number
  kind: 'A' | 'B' | 'both' | 'conflict'
  base: string
  A: string
  B: string
  ranges: Record<'base' | 'A' | 'B', LineSpan>
}
export type MergePart = string | MergeChange
export const mergeLayout = 2
export type MergeState = {
  layout: typeof mergeLayout
  choices: Record<number, { choice?: Resolution; manual?: string }>
  result?: string
}

function overlaps(a: Edit, b: Edit): boolean {
  if (a.start === a.end && b.start === b.end) return a.start === b.start
  if (a.start === a.end) return b.start < a.start && a.start < b.end
  if (b.start === b.end) return a.start < b.start && b.start < a.end
  return Math.max(a.start, b.start) < Math.min(a.end, b.end)
}

function refine(own: Edit[], other: Edit[]): Edit[] {
  let candidate = 0
  return own.flatMap((edit) => {
    const count = edit.end - edit.start
    if (count < 2 || count !== edit.content.length) return [edit]
    while (other[candidate] && other[candidate].end <= edit.start) candidate++
    if (!other[candidate] || other[candidate].start >= edit.end) return [edit]
    for (let index = candidate; other[index] && other[index].start < edit.end; index++) {
      const competing = other[index]
      if (competing.start === competing.end) return [edit]
    }
    // Keep the original grouping when the replacement has no positional line mapping.
    return edit.content.map((line, index) => ({
      start: edit.start + index,
      end: edit.start + index + 1,
      content: [line],
      side: edit.side,
    }))
  })
}

export function threeWay(base: string, a: string, b: string): MergePart[] {
  const baseLines = lines(base)
  function edits(text: string, side: Edit['side']): Edit[] {
    const records = lines(text)
    return compare(base, text).blocks.map(({ a: start, aCount, b: from, bCount }) => ({
      start,
      end: start + aCount,
      content: records.slice(from, from + bCount),
      side,
    }))
  }
  const left = edits(a, 'A')
  const right = edits(b, 'B')
  const queue = [...refine(left, right), ...refine(right, left)].sort(
    (x, y) => x.start - y.start || x.end - y.end,
  )
  const result: MergePart[] = []
  const positions = { A: 0, B: 0 }
  let id = 0
  let cursor = 0
  let i = 0
  while (i < queue.length) {
    const first = queue[i++]
    const group = [first]
    let end = first.end
    const latest: Partial<Record<Edit['side'], Edit>> = { [first.side]: first }
    while (i < queue.length && queue[i].start <= end) {
      const next = queue[i]
      const opposite = latest[next.side === 'A' ? 'B' : 'A']
      if (!opposite || !overlaps(opposite, next)) break
      end = Math.max(end, next.end)
      group.push(next)
      latest[next.side] = next
      i++
    }
    const gap = first.start - cursor
    if (gap) result.push(baseLines.slice(cursor, first.start).join(''))
    function version(side: Edit['side']) {
      const selected = group.filter((edit) => edit.side === side)
      let from = first.start
      const parts: string[] = []
      let count = end - first.start
      for (const edit of selected) {
        parts.push(baseLines.slice(from, edit.start).join(''), edit.content.join(''))
        count += edit.content.length - (edit.end - edit.start)
        from = edit.end
      }
      const start = positions[side] + gap
      positions[side] = start + count
      return { text: parts.join('') + baseLines.slice(from, end).join(''), range: { start, count } }
    }
    const original = baseLines.slice(first.start, end).join('')
    const A = version('A')
    const B = version('B')
    result.push({
      id: id++,
      kind: A.text === B.text ? 'both' : A.text === original ? 'B' : B.text === original ? 'A' : 'conflict',
      base: original,
      A: A.text,
      B: B.text,
      ranges: { base: { start: first.start, count: end - first.start }, A: A.range, B: B.range },
    })
    cursor = end
  }
  result.push(baseLines.slice(cursor).join(''))
  return result
}

export function mergeResult(parts: MergePart[], choices: MergeState['choices']): string {
  return renderMerge(parts, choices).text
}

export function renderMerge(parts: MergePart[], choices: MergeState['choices']) {
  const ranges = new Map<number, LineSpan>()
  let start = 0
  const raw = parts.map((part) => {
    if (typeof part === 'string') return part
    const selected = choices[part.id]
    const newline = ending(part.base || part.A || part.B)
    const terminate = (value: string) => (value && !/[\r\n]$/.test(value) ? value + newline : value)
    if (selected?.manual !== undefined) return selected.manual
    if (selected?.choice === 'Base') return part.base
    if (selected?.choice === 'A' || selected?.choice === 'B') return part[selected.choice]
    if (selected?.choice === 'Both') return (part.B ? terminate(part.A) : part.A) + part.B
    if (part.kind !== 'conflict') return part.kind === 'B' ? part.B : part.A
    return ['<<<<<<< A', part.A, '||||||| Base', part.base, '=======', part.B, '>>>>>>> B']
      .map(terminate)
      .join('')
  })
  let continuation = false
  for (let i = raw.length - 1; i >= 0; i--) {
    const part = parts[i]
    if (typeof part !== 'string' && continuation && raw[i] && !/[\r\n]$/.test(raw[i])) {
      raw[i] += ending(part.base || part.A || part.B)
    }
    if (raw[i]) continuation = true
  }
  for (const [index, part] of parts.entries()) {
    const endings = raw[index].match(/\r\n|\r|\n/g)?.length ?? 0
    if (typeof part !== 'string') {
      const count = endings + Number(!!raw[index] && !/[\r\n]$/.test(raw[index]))
      ranges.set(part.id, { start, count })
    }
    start += endings
  }
  return { text: raw.join(''), ranges }
}
