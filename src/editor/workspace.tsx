import { forwardRef, type ReactNode, type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  applyEditorChanges,
  type Block,
  type ComparisonOptions,
  type Document,
  detectLanguage,
  displayText,
  fromEditor,
  type Side,
  whitespaceRanges,
} from '../core/text'
import { monaco } from './monaco'

export type Visual = {
  theme: 'system' | 'light' | 'dark'
  font: number
  wrap: boolean
  whitespace: boolean
  minimap: boolean
  numbers: boolean
  horizontal: boolean
  threeWayScroll: boolean
  intensity: number
  added: string
  removed: string
  modified: string
  conflict: string
  language: string
  remember: boolean
}
export const visualDefaults: Visual = {
  theme: 'system',
  font: 14,
  wrap: false,
  whitespace: false,
  minimap: false,
  numbers: true,
  horizontal: false,
  threeWayScroll: true,
  intensity: 100,
  added: '',
  removed: '',
  modified: '#7988f6',
  conflict: '#b86a14',
  language: 'auto',
  remember: true,
}
export type DiffHandle = {
  focus: (side: Side) => void
  go: (block: Block) => void
  reveal: (side: Side, line: number) => void
  find: (side: Side, replace?: boolean) => void
  format: (side: Side) => Promise<boolean>
}
type DiffProps = {
  left: Document
  right: Document
  visual: Visual
  sideBySide: boolean
  fold: boolean
  context: number
  blocks: Block[]
  ignored: Block[]
  current: number
  marked: number[]
  stale: boolean
  options: Pick<ComparisonOptions, 'leading' | 'trailing'>
  onChange: (side: Side, value: string) => void
  onMerge: (side: Side, index: number) => void
  onDivider: (width: number) => void
}
const paneOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  fontLigatures: false,
  quickSuggestions: false,
  links: false,
  scrollBeyondLastLine: false,
  editContext: false,
  stickyScroll: { enabled: false },
  padding: { top: 8, bottom: 8 },
  unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: true, nonBasicASCII: false },
}
function appearance(visual: Visual): monaco.editor.IEditorOptions {
  return {
    fontSize: visual.font,
    wordWrap: visual.wrap ? 'on' : 'off',
    renderWhitespace: visual.whitespace ? 'all' : 'none',
    minimap: { enabled: visual.minimap },
    lineNumbers: visual.numbers ? 'on' : 'off',
  }
}
function language(doc: Document, selected: string) {
  const id = selected === 'auto' ? detectLanguage(doc) : selected
  return monaco.languages.getLanguages().some((item) => item.id === id) ? id : 'plaintext'
}
function editorValue(
  model: monaco.editor.ITextModel,
  previous: string,
  event: monaco.editor.IModelContentChangedEvent,
) {
  const value = model.getValue(monaco.editor.EndOfLinePreference.LF)
  const source = applyEditorChanges(previous, event.changes)
  return displayText(source) === value ? source : fromEditor(value, previous)
}

export function useMonacoTheme(visual: Visual, dark: boolean) {
  useEffect(() => {
    const opacity = Math.round(Math.min(0.65, (0.19 * visual.intensity) / 100) * 255)
      .toString(16)
      .padStart(2, '0')
    const high = Math.round(Math.min(0.85, (0.36 * visual.intensity) / 100) * 255)
      .toString(16)
      .padStart(2, '0')
    const colors: Record<string, string> = {}
    if (visual.added || visual.intensity !== 100) {
      colors['diffEditor.insertedLineBackground'] = (visual.added || '#2ea043') + opacity
      colors['diffEditor.insertedTextBackground'] = (visual.added || '#2ea043') + high
    }
    if (visual.removed || visual.intensity !== 100) {
      colors['diffEditor.removedLineBackground'] = (visual.removed || '#f85149') + opacity
      colors['diffEditor.removedTextBackground'] = (visual.removed || '#f85149') + high
    }
    monaco.editor.defineTheme('comparekit', {
      base: dark ? 'vs-dark' : 'vs',
      inherit: true,
      rules: [],
      colors,
    })
    monaco.editor.setTheme('comparekit')
  }, [dark, visual.added, visual.removed, visual.intensity])
}
type Arrow = { index: number; top: number; left: number }

