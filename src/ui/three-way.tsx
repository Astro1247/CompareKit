import { useEffect, useMemo, useState } from 'react'
import CompareWorker from '../core/compare.worker?worker'
import { copy, download } from '../core/export'
import { defaultDocumentNames, type Workspace } from '../core/session'
import { checkText, defaults, detectLanguage } from '../core/text'
import {
  type MergeChange,
  type MergePart,
  type MergeState,
  mergeLayout,
  renderMerge,
  type Resolution,
} from '../core/three-way'
import { CodePane, type LineMark, type Visual } from '../editor/workspace'
import { trackUsage } from '../usage'
import { Button } from './controls'
import { useThreeWayScroll } from './three-way-scroll'

const resolutions = ['A', 'B', 'Base', 'Both'] as const
const resolutionEvents = {
  A: 'three_way_accept_a',
  B: 'three_way_accept_b',
  Base: 'three_way_accept_base',
  Both: 'three_way_accept_both',
} as const
const emptyChoices: MergeState['choices'] = {}
const panes = [
  ['base', 'Base', 'base'],
  ['left', 'Version A', 'A'],
  ['right', 'Version B', 'B'],
] as const
const changeNames = { A: 'A only', B: 'B only', both: 'Both sides', conflict: 'Conflict' }
const changeTones = { A: 'a', B: 'b', both: 'both', conflict: 'conflict' } as const
const placeholderNames = new Set(Object.values(defaultDocumentNames))

