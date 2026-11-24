import { createRef, useEffect, useMemo, useRef, useState } from 'react'
import CompareWorker from '../core/compare.worker?worker'
import { alignScrollLine } from '../core/scroll-alignment'
import { type Comparison, defaults } from '../core/text'
import type { LineSpan } from '../core/three-way'
import type { CodePaneScroll } from '../editor/workspace'

const panes = ['base', 'A', 'B', 'result'] as const
type Pane = (typeof panes)[number]
type ManualRanges = Record<'generated' | 'manual', LineSpan>[]

export function useThreeWayScroll(
  enabled: boolean,
  ranges: Record<Pane, LineSpan>[],
  generated: string,
  manual: string | undefined,
) {
  const editors = useMemo(
    () => ({
      base: createRef<CodePaneScroll>(),
      A: createRef<CodePaneScroll>(),
      B: createRef<CodePaneScroll>(),
      result: createRef<CodePaneScroll>(),
    }),
    [],
  )
  // Only the last directly interacted-with pane leads. Peer view updates can emit deferred scroll events.
  const leader = useRef<Pane | undefined>(undefined)
  const [mapping, setMapping] = useState<{ generated: string; manual: string; ranges: ManualRanges }>()
  const manualRanges =
    mapping?.generated === generated && mapping?.manual === manual ? mapping?.ranges : undefined
  useEffect(() => {
    if (!enabled || manual === undefined || manual === generated) return
    let worker: Worker | undefined
    let deadline: ReturnType<typeof setTimeout>
    const timer = setTimeout(() => {
      const task = new CompareWorker()
      worker = task
      function stop() {
        task.terminate()
        clearTimeout(deadline)
      }
      task.onmessage = ({ data }: MessageEvent<{ diff?: Comparison }>) => {
        stop()
        if (!data.diff) return
        setMapping({
          generated,
          manual,
          ranges: data.diff.blocks.map(({ a, aCount, b, bCount }) => ({
            generated: { start: a, count: aCount },
            manual: { start: b, count: bCount },
          })),
        })
      }
      task.onerror = stop
      deadline = setTimeout(stop, 2200)
      task.postMessage({ left: generated, right: manual, options: defaults })
    }, 160)
    return () => {
      clearTimeout(timer)
      clearTimeout(deadline)
      worker?.terminate()
    }
  }, [enabled, generated, manual])

  function sync(from: Pane, position: number) {
    if (leader.current !== from) return
    const edited = manual !== undefined && manual !== generated
    if (from === 'result' && edited && !manualRanges) return
    const source =
      from === 'result' && manualRanges
        ? alignScrollLine(position, 'manual', 'generated', manualRanges)
        : position
    for (const to of panes) {
      if (to === from || (to === 'result' && edited && !manualRanges)) continue
      const aligned = alignScrollLine(source, from, to, ranges)
      const target =
        to === 'result' && manualRanges
          ? alignScrollLine(aligned, 'generated', 'manual', manualRanges)
          : aligned
      editors[to].current?.scrollToLine(target)
    }
  }

  return {
    pause: () => {
      leader.current = undefined
    },
    bind: (pane: Pane) => ({
      scrollRef: editors[pane],
      onScrollInput: enabled
        ? () => {
            leader.current = pane
          }
        : undefined,
      onVerticalScroll: enabled ? (position: number) => sync(pane, position) : undefined,
    }),
  }
}