export const DiffWorkspace = forwardRef<DiffHandle, DiffProps>(function DiffWorkspace(props, ref) {
  const host = useRef<HTMLDivElement>(null)
  const instance = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const live = useRef(props)
  live.current = props
  const writing = useRef(false)
  const raw = useRef({ left: props.left.text, right: props.right.text })
  const update = useRef(
    (_ignored: Block[], _blocks: Block[], _current: number, _marked: number[], _stale: boolean) => {},
  )
  const [arrows, setArrows] = useState<Arrow[]>([])
  const [loaded, setLoaded] = useState(false)
  useImperativeHandle(
    ref,
    () => ({
      focus(side) {
        const editor = instance.current
        ;(side === 'left' ? editor?.getOriginalEditor() : editor?.getModifiedEditor())?.focus()
      },
      go(block) {
        const editor = instance.current
        if (!editor) return
        const side = editor.getModifiedEditor()
        const line = Math.min(block.b + 1, side.getModel()?.getLineCount() ?? 1)
        side.setPosition({ lineNumber: line, column: 1 })
        side.revealLineInCenter(line)
      },
      reveal(side, line) {
        const editor =
          side === 'left' ? instance.current?.getOriginalEditor() : instance.current?.getModifiedEditor()
        editor?.revealLineInCenter(line)
        editor?.setPosition({ lineNumber: line, column: 1 })
        editor?.focus()
      },
      find(side, replace) {
        const editor =
          side === 'left' ? instance.current?.getOriginalEditor() : instance.current?.getModifiedEditor()
        editor?.focus()
        editor?.getAction(replace ? 'editor.action.startFindReplaceAction' : 'actions.find')?.run()
      },
      async format(side) {
        const editor =
          side === 'left' ? instance.current?.getOriginalEditor() : instance.current?.getModifiedEditor()
        const before = editor?.getValue()
        await editor?.getAction('editor.action.formatDocument')?.run()
        return before !== editor?.getValue()
      },
    }),
    [],
  )

  useEffect(() => {
    if (!host.current) return
    const start = live.current
    const diff = monaco.editor.createDiffEditor(host.current, {
      ...paneOptions,
      ...appearance(start.visual),
      theme: 'comparekit',
      originalEditable: true,
      renderSideBySide: start.sideBySide,
      useInlineViewWhenSpaceIsLimited: false,
      enableSplitViewResizing: true,
      renderMarginRevertIcon: false,
      renderGutterMenu: false,
      // Align by content. CompareKit decorates actionable edge whitespace without full-line diff colors.
      ignoreTrimWhitespace: true,
      maxComputationTime: 1700,
      renderOverviewRuler: true,
      originalAriaLabel: 'Original editor',
      modifiedAriaLabel: 'Modified editor',
      renderIndicators: true,
      diffAlgorithm: 'advanced',
    })
    instance.current = diff
    const original = monaco.editor.createModel(
      displayText(start.left.text),
      language(start.left, start.visual.language),
    )
    const modified = monaco.editor.createModel(
      displayText(start.right.text),
      language(start.right, start.visual.language),
    )
    diff.setModel({ original, modified })
    const a = diff.getOriginalEditor()
    const b = diff.getModifiedEditor()
    a.updateOptions({ ariaLabel: 'Original editor' })
    b.updateOptions({ ariaLabel: 'Modified editor' })
    const layout = () => {
      const info = a.getLayoutInfo()
      if (info.width > 0 && live.current.sideBySide) live.current.onDivider(info.width)
      position()
    }
    const leftDecorations = a.createDecorationsCollection()
    const rightDecorations = b.createDecorationsCollection()
    const leftWhitespace = a.createDecorationsCollection()
    const rightWhitespace = b.createDecorationsCollection()
    let formatting: Block[] = []
    function paintWhitespace(
      side: Side,
      editor: monaco.editor.ICodeEditor,
      collection: monaco.editor.IEditorDecorationsCollection,
    ) {
      if (live.current.stale || !formatting.length) {
        if (collection.length) collection.clear()
        return
      }
      const decorations: monaco.editor.IModelDeltaDecoration[] = []
      for (const { startLineNumber, endLineNumber } of editor.getVisibleRanges()) {
        for (const block of formatting) {
          const start = (side === 'left' ? block.a : block.b) + 1
          if (start > endLineNumber) break
          const first = Math.max(0, startLineNumber - start)
          const last = Math.min(block.aCount, endLineNumber - start + 1)
          for (let offset = first; offset < last; offset++) {
            const originalLine = block.a + offset + 1
            const modifiedLine = block.b + offset + 1
            if (originalLine > original.getLineCount() || modifiedLine > modified.getLineCount()) continue
            const ranges = whitespaceRanges(
              original.getLineContent(originalLine),
              modified.getLineContent(modifiedLine),
              live.current.options,
            )
            if (!ranges.left.length && !ranges.right.length) continue
            const line = start + offset
            decorations.push({
              range: new monaco.Range(line, 1, line, 1),
              options: { linesDecorationsClassName: 'formatting-whitespace-marker' },
            })
            for (const range of ranges[side]) {
              decorations.push({
                range: new monaco.Range(line, range.start + 1, line, range.end + 1),
                options: {
                  inlineClassName: 'formatting-whitespace',
                  hoverMessage: { value: 'Leading or trailing whitespace changed' },
                },
              })
            }
          }
        }
      }
      collection.set(decorations)
    }
    let scheduled = 0
    function position() {
      cancelAnimationFrame(scheduled)
      scheduled = requestAnimationFrame(() => {
        paintWhitespace('left', a, leftWhitespace)
        paintWhitespace('right', b, rightWhitespace)
        const { blocks, sideBySide, stale } = live.current
        if (!sideBySide || stale || !blocks.length) {
          setArrows([])
          return
        }
        const visible = b.getVisibleRanges()
        if (visible.length === 0) {
          setArrows([])
          return
        }
        const first = visible[0].startLineNumber
        const last = visible[visible.length - 1].endLineNumber
        const x = a.getLayoutInfo().width
        const height = b.getLayoutInfo().height
        const placed: Arrow[] = []
        // The editor scroll events can arrive many times per frame. Only position visible buttons.
        for (let index = 0; index < blocks.length && placed.length < 200; index++) {
          const block = blocks[index]
          const line = Math.min(block.b + 1, modified.getLineCount())
          if (line < first - 1) continue
          if (line > last + 1) break
          const top = b.getScrolledVisiblePosition({ lineNumber: line, column: 1 })?.top
          const originalTop = a.getScrolledVisiblePosition({
            lineNumber: Math.min(block.a + 1, original.getLineCount()),
            column: 1,
          })?.top
          const aligned = block.bCount === 0 ? (originalTop ?? top) : (top ?? originalTop)
          if (aligned !== undefined && aligned >= -4 && aligned < height - 13)
            placed.push({ index, top: aligned, left: x })
        }
        setArrows(placed)
      })
    }
    update.current = (ignored, blocks, current, marked, stale) => {
      formatting = blocks.filter((block) => block.whitespace)
      for (const [side, model, collection] of [
        ['left', original, leftDecorations],
        ['right', modified, rightDecorations],
      ] as const) {
        const paint = (block: Block, className: string) => {
          const start = side === 'left' ? block.a : block.b
          const size = side === 'left' ? block.aCount : block.bCount
          const line = Math.min(start + 1, model.getLineCount())
          return {
            range: new monaco.Range(line, 1, Math.min(start + Math.max(1, size), model.getLineCount()), 1),
            options: { isWholeLine: true, className, linesDecorationsClassName: `${className}-marker` },
          }
        }
        collection.set(
          stale
            ? []
            : [
                ...ignored.map((block) => paint(block, 'ignored-line')),
                ...marked.flatMap((index) => (blocks[index] ? [paint(blocks[index], 'marked-line')] : [])),
                ...(blocks[current] ? [paint(blocks[current], 'active-line')] : []),
              ],
        )
      }
      position()
    }
    let syncing = false
    function sync(from: monaco.editor.ICodeEditor, to: monaco.editor.ICodeEditor, changed: boolean) {
      if (!changed || !live.current.visual.horizontal || syncing) return
      syncing = true
      to.setScrollLeft(from.getScrollLeft())
      syncing = false
    }
    const subscriptions = [
      original.onDidChangeContent((event) => {
        if (writing.current) return
        raw.current.left = editorValue(original, raw.current.left, event)
        live.current.onChange('left', raw.current.left)
      }),
      modified.onDidChangeContent((event) => {
        if (writing.current) return
        raw.current.right = editorValue(modified, raw.current.right, event)
        live.current.onChange('right', raw.current.right)
      }),
      a.onDidScrollChange((event) => {
        sync(a, b, event.scrollLeftChanged)
        position()
      }),
      b.onDidScrollChange((event) => {
        sync(b, a, event.scrollLeftChanged)
        position()
      }),
      a.onDidLayoutChange(layout),
      b.onDidLayoutChange(layout),
      diff.onDidUpdateDiff(position),
    ]
    setLoaded(true)
    layout()
    update.current(start.ignored, start.blocks, start.current, start.marked, start.stale)
    return () => {
      cancelAnimationFrame(scheduled)
      for (const subscription of subscriptions) subscription.dispose()
      leftDecorations.clear()
      rightDecorations.clear()
      leftWhitespace.clear()
      rightWhitespace.clear()
      diff.dispose()
      original.dispose()
      modified.dispose()
      instance.current = null
      update.current = () => {}
    }
  }, [])
  useEffect(() => {
    const editor = instance.current
    if (!editor) return
    editor.updateOptions({
      ...appearance(props.visual),
      renderSideBySide: props.sideBySide,
      diffWordWrap: props.visual.wrap ? 'on' : 'off',
      hideUnchangedRegions: {
        enabled: props.fold,
        contextLineCount: props.context,
        minimumLineCount: 2,
        revealLineCount: 10,
      },
    })
  }, [props.visual, props.sideBySide, props.fold, props.context])
  useEffect(() => {
    const model = instance.current?.getModel()
    if (!model) return
    raw.current = { left: props.left.text, right: props.right.text }
    writing.current = true
    for (const [target, document] of [
      [model.original, props.left],
      [model.modified, props.right],
    ] as const) {
      const text = displayText(document.text)
      if (target.getValue(monaco.editor.EndOfLinePreference.LF) !== text) target.setValue(text)
      const id = language(document, props.visual.language)
      if (target.getLanguageId() !== id) monaco.editor.setModelLanguage(target, id)
    }
    writing.current = false
  }, [props.left, props.right, props.visual.language])
  useEffect(() => {
    update.current(props.ignored, props.blocks, props.current, props.marked, props.stale)
  }, [props.blocks, props.current, props.ignored, props.marked, props.stale])

  return (
    <div className={`editor-shell${props.stale ? ' stale' : ''}`}>
      <div className="monaco-host" ref={host} />
      {!loaded && <div className="editor-loading">Loading editor…</div>}
      {props.sideBySide &&
        !props.stale &&
        arrows.map(({ index, top, left }) => (
          <div
            className={`merge-arrows${props.current === index ? ' selected' : ''}`}
            key={index}
            style={{ top, left }}
          >
            <button
              type="button"
              title="Apply modified to original (Alt+←)"
              aria-label={`Apply change ${index + 1} to original`}
              onClick={() => props.onMerge('left', index)}
            >
              ‹
            </button>
            <button
              type="button"
              title="Apply original to modified (Alt+→)"
              aria-label={`Apply change ${index + 1} to modified`}
              onClick={() => props.onMerge('right', index)}
            >
              ›
            </button>
          </div>
        ))}
    </div>
  )
})