export function ThreeWorkspace({
  input,
  visual,
  edit,
  message,
  open,
  compareTwo,
  setScrollSync,
  merge,
  updateMerge,
}: {
  input: Workspace
  visual: Visual
  edit: (side: keyof Workspace, text: string) => void
  message: (value: string) => void
  open: (side: keyof Workspace) => void
  compareTwo: () => void
  setScrollSync: (enabled: boolean) => void
  merge?: MergeState
  updateMerge: (value: MergeState, group?: string) => void
}) {
  const [parts, setParts] = useState<MergePart[]>([])
  const [selected, setSelected] = useState(0)
  const [revealRequest, setRevealRequest] = useState(0)
  const [error, setError] = useState('')
  const [settled, setSettled] = useState<string[]>([])
  const [width, setWidth] = useState(30)
  const [height, setHeight] = useState(55)
  const fresh =
    settled[0] === input.base.text && settled[1] === input.left.text && settled[2] === input.right.text
  useEffect(() => {
    let worker: Worker | undefined
    let deadline: ReturnType<typeof setTimeout>
    const timer = setTimeout(() => {
      const values = [input.base.text, input.left.text, input.right.text]
      const comparison = new CompareWorker()
      worker = comparison
      function finish(parts: MergePart[], error: string) {
        comparison.terminate()
        clearTimeout(deadline)
        setSettled(values)
        setParts(parts)
        setSelected(
          parts.find((part): part is MergeChange => typeof part !== 'string' && part.kind === 'conflict')
            ?.id ?? 0,
        )
        setRevealRequest(0)
        setError(error)
        if (!error && values.some(Boolean)) trackUsage('three_way_compared', true)
      }
      comparison.onmessage = ({ data }: MessageEvent<{ parts?: MergePart[]; error?: string }>) =>
        finish(data.parts ?? [], data.error ?? '')
      comparison.onerror = () => finish([], 'Could not start the three-way comparison.')
      deadline = setTimeout(() => finish([], 'Three-way comparison exceeded its time budget.'), 4200)
      comparison.postMessage({ left: values[1], right: values[2], base: values[0], options: defaults })
    }, 160)
    return () => {
      clearTimeout(timer)
      clearTimeout(deadline)
      worker?.terminate()
    }
  }, [input.base.text, input.left.text, input.right.text])

  const changes = useMemo(() => parts.filter((part) => typeof part !== 'string'), [parts])
  const conflicts = changes.filter((part) => part.kind === 'conflict')
  const choices = merge?.choices ?? emptyChoices
  const change = changes[selected]
  const unresolved = conflicts.filter((item) => choices[item.id] === undefined)
  const generated = useMemo(() => renderMerge(parts, choices), [parts, choices])
  const result = merge?.result ?? generated.text
  const manualResult = merge?.result !== undefined
  const alignment = useMemo(
    () =>
      changes.flatMap((item) => {
        const range = generated.ranges.get(item.id)
        return range ? [{ ...item.ranges, result: range }] : []
      }),
    [changes, generated],
  )
  const paneScroll = useThreeWayScroll(
    visual.threeWayScroll && fresh && !error,
    alignment,
    generated.text,
    merge?.result,
  )
  const markers = useMemo(() => {
    const output: Record<'base' | 'A' | 'B' | 'result', LineMark[]> = { base: [], A: [], B: [], result: [] }
    if (!fresh || error) return output
    for (const item of changes) {
      const active = item.id === selected
      const tone = changeTones[item.kind]
      for (const [, , key] of panes) {
        const unchanged = key !== 'base' && item[key] === item.base
        if (!unchanged || active) {
          output[key].push({ id: item.id, ...item.ranges[key], tone: unchanged ? 'context' : tone, active })
        }
      }
      const range = generated.ranges.get(item.id)
      if (range && !manualResult) {
        const decision = choices[item.id]
        const resolvedTone = decision?.choice === 'A' ? 'a' : decision?.choice === 'B' ? 'b' : 'both'
        output.result.push({ id: item.id, ...range, tone: decision ? resolvedTone : tone, active })
      }
    }
    return output
  }, [changes, selected, fresh, error, generated, manualResult, choices])

  const inputRanges = change?.ranges
  const resultLine = manualResult ? undefined : generated.ranges.get(selected)?.start
  const revealed = useMemo(() => {
    if (!fresh || !revealRequest || !inputRanges) return {}
    const request = revealRequest
    return {
      base: { line: inputRanges.base.start + 1, request },
      A: { line: inputRanges.A.start + 1, request },
      B: { line: inputRanges.B.start + 1, request },
      result: resultLine === undefined ? undefined : { line: resultLine + 1, request },
    }
  }, [fresh, revealRequest, inputRanges, resultLine])

  function jump(id: number) {
    paneScroll.pause()
    setSelected(id)
    setRevealRequest((request) => request + 1)
  }
  function navigate(items: MergeChange[], direction: -1 | 1) {
    const next =
      direction === 1
        ? (items.find((item) => item.id > selected) ?? items[0])
        : ([...items].reverse().find((item) => item.id < selected) ?? items.at(-1))
    if (next) jump(next.id)
  }
  function accept(item: MergeChange, choice: Resolution, arrow?: 'A' | 'B') {
    if (!confirmRegenerate()) return
    updateMerge({ layout: mergeLayout, choices: { ...choices, [item.id]: { choice } } })
    trackUsage(arrow ? (arrow === 'A' ? 'three_way_arrow_a' : 'three_way_arrow_b') : resolutionEvents[choice])
  }
  function gutter(id: number, key: 'A' | 'B') {
    if (!fresh || error) return null
    const item = changes[id]
    if (!item || item[key] === item.base) return null
    return (
      <Button
        className={'three-inline-button merge-tone-' + changeTones[item.kind]}
        icon="down"
        label={'Apply ' + key + ' for change ' + (id + 1)}
        aria-pressed={choices[id]?.choice === key}
        onClick={() => {
          jump(id)
          accept(item, key, key)
        }}
      >
        {key}
      </Button>
    )
  }
  function confirmRegenerate() {
    return (
      !manualResult || window.confirm('Apply this choice and replace your direct edits to the merge result?')
    )
  }
  function confirmUnresolved() {
    return unresolved.length === 0 || window.confirm('Use the merge result with unresolved conflict markers?')
  }
  const canAct = fresh && !error
  const empty = !input.base.text && !input.left.text && !input.right.text
  const status = empty
    ? 'Open the shared starting point and both edited versions.'
    : !fresh
      ? 'Comparing Base, A and B…'
      : error ||
        (unresolved.length
          ? unresolved.length + ' unresolved of ' + conflicts.length + ' conflicts'
          : changes.length
            ? 'No unresolved conflicts'
            : 'No changes from Base')

  return (
    <section className="three-workspace" aria-label="Three-way merge">
      <div className="three-toolbar">
        <span role="status">{status}</span>
        {canAct && !!changes.length && (
          <div className="three-legend">
            {(['A', 'B', 'both', 'conflict'] as const).map((kind) => (
              <span key={kind} className={'merge-tone-' + changeTones[kind]}>
                {changeNames[kind]}
              </span>
            ))}
          </div>
        )}
        <div className="grow" />
        <Button icon="split" title="Switch to Text to compare and merge two inputs" onClick={compareTwo}>
          Compare two files
        </Button>
        <Button
          icon="link"
          aria-pressed={visual.threeWayScroll}
          title="Scroll all merge panes together vertically"
          onClick={() => {
            setScrollSync(!visual.threeWayScroll)
            trackUsage('three_way_sync_changed')
          }}
        >
          Sync scrolling
        </Button>
        <label className="field">
          Base width
          <input
            aria-label="Base width"
            type="range"
            min={20}
            max={50}
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
          />
        </label>
        <label className="field">
          Input height
          <input
            aria-label="Input height"
            type="range"
            min={28}
            max={72}
            value={height}
            onChange={(event) => setHeight(Number(event.target.value))}
          />
        </label>
        <Button
          icon="left"
          label="Previous merge change"
          disabled={!canAct || !changes.length}
          onClick={() => navigate(changes, -1)}
        />
        <Button
          icon="right"
          label="Next merge change"
          disabled={!canAct || !changes.length}
          onClick={() => navigate(changes, 1)}
        />
        <Button
          icon="up"
          label="Previous conflict"
          disabled={!canAct || !unresolved.length}
          onClick={() => navigate(unresolved, -1)}
        />
        <Button
          icon="down"
          label="Next conflict"
          disabled={!canAct || !unresolved.length}
          onClick={() => navigate(unresolved, 1)}
        />
        <Button
          icon="export"
          disabled={!canAct}
          onClick={() => {
            if (confirmUnresolved()) {
              download('merged.txt', result)
              trackUsage('three_way_download')
            }
          }}
        >
          Download result
        </Button>
      </div>
      <div
        className="three-panes"
        style={{ gridTemplateColumns: width + '% 1fr 1fr', flexBasis: height + '%' }}
      >
        {panes.map(([side, label, key]) => (
          <div className="three-pane" key={side}>
            <header>
              <strong title={key === 'base' ? 'The shared starting point for A and B' : undefined}>
                {label}
              </strong>
              <span>
                {placeholderNames.has(input[side].name)
                  ? key === 'base'
                    ? 'Shared starting point'
                    : ''
                  : input[side].name}
              </span>
              <Button icon="open" label={'Open file for ' + label} onClick={() => open(side)} />
            </header>
            <CodePane
              text={input[side].text}
              label={label + ' editor'}
              language={detectLanguage(input[side])}
              visual={visual}
              onChange={(text) => edit(side, text)}
              marks={markers[key]}
              reveal={revealed[key]}
              gutterAction={key === 'base' ? undefined : (id) => gutter(id, key)}
              {...paneScroll.bind(key)}
            />
          </div>
        ))}
      </div>
      <div className={'three-result' + (change && canAct ? ' has-conflict' : '')}>
        <div className="three-pane">
          <header>
            <strong>Merge result</strong>
            <span />
            {manualResult && (
              <Button
                onClick={() => {
                  if (confirmRegenerate()) updateMerge({ layout: mergeLayout, choices })
                }}
              >
                Restore generated result
              </Button>
            )}
            <Button
              disabled={!canAct}
              onClick={() => {
                if (confirmUnresolved())
                  void copy(result).then(
                    () => message('Merge result copied.'),
                    () => message('Clipboard unavailable. Download the result instead.'),
                  )
              }}
            >
              Copy
            </Button>
            {(['left', 'right'] as const).map((side) => (
              <Button
                key={side}
                disabled={!canAct}
                onClick={() => {
                  if (confirmUnresolved()) edit(side, result)
                }}
              >
                To {side === 'left' ? 'A' : 'B'}
              </Button>
            ))}
          </header>
          <CodePane
            label="Merge result editor"
            text={canAct ? result : ''}
            visual={visual}
            readOnly={!canAct}
            marks={markers.result}
            reveal={revealed.result}
            {...paneScroll.bind('result')}
            onChange={(value) => {
              try {
                checkText(value)
                updateMerge({ layout: mergeLayout, choices, result: value }, 'merge-result')
              } catch (error) {
                message(String(error))
              }
            }}
          />
        </div>
        {change && canAct && (
          <aside
            className={'conflict-panel merge-tone-' + changeTones[change.kind]}
            aria-label="Selected merge change"
          >
            <h3>
              {change.kind === 'conflict'
                ? 'Conflict ' + (conflicts.indexOf(change) + 1) + ' of ' + conflicts.length
                : changeNames[change.kind]}
            </h3>
            <div className="merge-location">
              Change {selected + 1} of {changes.length} · Base line {change.ranges.base.start + 1}
            </div>
            <div className="form-row">
              {resolutions
                .filter(
                  (choice) =>
                    choice === 'Base' ||
                    change.kind === 'conflict' ||
                    (choice !== 'Both' && change[choice] !== change.base),
                )
                .map((choice) => (
                  <Button
                    key={choice}
                    aria-pressed={choices[change.id]?.choice === choice}
                    onClick={() => accept(change, choice)}
                  >
                    Accept {choice}
                  </Button>
                ))}
            </div>
            {(['Base', 'A', 'B'] as const).map((side) => (
              <details key={side}>
                <summary>{side}</summary>
                <pre>{(side === 'Base' ? change.base : change[side]) || '∅'}</pre>
              </details>
            ))}
            <label className="field column">
              Manual resolution
              <textarea
                key={change.id}
                aria-label="Manual conflict resolution"
                value={choices[change.id]?.manual ?? ''}
                onChange={(event) => {
                  const manual = event.target.value
                  if (!confirmRegenerate()) return
                  updateMerge(
                    { layout: mergeLayout, choices: { ...choices, [change.id]: { manual } } },
                    'conflict-' + change.id,
                  )
                  trackUsage('three_way_manual_resolution', true)
                }}
              />
            </label>
            {choices[change.id] && (
              <Button
                onClick={() => {
                  if (!confirmRegenerate()) return
                  const next = { ...choices }
                  delete next[change.id]
                  updateMerge({ layout: mergeLayout, choices: next })
                }}
              >
                {change.kind === 'conflict' ? 'Mark unresolved' : 'Use automatic merge'}
              </Button>
            )}
          </aside>
        )}
      </div>
    </section>
  )
}
