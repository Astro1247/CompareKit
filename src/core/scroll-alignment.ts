import type { LineSpan } from './three-way'

/** Project a zero-based, fractional line position through ordered changed ranges. */
export function alignScrollLine<Pane extends string>(
  position: number,
  from: Pane,
  to: Pane,
  ranges: readonly Record<Pane, LineSpan>[],
): number {
  let low = 0
  let high = ranges.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (ranges[middle][from].start <= position) low = middle + 1
    else high = middle
  }
  if (!low) return position
  const change = ranges[low - 1]
  const source = change[from]
  const target = change[to]
  const offset = position - source.start
  if (offset < source.count) return target.start + (offset * target.count) / source.count
  return target.start + target.count + offset - source.count
}