export type LineMark = {
  id: number
  start: number
  count: number
  tone: 'a' | 'b' | 'both' | 'conflict' | 'context'
  active: boolean
}

export type CodePaneScroll = {
  scrollToLine: (position: number) => void
}

export function CodePane({
  text,
  label,
  language: id = 'plaintext',
  visual,
  onChange,
  readOnly = false,
  marks,
  gutterAction,
  reveal,
  scrollRef,
  onScrollInput,
  onVerticalScroll,
}: {
  text: string
  label: string
  language?: string
  visual: Visual
  onChange?: (value: string) => void
  readOnly?: boolean
  marks?: LineMark[]
  gutterAction?: (id: number) => ReactNode
  reveal?: { line: number; request: number }
  scrollRef?: Ref<CodePaneScroll>
  onScrollInput?: () => void
  onVerticalScroll?: (position: number) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const model = useRef<monaco.editor.ITextModel | null>(null)
  const writing = useRef(false)
  const raw = useRef(text)
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const overlay = useRef({ marks, enabled: !!gutterAction })
  overlay.current = { marks, enabled: !!gutterAction }
  const updateOverlay = useRef(() => {})
  const quietScroll = useRef((operation: () => void) => operation())
  const [actions, setActions] = useState<{ id: number; top: number }[]>([])
  const current = useRef({ text, label, id, visual, onChange, readOnly, onScrollInput, onVerticalScroll })
  current.current = { text, label, id, visual, onChange, readOnly, onScrollInput, onVerticalScroll }
  useImperativeHandle(
    scrollRef,
    () => ({
      scrollToLine(position) {
        const view = editor.current
        const content = model.current
        if (!view || !content) return
        const index = Math.floor(position)
        const line = Math.min(index + 1, content.getLineCount())
        const fraction = index < content.getLineCount() ? position - index : 0
        const top = view.getTopForLineNumber(line)
        const height = view.getBottomForLineNumber(line) - top
        quietScroll.current(() => {
          view.setScrollTop(position === 0 ? 0 : top + height * fraction, monaco.editor.ScrollType.Immediate)
        })
      },
    }),
    [],
  )
  useEffect(() => {
    if (!host.current) return
    const target = host.current
    const start = current.current
    const content = monaco.editor.createModel(displayText(start.text), start.id)
    const view = monaco.editor.create(target, {
      ...paneOptions,
      ...appearance(start.visual),
      model: content,
      theme: 'comparekit',
      ariaLabel: start.label,
      readOnly: start.readOnly,
    })
    model.current = content
    editor.current = view
    decorations.current = view.createDecorationsCollection()
    const claimScroll = () => current.current.onScrollInput?.()
    const scrollInputs = ['wheel', 'pointerdown', 'keydown'] as const
    for (const event of scrollInputs) target.addEventListener(event, claimScroll, true)
    let frame = 0
    let scrollFrame = 0
    let applyingScroll = false
    quietScroll.current = (operation) => {
      cancelAnimationFrame(scrollFrame)
      applyingScroll = true
      try {
        operation()
      } finally {
        applyingScroll = false
      }
    }
    function placeActions() {
      if (!overlay.current.enabled) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const visible = view.getVisibleRanges()
        const first = visible[0]?.startLineNumber ?? 0
        const last = visible.at(-1)?.endLineNumber ?? 0
        const byLine = new Map<number, { id: number; top: number }>()
        for (const mark of overlay.current.marks ?? []) {
          const line = Math.min(mark.start + 1, content.getLineCount())
          if (line < first) continue
          if (line > last) break
          const position = view.getScrolledVisiblePosition({ lineNumber: line, column: 1 })
          if (!position || position.top < 0 || position.top >= view.getLayoutInfo().height - 14) continue
          if (!byLine.has(line) || mark.active) byLine.set(line, { id: mark.id, top: position.top })
        }
        setActions([...byLine.values()])
      })
    }
    updateOverlay.current = placeActions
    const scroll = view.onDidScrollChange((event) => {
      placeActions()
      if (!event.scrollTopChanged || applyingScroll || writing.current || !current.current.onVerticalScroll)
        return
      cancelAnimationFrame(scrollFrame)
      scrollFrame = requestAnimationFrame(() => {
        const scrollTop = view.getScrollTop()
        let line = 1
        let end = content.getLineCount()
        while (line < end) {
          const middle = Math.ceil((line + end) / 2)
          if (view.getTopForLineNumber(middle) <= scrollTop) line = middle
          else end = middle - 1
        }
        const top = view.getTopForLineNumber(line)
        const height = Math.max(1, view.getBottomForLineNumber(line) - top)
        const fraction = Math.max(0, Math.min(0.999, (scrollTop - top) / height))
        current.current.onVerticalScroll?.(line - 1 + fraction)
      })
    })
    const layout = view.onDidLayoutChange(placeActions)
    const change = content.onDidChangeContent((event) => {
      if (writing.current) return
      raw.current = editorValue(content, raw.current, event)
      current.current.onChange?.(raw.current)
    })
    return () => {
      for (const event of scrollInputs) target.removeEventListener(event, claimScroll, true)
      cancelAnimationFrame(frame)
      cancelAnimationFrame(scrollFrame)
      scroll.dispose()
      layout.dispose()
      change.dispose()
      view.dispose()
      content.dispose()
      decorations.current = null
      updateOverlay.current = () => {}
      editor.current = null
      model.current = null
    }
  }, [])
  useEffect(() => {
    if (!model.current) return
    raw.current = text
    writing.current = true
    const input = displayText(text)
    if (model.current.getValue(monaco.editor.EndOfLinePreference.LF) !== input) model.current.setValue(input)
    if (model.current.getLanguageId() !== id) monaco.editor.setModelLanguage(model.current, id)
    writing.current = false
    editor.current?.updateOptions({ ...appearance(visual), ariaLabel: label, readOnly })
  }, [text, id, visual, label, readOnly])
  useEffect(() => {
    const lineCount = model.current?.getLineCount() ?? 1
    decorations.current?.set(
      (marks ?? []).map(({ start, count, tone, active }) => ({
        range: new monaco.Range(
          Math.min(start + 1, lineCount),
          1,
          Math.min(start + Math.max(count, 1), lineCount),
          1,
        ),
        options: {
          isWholeLine: true,
          className: [
            'merge-line',
            'merge-tone-' + tone,
            count ? '' : 'merge-gap',
            active ? 'merge-active' : '',
          ].join(' '),
          linesDecorationsClassName: 'merge-line-marker merge-tone-' + tone,
        },
      })),
    )
    updateOverlay.current()
  }, [marks])
  useEffect(() => {
    if (!reveal) return
    const line = Math.min(reveal.line, model.current?.getLineCount() ?? 1)
    quietScroll.current(() => editor.current?.revealLineInCenter(line))
  }, [reveal])

  return (
    <div className="code-pane">
      <div className="monaco-host" ref={host} />
      {gutterAction &&
        actions.map(({ id, top }) => (
          <div className="three-inline-action" key={id} style={{ top }}>
            {gutterAction(id)}
          </div>
        ))}
    </div>
  )
}
