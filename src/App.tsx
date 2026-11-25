import {
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { copy, download } from './core/export'
import { readText } from './core/folders'
import { WorkspaceHistory } from './core/history'
import { sampleLeft, sampleRight } from './core/sample'
import {
  blankSession,
  decodeShare,
  encodeShare,
  MAX_SESSION,
  parseSession,
  type Session,
  type Workspace,
} from './core/session'
import {
  checkText,
  detectLanguage,
  displayText,
  ending,
  mergeBlocks,
  prettyJSON,
  type Side,
} from './core/text'
import type { TransferRequest } from './core/transfer.worker'
import TransferWorker from './core/transfer.worker?worker'
import { CodePane, type DiffHandle, DiffWorkspace, useMonacoTheme } from './editor/workspace'
import { Button, Dialog, Icon, Popover } from './ui/controls'
import { FolderWorkspace } from './ui/folders'
import { languages, Settings, ShortcutHelp } from './ui/settings'
import { ThreeWorkspace } from './ui/three-way'
import { UsageNotice } from './ui/usage'
import {
  getLocal,
  loadStored,
  loadVisual,
  prefsKey,
  savesEnabledKey,
  savesKey,
  useComparison,
  useSystemDark,
} from './ui/workspace-state'
import { workerTask } from './ui/worker-task'
import { type UsageEvent, trackUsage, usageStorageKey } from './usage'

const modes = [
  ['text', 'Text', 'text'],
  ['folders', 'Folders', 'folder'],
  ['three', 'Three-way', 'three'],
] as const
const Preview = lazy(() => import('./ui/preview'))
const titles = { left: 'Original', right: 'Modified', base: 'Base' }
type Mode = (typeof modes)[number][0]
type Panel =
  | ''
  | 'settings'
  | 'export'
  | 'raw'
  | 'share'
  | 'sessions'
  | 'shortcuts'
  | 'search'
  | 'patch'
  | 'preview'
const panelEvents: Partial<Record<Panel, UsageEvent>> = {
  settings: 'settings_opened',
  export: 'export_opened',
  sessions: 'sessions_opened',
  shortcuts: 'shortcuts_opened',
  search: 'search_opened',
  preview: 'preview_opened',
}
const modeEvents = { text: 'mode_text', folders: 'mode_folders', three: 'mode_three_way' } as const
const mergeEvents = { left: 'text_merge_original', right: 'text_merge_modified' } as const
const arrowEvents = { left: 'text_merge_arrow_original', right: 'text_merge_arrow_modified' } as const
const exportEvents = {
  raw: 'export_preview',
  copy: 'export_copy',
  patch: 'export_patch',
  html: 'export_html',
} as const
type FolderDocument = {
  path: string
  stage: (text: string) => void
  navigate: (direction: number) => void
  siblings: string[]
  pick: (path: string) => void
}
type Target = keyof Workspace | 'pair' | 'session' | 'patch'
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'The operation could not be completed.'

export default function App() {
  const [session, setSession] = useState(blankSession)
  const sessionRef = useRef(session)
  const history = useRef(new WorkspaceHistory())
  const [mode, setMode] = useState<Mode>('text')
  const [visual, setVisual] = useState(loadVisual)
  const [split, setSplit] = useState(true)
  const [divider, setDivider] = useState(0)
  const [fold, setFold] = useState(false)
  const [onlyChanges, setOnlyChanges] = useState(false)
  const [showIgnored, setShowIgnored] = useState(false)
  const [manual, setManual] = useState(false)
  const [revision, setRevision] = useState(0)
  const [current, setCurrent] = useState(-1)
  const [selected, setSelected] = useState<number[]>([])
  const [panel, setPanel] = useState<Panel>('')
  const [notice, setNotice] = useState('')
  const [fileKey, setFileKey] = useState(0)
  const [focusMode, setFocusMode] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [link, setLink] = useState('')
  const [fragmentLoaded, setFragmentLoaded] = useState(false)
  const [folDoc, setFolDoc] = useState<FolderDocument>()
  const [showFolderList, setShowFolderList] = useState(false)
  const [folderWidth, setFolderWidth] = useState(230)
  const [raw, setRaw] = useState('')
  const [patchName, setPatchName] = useState('')
  const [pendingPatch, setPendingPatch] = useState<{ after: string; before: string }>()
  const [tabs, setTabs] = useState<{ id: number; data: Session }[]>([])
  const nextTab = useRef(0)
  const [saved, setSaved] = useState(loadStored)
  const [storage, setStorage] = useState(() => getLocal(savesEnabledKey) === 'yes')
  const [search, setSearch] = useState('')
  const editor = useRef<DiffHandle>(null)
  const input = useRef<HTMLInputElement>(null)
  const target = useRef<Target>('pair')
  const asyncRevision = useRef(0)
  const messageTimer = useRef<number>(0)
  const activeTransfer = useRef<ReturnType<typeof workerTask<TransferRequest, string>> | null>(null)
  const systemDark = useSystemDark()
  const dark = visual.theme === 'dark' || (visual.theme === 'system' && systemDark)
  useMonacoTheme(visual, dark)
  const diff = useComparison(session, manual, revision, mode === 'text')
  const blocks = diff.diff.blocks
  const whitespaceLines = blocks.reduce((count, block) => count + (block.whitespace ? block.aCount : 0), 0)
  const ignored = useMemo(() => {
    if (!showIgnored || diff.diff === diff.raw) return []
    const key = ({ a, b, aCount, bCount }: (typeof blocks)[number]) => [a, b, aCount, bCount].join('/')
    const actionable = new Set(blocks.map(key))
    return diff.raw.blocks.filter((block) => !actionable.has(key(block)))
  }, [showIgnored, diff.diff, diff.raw, blocks])
  const isReady = !diff.stale && !diff.error
  const hasContent = !!(session.left.text || session.right.text)
  const activeOptions = Object.entries(session.options).filter(
    ([key, value]) => key !== 'context' && (Array.isArray(value) ? value.length : value),
  ).length

  useEffect(() => {
    const event = panelEvents[panel]
    if (event) trackUsage(event)
  }, [panel])

  const message = useCallback((text: string) => {
    window.clearTimeout(messageTimer.current)
    setNotice(text)
    if (text) messageTimer.current = window.setTimeout(() => setNotice(''), 6500)
  }, [])
  const commit = useCallback((next: Session, group = '', reset = true) => {
    if (next === sessionRef.current) return
    history.current.record(sessionRef.current, group)
    sessionRef.current = next
    setSession(next)
    if (reset) {
      setCurrent(-1)
      setSelected([])
    }
  }, [])
  function edit(side: keyof Workspace, text: string) {
    const old = sessionRef.current
    if (old[side].text === text) return
    try {
      checkText(text)
    } catch (error) {
      const restore = { ...old, [side]: { ...old[side] } }
      sessionRef.current = restore
      setSession(restore)
      message(errorMessage(error))
      return
    }
    commit({ ...old, merge: undefined, [side]: { ...old[side], text } }, side)
  }
  const activate = useCallback(
    (next: Session) => {
      asyncRevision.current++
      setFolDoc(undefined)
      commit(next)
      setMode(next.mode)
      setRevision((value) => value + 1)
    },
    [commit],
  )
  function rename(side: keyof Workspace, name: string) {
    const old = sessionRef.current
    commit({ ...old, [side]: { ...old[side], name } }, `${side}-name`, false)
  }
  function moveHistory(direction: 'undo' | 'redo') {
    const next = history.current[direction](sessionRef.current)
    if (!next) return
    trackUsage(direction)
    asyncRevision.current++
    sessionRef.current = next
    setSession(next)
    if (mode !== 'folders') setMode(next.mode)
    setCurrent(-1)
    setSelected([])
    setRevision((value) => value + 1)
  }
  function switchMode(value: Mode) {
    if (value !== mode) trackUsage(modeEvents[value])
    asyncRevision.current++
    setMode(value)
    if (value === 'folders') return
    const next = { ...sessionRef.current, mode: value }
    sessionRef.current = next
    setSession(next)
    if (value === 'text') setRevision((value) => value + 1)
  }
  function swap() {
    const previous = sessionRef.current
    commit({ ...previous, left: previous.right, right: previous.left, bookmarks: [], merge: undefined })
    setRevision((value) => value + 1)
    trackUsage('swap_sides')
  }
  function runCompare() {
    setRevision((value) => value + 1)
  }
  function compareManually() {
    runCompare()
    trackUsage('manual_compare')
  }
  function chooseLayout(value: boolean) {
    if (value !== split) trackUsage(value ? 'layout_split' : 'layout_unified')
    setSplit(value)
  }
  function clearBoth() {
    const previous = sessionRef.current
    commit({
      ...previous,
      left: { ...previous.left, text: '' },
      right: { ...previous.right, text: '' },
      bookmarks: [],
      merge: undefined,
    })
    runCompare()
  }
  function clear() {
    if (!window.confirm('Clear the active workspace, open sessions, folder data and undo history?')) return
    trackUsage('workspace_cleared')
    asyncRevision.current++
    window.clearTimeout(messageTimer.current)
    history.current = new WorkspaceHistory()
    const clean = blankSession()
    sessionRef.current = clean
    setSession(clean)
    setTabs([])
    setSelected([])
    setCurrent(-1)
    setFolDoc(undefined)
    setRaw('')
    setLink('')
    setSearch('')
    setPendingPatch(undefined)
    activeTransfer.current?.cancel()
    activeTransfer.current = null
    setPanel('')
    setFileKey((value) => value + 1)
    if (location.hash.startsWith('#ck1=')) removeFragment()
    setMode('text')
    runCompare()
    message('Workspace cleared.')
  }
  function choose(selection: Target) {
    if (!input.current) return
    target.current = selection
    input.current.multiple = selection === 'pair'
    input.current.accept =
      selection === 'session' ? '.json' : selection === 'patch' ? '.patch,.diff,.txt' : ''
    input.current.click()
  }
  async function load(files: File[], selection: Target) {
    if (!files.length) return
    const generation = ++asyncRevision.current
    try {
      if (selection === 'session') {
        if (files[0].size > MAX_SESSION) throw new Error('Session file exceeds the import size limit.')
        const data = parseSession(await files[0].text())
        if (generation === asyncRevision.current) {
          activate(data)
          setPanel('')
          message('Session imported.')
        }
        return
      }
      if (selection === 'patch') {
        const before = sessionRef.current.right.text
        const patch = await readText(files[0])
        if (generation !== asyncRevision.current) return
        const after = await transfer({ kind: 'apply', text: before, patch })
        if (generation === asyncRevision.current) {
          setPendingPatch({ before, after })
          setPanel('patch')
        }
        return
      }
      if (files.length > 2) throw new Error('Open up to two text files at a time.')
      const read = await Promise.all(
        files.map(async (file) => ({ name: file.name.slice(0, 512), text: await readText(file) })),
      )
      if (generation !== asyncRevision.current) return
      const old = sessionRef.current
      const entries =
        files.length > 1
          ? { left: read[0], right: read[1] }
          : { [selection === 'pair' ? 'left' : selection]: read[0] }
      commit({ ...old, ...entries, bookmarks: [], merge: undefined })
      runCompare()
      trackUsage('text_files_opened')
    } catch (error) {
      if (generation === asyncRevision.current && errorMessage(error)) message(errorMessage(error))
    }
  }
  function fileChanged(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    void load(files, target.current)
  }
  function drop(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.files.length || mode !== 'text') return
    event.preventDefault()
    setDragging(false)
    const bounds = event.currentTarget.getBoundingClientRect()
    void load(
      Array.from(event.dataTransfer.files),
      event.clientX < bounds.left + bounds.width / 2 ? 'left' : 'right',
    )
  }
  function go(index: number) {
    if (!isReady || !blocks.length) return
    const next = (index + blocks.length) % blocks.length
    setCurrent(next)
    editor.current?.go(blocks[next])
  }
  function navigate(direction: number) {
    go(current < 0 ? (direction > 0 ? 0 : blocks.length - 1) : current + direction)
  }
  function bookmark() {
    if (!blocks[current]) return
    const old = sessionRef.current
    const index = blocks[current].a
    const bookmarks = old.bookmarks.includes(index)
      ? old.bookmarks.filter((item) => item !== index)
      : [...old.bookmarks, index].slice(0, 1000)
    commit({ ...old, bookmarks }, '', false)
    trackUsage('bookmark_toggled')
  }
  const marked = useMemo(
    () => blocks.flatMap((block, index) => (session.bookmarks.includes(block.a) ? [index] : [])),
    [blocks, session.bookmarks],
  )
  function jumpBookmark(direction: number) {
    if (!marked.length) return
    go(
      direction > 0
        ? (marked.find((item) => item > current) ?? marked[0])
        : ([...marked].reverse().find((item) => item < current) ?? marked[marked.length - 1]),
    )
  }
  function merge(side: Side, indexes: number[], arrow = false) {
    if (!isReady || !indexes.length) return
    try {
      const old = sessionRef.current
      const text = mergeBlocks(
        old.left.text,
        old.right.text,
        side,
        indexes.map((index) => blocks[index]),
      )
      checkText(text)
      commit({ ...old, merge: undefined, [side]: { ...old[side], text } })
      runCompare()
      trackUsage((arrow ? arrowEvents : mergeEvents)[side])
      message(indexes.length + (indexes.length === 1 ? ' change applied.' : ' changes applied.'))
    } catch (error) {
      message(errorMessage(error))
    }
  }
  async function format(side: Side) {
    try {
      const old = sessionRef.current[side]
      if (detectLanguage(old) === 'json' || visual.language === 'json') {
        const prefix = old.text.startsWith('\uFEFF') ? '\uFEFF' : ''
        edit(
          side,
          prefix +
            prettyJSON(old.text, session.options.jsonKeys).replace(/\n/g, ending(old.text)) +
            (/\r|\n$/.test(old.text.slice(-1)) ? ending(old.text) : ''),
        )
      } else if (detectLanguage(old) === 'yaml' || visual.language === 'yaml') {
        const { parseDocument } = await import('yaml')
        const yaml = parseDocument(displayText(old.text))
        if (yaml.errors.length) throw new Error('YAML contains syntax errors and could not be formatted.')
        if (sessionRef.current[side] === old)
          edit(
            side,
            (old.text.startsWith('\uFEFF') ? '\uFEFF' : '') +
              yaml.toString().replace(/\n/g, ending(old.text)),
          )
      } else if (!(await editor.current?.format(side)))
        message('No formatting changes from the selected language formatter.')
    } catch (error) {
      message(errorMessage(error))
    }
  }
  function transfer(request: TransferRequest) {
    activeTransfer.current?.cancel()
    const task = workerTask<TransferRequest, string>(new TransferWorker(), request, 8000)
    activeTransfer.current = task
    return task.result.finally(() => {
      if (activeTransfer.current === task) activeTransfer.current = null
    })
  }
  async function exportAction(action: 'raw' | 'copy' | 'patch' | 'html' | 'session') {
    const generation = asyncRevision.current
    try {
      if (action === 'session') {
        const serialized = JSON.stringify(session)
        if (new Blob([serialized]).size > MAX_SESSION)
          throw new Error('The session exceeds the 28 MiB import limit. Export panes individually.')
        download('comparison.comparekit.json', serialized, 'application/json')
        trackUsage('export_session')
        return
      }
      const data = await transfer(
        action === 'html'
          ? {
              kind: 'report',
              left: session.left,
              right: session.right,
              options: session.options,
              unified: !split,
            }
          : {
              kind: 'patch',
              left: session.left.text,
              right: session.right.text,
              context: session.options.context,
              path:
                patchName ||
                folDoc?.path ||
                (session.right.name === 'Modified' ? 'comparison.txt' : session.right.name),
            },
      )
      if (generation !== asyncRevision.current) return
      if (action === 'html') download('comparison.html', data, 'text/html;charset=utf-8')
      if (action === 'copy') {
        await copy(data)
        message('Diff copied.')
      }
      if (action === 'patch') download('comparison.patch', data)
      if (action === 'raw') {
        setRaw(data)
        setPanel('raw')
      }
      trackUsage(exportEvents[action])
    } catch (error) {
      if (errorMessage(error)) message(errorMessage(error))
    }
  }
  function onClipboard(text: string) {
    void copy(text).then(
      () => message('Copied.'),
      (error) => message(errorMessage(error)),
    )
  }
  async function paste(side: Side) {
    try {
      if (!navigator.clipboard || !window.isSecureContext)
        throw new Error('Use your keyboard to paste into the editor.')
      const old = sessionRef.current
      const text = await navigator.clipboard.readText()
      if (sessionRef.current === old) edit(side, text)
    } catch {
      editor.current?.focus(side)
      message('Use Ctrl+V or ⌘+V to paste into the editor.')
    }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      setFocusMode((value) => !value)
    }
  }
  function removeFragment() {
    window.history.replaceState(null, '', location.pathname + location.search)
    setFragmentLoaded(false)
  }
  useEffect(() => {
    let active = true
    function importFragment() {
      const fragment = location.hash
      if (!fragment.startsWith('#ck1=')) {
        setFragmentLoaded(false)
        return
      }
      const generation = ++asyncRevision.current
      void decodeShare(fragment).then(
        (data) => {
          if (!active || generation !== asyncRevision.current || fragment !== location.hash) return
          activate(data)
          setPanel('')
          setLink('')
          setFragmentLoaded(true)
        },
        (error) => {
          if (active && generation === asyncRevision.current) message(errorMessage(error))
        },
      )
    }
    importFragment()
    window.addEventListener('hashchange', importFragment)
    return () => {
      active = false
      window.removeEventListener('hashchange', importFragment)
    }
  }, [activate, message])
  useEffect(() => {
    try {
      if (visual.remember) localStorage.setItem(prefsKey, JSON.stringify(visual))
      else localStorage.removeItem(prefsKey)
    } catch {
      /* Storage is optional. */
    }
  }, [visual])
  function storeEnabled(value: boolean) {
    try {
      if (value) localStorage.setItem(savesEnabledKey, 'yes')
      else {
        localStorage.removeItem(savesEnabledKey)
        localStorage.removeItem(savesKey)
        setSaved([])
      }
      setStorage(value)
    } catch {
      message('This browser does not allow local storage.')
    }
  }
  function saveSessions(next: Session[]) {
    try {
      localStorage.setItem(savesKey, JSON.stringify(next))
      setSaved(next)
    } catch {
      message('Could not store sessions. Export as JSON instead.')
    }
  }
  function setSessionName(title: string) {
    const old = sessionRef.current
    commit({ ...old, title }, 'session-title', false)
  }
  function swapSession(next: Session, selectedId?: number) {
    const tab = { data: session, id: nextTab.current++ }
    setTabs((items) => [...items.filter(({ id }) => id !== selectedId), tab].slice(-12))
    activate(next)
    setPanel('')
    trackUsage(selectedId === undefined ? 'session_created' : 'session_switched')
  }

  const shortcutRef = useRef<(event: KeyboardEvent) => void>(() => {})
  shortcutRef.current = (event) => {
    if (panel) return
    const key = event.key.toLowerCase()
    const mod = event.ctrlKey || event.metaKey
    const shift = event.shiftKey
    const textField =
      event.target instanceof HTMLElement &&
      !!event.target.closest('input,textarea,select,[contenteditable="true"]:not(.monaco-editor *)')
    let action: (() => void) | undefined
    if (mode === 'text' && event.key === 'F7') action = () => navigate(shift ? -1 : 1)
    if (event.key === 'Escape' && focusMode) action = () => setFocusMode(false)
    if (
      mode === 'text' &&
      event.altKey &&
      ['arrowleft', 'arrowright'].includes(key) &&
      (!textField || !!(event.target as HTMLElement).closest('.monaco-editor'))
    ) {
      action = shift
        ? () => jumpBookmark(key === 'arrowleft' ? -1 : 1)
        : () =>
            merge(
              key === 'arrowleft' ? 'left' : 'right',
              [Math.max(current, 0)].filter((i) => !!blocks[i]),
            )
    }
    if (event.altKey && shift && key === 'f') action = () => void fullscreen()
    if (mod) {
      if (key === 'enter' && mode === 'text') action = compareManually
      if (key === 'o') action = () => choose('pair')
      if (key === 's') action = () => setPanel('export')
      if (key === '/') action = () => setPanel('shortcuts')
      if (key === ',') action = () => setPanel('settings')
      if (key === 'z' || key === 'y') {
        if (!textField || !!(event.target as HTMLElement).closest('.monaco-editor'))
          action = () => moveHistory(key === 'y' || shift ? 'redo' : 'undo')
      }
      if (mode === 'text') {
        if (key === 'b' && !shift) action = bookmark
        if (key === 'x' && shift) action = swap
        if (key === 'u' && shift) action = () => chooseLayout(!split)
        if (key === 'h' && shift)
          action = () => {
            setFold((value) => !value)
            trackUsage('toggle_fold')
          }
        if (key === 'c' && shift) action = () => exportAction('copy')
        if (key === 'p' && shift) action = () => exportAction('patch')
        if (key === 'f' && shift) action = () => setPanel('search')
      }
    }
    if (action) {
      event.preventDefault()
      event.stopPropagation()
      action()
    }
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => shortcutRef.current(event)
    window.addEventListener('keydown', keydown, true)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      window.clearTimeout(messageTimer.current)
      activeTransfer.current?.cancel()
    }
  }, [])

  const sideMenus = (side: Side) => (
    <>
      <Button onClick={() => void paste(side)}>Paste</Button>
      <Button onClick={() => onClipboard(session[side].text)}>Copy all</Button>
      <Button onClick={() => download(session[side].name, session[side].text)}>Download</Button>
      <Button
        onClick={() => {
          edit(side, '')
          runCompare()
        }}
      >
        Clear
      </Button>
      <Button onClick={() => editor.current?.find(side, true)}>Find and replace</Button>
      <Button onClick={() => void format(side)}>Format document</Button>
    </>
  )
  const status =
    diff.error ||
    (diff.stale && hasContent
      ? manual
        ? 'Comparison pending'
        : 'Comparing…'
      : !hasContent
        ? 'Ready'
        : blocks.length
          ? current >= 0
            ? `Change ${current + 1} of ${blocks.length}`
            : `${blocks.length} changes`
          : session.left.text === session.right.text
            ? 'Identical'
            : 'No changes with current rules')
  const similarities = diff.diff.leftLines + diff.diff.rightLines
  const similarity = similarities
    ? Math.round(100 * (1 - (diff.diff.added + diff.diff.removed) / similarities))
    : 100
  const lineEndingLabel = (text: string) =>
    ending(text) === '\r\n' ? 'CRLF' : ending(text) === '\r' ? 'CR' : 'LF'
  const leftText = session.left.text
  const rightText = session.right.text
  const searchResults = useMemo(() => {
    const result: { side: Side; index: number; line: string }[] = []
    if (!search || panel !== 'search') return result
    const needle = search.toLowerCase()
    for (const [side, text] of [
      ['left', leftText],
      ['right', rightText],
    ] as const) {
      const lines = displayText(text).split('\n')
      let count = 0
      for (let index = 0; index < lines.length && count < 50; index++) {
        if (!lines[index].toLowerCase().includes(needle)) continue
        result.push({ side, index, line: lines[index] })
        count++
      }
    }
    return result
  }, [search, leftText, rightText, panel])

  return (
    <main
      className={`app${focusMode ? ' focus-mode' : ''}`}
      data-theme={dark ? 'dark' : 'light'}
      style={{ '--modified': visual.modified, '--conflict': visual.conflict } as CSSProperties}
    >
      <input type="file" ref={input} hidden aria-label="Open comparison file" onChange={fileChanged} />
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <Icon name="logo" size={17} />
          </span>
          <strong>CompareKit</strong>
        </div>
        <nav className="segments mode-tabs" aria-label="Comparison mode">
          {modes.map(([id, label, icon]) => (
            <Button key={id} icon={icon} aria-pressed={mode === id} onClick={() => switchMode(id)}>
              {label}
            </Button>
          ))}
        </nav>
        <div className="grow" />
        <span className="local-indicator" title="Comparison content stays in this browser by default">
          <Icon name="lock" size={13} /> {usageStorageKey ? 'Local comparisons' : 'Local only'}
        </span>
        <Button icon="file" label="Sessions" onClick={() => setPanel('sessions')} />
        <Button icon="settings" label="Settings" onClick={() => setPanel('settings')} />
        <Button icon="fullscreen" label="Fullscreen workspace" onClick={() => void fullscreen()} />
        <Popover icon="more" title="Workspace menu">
          <Button icon="focus" onClick={() => setFocusMode(!focusMode)}>
            Focus mode
          </Button>
          {mode === 'text' && <Button onClick={() => setPanel('preview')}>Document preview</Button>}
          {mode === 'text' && <Button onClick={clearBoth}>Clear both sides</Button>}
          <Button onClick={() => setPanel('shortcuts')}>Keyboard shortcuts</Button>
          <Button icon="trash" onClick={clear}>
            Clear workspace
          </Button>
        </Popover>
      </header>
      {fragmentLoaded && (
        <div className="banner">
          <span>A comparison was opened from a link containing its contents.</span>
          <Button onClick={removeFragment}>Remove data from URL</Button>
        </div>
      )}
      {focusMode && (
        <Button icon="focus" className="focus-exit" onClick={() => setFocusMode(false)}>
          Exit focus mode
        </Button>
      )}
      {mode !== 'folders' && (
        <div className="toolbar">
          <Button
            icon="open"
            className="outlined"
            title="Open files (Ctrl/⌘+O)"
            onClick={() => choose('pair')}
          >
            Open files
          </Button>
          {mode === 'text' && (
            <>
              <Button icon="swap" label="Swap sides" onClick={swap} />
              <span className="separator" />
              <Button
                icon="undo"
                label="Undo"
                disabled={!history.current.canUndo}
                onClick={() => moveHistory('undo')}
              />
              <Button
                icon="redo"
                label="Redo"
                disabled={!history.current.canRedo}
                onClick={() => moveHistory('redo')}
              />
              <span className="separator" />
              <nav className="segments view-tabs" aria-label="Diff layout">
                <Button icon="split" aria-pressed={split} onClick={() => chooseLayout(true)}>
                  Split
                </Button>
                <Button icon="inline" aria-pressed={!split} onClick={() => chooseLayout(false)}>
                  Unified
                </Button>
              </nav>
              <Button
                icon="fold"
                label="Fold unchanged sections"
                aria-pressed={fold}
                onClick={() => {
                  setOnlyChanges(false)
                  setFold(!fold)
                  trackUsage('toggle_fold')
                }}
              />
              <Button icon="settings" onClick={() => setPanel('settings')}>
                Options{activeOptions ? ` (${activeOptions})` : ''}
              </Button>
              {!manual && (
                <span className="live-indicator" title="Compares while you type">
                  <span /> Live
                </span>
              )}
              {manual && (
                <Button icon="bolt" onClick={compareManually}>
                  Compare now
                </Button>
              )}
            </>
          )}
          {mode === 'three' && (
            <>
              <Button
                icon="undo"
                label="Undo"
                disabled={!history.current.canUndo}
                onClick={() => moveHistory('undo')}
              />
              <Button
                icon="redo"
                label="Redo"
                disabled={!history.current.canRedo}
                onClick={() => moveHistory('redo')}
              />
            </>
          )}
          <div className="grow" />
          {mode === 'text' && (
            <>
              <Button
                icon="up"
                label="Previous change"
                title="Previous change (Shift+F7)"
                onClick={() => navigate(-1)}
                disabled={!isReady || !blocks.length}
              />
              <output className="change-number" aria-label="Change count">
                {current >= 0 && isReady ? `${current + 1} / ` : ''}
                {isReady ? blocks.length : '—'}
              </output>
              <Button
                icon="down"
                label="Next change"
                title="Next change (F7)"
                onClick={() => navigate(1)}
                disabled={!isReady || !blocks.length}
              />
              <Popover icon="bookmark" title="Bookmarks and merge">
                <Button onClick={bookmark} disabled={!blocks[current] || !isReady}>
                  Toggle change bookmark
                </Button>
                <Button onClick={() => jumpBookmark(-1)}>Previous bookmark</Button>
                <Button onClick={() => jumpBookmark(1)}>Next bookmark</Button>
                <Button
                  onClick={() =>
                    setSelected((items) =>
                      items.includes(current)
                        ? items.filter((item) => item !== current)
                        : [...items, current],
                    )
                  }
                  disabled={!blocks[current] || !isReady}
                >
                  {selected.includes(current) ? 'Deselect current change' : 'Select current change'}
                </Button>
                <Button onClick={() => merge('left', selected)} disabled={!selected.length || !isReady}>
                  Apply selected to original ({selected.length})
                </Button>
                <Button onClick={() => merge('right', selected)} disabled={!selected.length || !isReady}>
                  Apply selected to modified ({selected.length})
                </Button>
                <Button
                  onClick={() =>
                    merge(
                      'left',
                      blocks.map((_, index) => index),
                    )
                  }
                  disabled={!blocks.length || !isReady}
                >
                  Apply all to original
                </Button>
                <Button
                  onClick={() =>
                    merge(
                      'right',
                      blocks.map((_, index) => index),
                    )
                  }
                  disabled={!blocks.length || !isReady}
                >
                  Apply all to modified
                </Button>
                <Button
                  onClick={() => {
                    setOnlyChanges(true)
                    setFold(true)
                    trackUsage('toggle_only_changes')
                  }}
                >
                  Show only changes
                </Button>
                <Button
                  onClick={() => {
                    setOnlyChanges(false)
                    setFold(false)
                  }}
                >
                  Expand all unchanged sections
                </Button>
              </Popover>
              <Button icon="search" label="Search both versions" onClick={() => setPanel('search')} />
            </>
          )}
          <Button icon="export" className="accent-button" onClick={() => setPanel('export')}>
            Export
          </Button>
        </div>
      )}
      <FolderWorkspace
        key={fileKey}
        hidden={mode !== 'folders'}
        context={session.options.context}
        message={message}
        open={(path, left, right, stage, navigate, siblings, pick) => {
          asyncRevision.current++
          setFolDoc({ path, stage, navigate, siblings, pick })
          commit({
            ...sessionRef.current,
            mode: 'text',
            left: { name: path, text: left },
            right: { name: path, text: right },
            bookmarks: [],
            merge: undefined,
          })
          setMode('text')
          runCompare()
        }}
      />
      {mode === 'three' && (
        <ThreeWorkspace
          input={session}
          visual={visual}
          edit={edit}
          message={message}
          open={choose}
          compareTwo={() => switchMode('text')}
          setScrollSync={(threeWayScroll) => setVisual((current) => ({ ...current, threeWayScroll }))}
          merge={session.merge}
          updateMerge={(merge, group) => commit({ ...sessionRef.current, merge }, group, false)}
        />
      )}
      {mode === 'text' && (
        <>
          {folDoc && (
            <div className="folder-breadcrumb">
              <Button icon="folder" onClick={() => switchMode('folders')}>
                Folder results
              </Button>
              <span title={folDoc.path}>{folDoc.path}</span>
              <div className="grow" />
              <Button icon="left" label="Previous changed file" onClick={() => folDoc.navigate(-1)} />
              <Button icon="right" label="Next changed file" onClick={() => folDoc.navigate(1)} />
              <Button icon="split" onClick={() => setShowFolderList(!showFolderList)}>
                Files
              </Button>
              <Button icon="plus" onClick={() => folDoc.stage(session.right.text)}>
                Stage modified
              </Button>
            </div>
          )}
          <div className="text-area" style={{ '--folder-width': `${folderWidth}px` } as CSSProperties}>
            {folDoc && showFolderList && (
              <aside className="file-sidebar">
                <label className="field">
                  Width
                  <input
                    type="range"
                    min={140}
                    max={380}
                    value={folderWidth}
                    onChange={(event) => setFolderWidth(Number(event.target.value))}
                  />
                </label>
                <div>
                  {folDoc.siblings.map((path) => (
                    <button
                      type="button"
                      key={path}
                      title={path}
                      aria-current={path === folDoc.path}
                      onClick={() => folDoc.pick(path)}
                    >
                      {path}
                    </button>
                  ))}
                </div>
              </aside>
            )}
            <section
              className={`text-workspace${dragging ? ' dragging' : ''}`}
              aria-label="Text comparison"
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes('Files')) {
                  event.preventDefault()
                  setDragging(true)
                }
              }}
              onDragLeave={(event) => {
                if (
                  !(event.relatedTarget instanceof Node) ||
                  !event.currentTarget.contains(event.relatedTarget)
                )
                  setDragging(false)
              }}
              onDrop={drop}
            >
              <div
                className="pane-headers"
                style={
                  split && divider > 0
                    ? { gridTemplateColumns: `minmax(0, ${divider}px) minmax(0, 1fr)` }
                    : undefined
                }
              >
                {(['left', 'right'] as const).map((side) => (
                  <div className={`pane-header ${side}`} key={side}>
                    <span className="version-badge">{side === 'left' ? 'A' : 'B'}</span>
                    <input
                      className="version-name"
                      aria-label={`${titles[side]} version name`}
                      value={session[side].name}
                      maxLength={512}
                      onChange={(event) => rename(side, event.target.value)}
                    />
                    {!!session[side].text && (
                      <span className="pane-count">
                        {side === 'left' ? diff.diff.leftLines : diff.diff.rightLines} lines
                      </span>
                    )}
                    <Button icon="open" label={`Open ${side} file`} onClick={() => choose(side)} />
                    <Button
                      icon="search"
                      label={`Find in ${titles[side].toLowerCase()}`}
                      onClick={() => editor.current?.find(side)}
                    />
                    <Popover icon="more" title={`${titles[side]} actions`}>
                      {sideMenus(side)}
                    </Popover>
                  </div>
                ))}
              </div>
              <div className="editor-region">
                <DiffWorkspace
                  ref={editor}
                  left={session.left}
                  right={session.right}
                  visual={visual}
                  sideBySide={split}
                  fold={fold}
                  context={onlyChanges ? 0 : session.options.context}
                  blocks={blocks}
                  ignored={ignored}
                  current={current}
                  marked={marked}
                  stale={!isReady}
                  options={session.options}
                  onChange={edit}
                  onMerge={(side, index) => merge(side, [index], true)}
                  onDivider={setDivider}
                />
                {!hasContent && (
                  <div className={`empty-editor${!split ? ' single-empty' : ''}`}>
                    {(split ? (['left', 'right'] as const) : (['right'] as const)).map((side) => (
                      <div className="empty-side" key={side}>
                        <div className="empty-icon">
                          <Icon name="file" size={23} />
                        </div>
                        <p>Paste {side === 'left' ? 'original' : 'modified'} text</p>
                        <div>
                          <Button
                            onClick={() => {
                              editor.current?.focus(side)
                              message('Paste with Ctrl+V or ⌘+V.')
                            }}
                          >
                            Focus editor
                          </Button>
                          <span>or</span>
                          <Button onClick={() => choose(side)}>open a file</Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      className="sample-button"
                      icon="code"
                      onClick={() => {
                        commit({
                          ...sessionRef.current,
                          left: { name: 'server-before.yaml', text: sampleLeft },
                          right: { name: 'server-after.yaml', text: sampleRight },
                          bookmarks: [],
                          merge: undefined,
                        })
                        runCompare()
                        trackUsage('sample_opened')
                      }}
                    >
                      Try sample
                    </Button>
                  </div>
                )}
                {dragging && (
                  <div className="drop-overlay">
                    <Icon name="open" size={30} /> Drop one or two local text files
                  </div>
                )}
              </div>
            </section>
          </div>
          <footer className="statusbar">
            <span className={diff.error ? 'error status-summary' : 'status-summary'} role="status">
              {status}
            </span>
            {hasContent && isReady && (
              <>
                <span className="stat-add">+{diff.diff.added}</span>
                <span className="stat-remove">−{diff.diff.removed}</span>
                {whitespaceLines > 0 && (
                  <span
                    className="stat-whitespace"
                    title="Lines changed only in leading or trailing spaces and tabs"
                  >
                    {whitespaceLines} whitespace-only
                  </span>
                )}
                <span
                  className="status-extra"
                  title="Content similarity is one minus the number of added and removed lines divided by the combined line count."
                >
                  {similarity}% similar
                </span>
                {showIgnored && ignored.length > 0 && <span>{ignored.length} ignored</span>}
              </>
            )}
            <div className="grow" />
            {hasContent && (
              <span
                className={
                  lineEndingLabel(session.left.text) !== lineEndingLabel(session.right.text)
                    ? 'status-extra eol-mismatch'
                    : 'status-extra'
                }
                title={`Original ${session.left.text.length} characters · Modified ${session.right.text.length} characters`}
              >
                {lineEndingLabel(session.left.text)} / {lineEndingLabel(session.right.text)}
              </span>
            )}
            <select
              aria-label="Syntax language"
              value={visual.language}
              onChange={(event) => {
                setVisual({ ...visual, language: event.target.value })
                trackUsage('editor_language')
              }}
            >
              {languages.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <span className="status-extra">{visual.font}px</span>
          </footer>
        </>
      )}
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <Button icon="close" label="Dismiss notification" onClick={() => message('')} />
        </div>
      )}
      <UsageNotice />
      {panel === 'settings' && (
        <Settings
          close={() => setPanel('')}
          visual={visual}
          setVisual={setVisual}
          options={session.options}
          setOptions={(options) => commit({ ...sessionRef.current, options })}
          manual={manual}
          setManual={(value) => {
            setManual(value)
            runCompare()
          }}
          showIgnored={showIgnored}
          setShowIgnored={setShowIgnored}
          storage={storage}
          setStorage={storeEnabled}
          clearSaved={() => {
            if (window.confirm('Remove all explicitly saved comparisons from this browser?')) {
              saveSessions([])
              message('Saved comparisons cleared.')
            }
          }}
        />
      )}
      {panel === 'shortcuts' && <ShortcutHelp close={() => setPanel('')} />}
      {panel === 'preview' && (
        <Suspense
          fallback={
            <Dialog title="Document preview" close={() => setPanel('')}>
              Opening local preview…
            </Dialog>
          }
        >
          <Preview
            left={session.left}
            right={session.right}
            language={visual.language}
            close={() => setPanel('')}
          />
        </Suspense>
      )}
      {panel === 'export' && (
        <Dialog title="Export and import" close={() => setPanel('')}>
          {mode === 'text' && (
            <>
              <label className="field column">
                Patch path
                <input
                  value={patchName}
                  onChange={(event) => setPatchName(event.target.value)}
                  maxLength={512}
                  placeholder={
                    folDoc?.path ??
                    (session.right.name === 'Modified' ? 'comparison.txt' : session.right.name)
                  }
                />
              </label>
              <p>Diffs and patches use the original text, including changes ignored in the workspace.</p>
              <div className="action-grid">
                <Button icon="code" onClick={() => exportAction('raw')}>
                  View raw diff
                </Button>
                <Button onClick={() => exportAction('copy')}>Copy diff</Button>
                <Button icon="export" onClick={() => exportAction('patch')}>
                  Download patch
                </Button>
                <Button icon="export" onClick={() => exportAction('html')}>
                  HTML report
                </Button>
                <Button icon="open" onClick={() => choose('patch')}>
                  Preview patch on modified
                </Button>
              </div>
            </>
          )}
          <div className="action-grid">
            <Button icon="export" onClick={() => exportAction('session')}>
              Export session JSON
            </Button>
            <Button icon="open" onClick={() => choose('session')}>
              Import session JSON
            </Button>
            <Button
              onClick={() => {
                setLink('')
                setPanel('share')
              }}
            >
              Create share link
            </Button>
          </div>
        </Dialog>
      )}
      {panel === 'raw' && (
        <Dialog
          title="Unified diff"
          close={() => {
            setPanel('')
            setRaw('')
          }}
          wide
        >
          <div className="form-row">
            <Button onClick={() => onClipboard(raw)}>Copy diff</Button>
            <Button icon="export" onClick={() => download('comparison.patch', raw)}>
              Download patch
            </Button>
          </div>
          <div className="dialog-editor">
            <CodePane
              text={raw || 'No differences to export.'}
              label="Raw unified diff"
              language="diff"
              visual={visual}
              readOnly
            />
          </div>
        </Dialog>
      )}
      {panel === 'patch' && pendingPatch && (
        <Dialog
          title="Patch preview"
          close={() => {
            setPanel('')
            setPendingPatch(undefined)
          }}
          wide
        >
          <p>
            The preview shows the result of applying every hunk to the modified version. Review it before
            applying.
          </p>
          <div className="dialog-editor">
            <CodePane text={pendingPatch.after} label="Patched result" visual={visual} readOnly />
          </div>
          <Button
            className="accent-button"
            onClick={() => {
              if (sessionRef.current.right.text !== pendingPatch.before)
                message('Modified text changed after preview. Reopen the patch.')
              else {
                edit('right', pendingPatch.after)
                runCompare()
                trackUsage('patch_applied')
                message('Patch applied.')
                setPanel('')
                setPendingPatch(undefined)
              }
            }}
          >
            Apply patch
          </Button>
        </Dialog>
      )}
      {panel === 'share' && (
        <Dialog
          title="Create a share link"
          close={() => {
            setPanel('')
            setLink('')
          }}
        >
          <p>
            The URL itself contains the compared content. Anyone who obtains the link may be able to recover
            that content.
          </p>
          <p>Browser history, synchronization, extensions and clipboard history can retain the link.</p>
          {!link ? (
            <Button
              className="accent-button"
              onClick={() => {
                const generation = asyncRevision.current
                void encodeShare(session).then(
                  (fragment) => {
                    if (generation === asyncRevision.current) setLink(location.href.split('#')[0] + fragment)
                  },
                  (error) => message(errorMessage(error)),
                )
              }}
            >
              Generate link
            </Button>
          ) : (
            <div className="form-row">
              <input
                aria-label="Share link"
                value={link}
                readOnly
                onFocus={(event) => event.target.select()}
              />
              <Button onClick={() => onClipboard(link)}>Copy link</Button>
            </div>
          )}
        </Dialog>
      )}
      {panel === 'sessions' && (
        <Dialog title="Comparison sessions" close={() => setPanel('')}>
          <label className="field column">
            Current session name
            <input
              maxLength={120}
              value={session.title}
              onChange={(event) => setSessionName(event.target.value)}
            />
          </label>
          <div className="action-grid">
            <Button icon="plus" onClick={() => swapSession(blankSession())}>
              New comparison
            </Button>
            <Button onClick={() => swapSession({ ...session, title: `${session.title} copy`.slice(0, 120) })}>
              Duplicate
            </Button>
            <Button onClick={() => exportAction('session')}>Export current</Button>
            {storage && (
              <Button
                onClick={() =>
                  saveSessions([...saved.filter((item) => item.title !== session.title), session].slice(-20))
                }
              >
                Save on this browser
              </Button>
            )}
          </div>
          {tabs.length > 0 && (
            <fieldset>
              <legend>Open sessions</legend>
              <ul className="session-list">
                {tabs.map(({ data, id }) => (
                  <li key={id}>
                    <Button onClick={() => swapSession(data, id)}>{data.title}</Button>
                    <Button
                      icon="close"
                      label={`Close ${data.title}`}
                      onClick={() => setTabs(tabs.filter((tab) => tab.id !== id))}
                    />
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          {saved.length > 0 && (
            <fieldset>
              <legend>Saved on this browser</legend>
              <ul className="session-list">
                {saved.map((item) => (
                  <li key={item.title}>
                    <Button
                      onClick={() => {
                        activate(item)
                        setPanel('')
                        trackUsage('session_switched')
                      }}
                    >
                      {item.title}
                    </Button>
                    <Button
                      icon="trash"
                      label={`Delete saved ${item.title}`}
                      onClick={() => saveSessions(saved.filter((entry) => entry !== item))}
                    />
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
        </Dialog>
      )}
      {panel === 'search' && (
        <Dialog title="Search both versions" close={() => setPanel('')}>
          <input
            className="full-input"
            aria-label="Search both versions"
            placeholder="Search text"
            value={search}
            onChange={(event) => setSearch(event.target.value.slice(0, 512))}
          />
          {!!search && !searchResults.length && <p>No matches.</p>}
          <ul className="search-results">
            {searchResults.map(({ side, index, line }) => (
              <li key={side + index}>
                <Button
                  onClick={() => {
                    setPanel('')
                    editor.current?.reveal(side, index + 1)
                  }}
                >
                  <strong>
                    {side === 'left' ? 'A' : 'B'} · {index + 1}
                  </strong>
                  <code>{line.slice(0, 200)}</code>
                </Button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
    </main>
  )
}
