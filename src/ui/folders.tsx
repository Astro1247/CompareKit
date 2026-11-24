import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import FolderWorker from '../core/folder.worker?worker'
import { copy, download } from '../core/export'
import {
  type Filters,
  type FolderEntry,
  type FolderResult,
  type PickedFolder,
  type PathStatus,
  folderFromHandle,
  folderFromInput,
  folderReport,
  folderSummary,
  imageType,
  ignorePreset,
  readText,
  statusLabels,
} from '../core/folders'
import type { FolderRequest } from '../core/folder.worker'
import type { Side } from '../core/text'
import { Button, bytes, Dialog, Icon, Toggle } from './controls'
import { workerTask } from './worker-task'

type Folders = Partial<Record<Side, PickedFolder>>
type WorkerMessage = { progress?: { done: number; total: number }; error?: string; result?: FolderResult }
export function FolderWorkspace({
  hidden,
  context,
  message,
  open,
}: {
  hidden: boolean
  context: number
  message: (text: string) => void
  open: (
    path: string,
    left: string,
    right: string,
    stage: (text: string) => void,
    navigate: (direction: number) => void,
    siblings: string[],
    pick: (path: string) => void,
  ) => void
}) {
  const [folders, setFolders] = useState<Folders>({})
  const [filters, setFilters] = useState<Filters>({ includes: '', excludes: '', extensions: '' })
  const [lastFilters, setLastFilters] = useState<Filters | null>(null)
  const [filterDialog, setFilterDialog] = useState(false)
  const [hideBinary, setHideBinary] = useState(false)
  const [hideIdentical, setHideIdentical] = useState(false)
  const [status, setStatus] = useState<PathStatus | ''>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<FolderResult>()
  const [progress, setProgress] = useState<{ done: number; total: number }>()
  const [detail, setDetail] = useState<FolderEntry>()
  const [stagedCount, setStagedCount] = useState(0)
  const worker = useRef<Worker | null>(null)
  const exporting = useRef<ReturnType<
    typeof workerTask<FolderRequest, string | Uint8Array<ArrayBuffer>>
  > | null>(null)
  const staged = useRef(new Map<string, string>())
  const leftInput = useRef<HTMLInputElement>(null)
  const rightInput = useRef<HTMLInputElement>(null)
  const request = useRef(0)
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
      worker.current?.terminate()
      exporting.current?.cancel()
    },
    [],
  )
  const advancedPicker = window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }

  function stop() {
    worker.current?.terminate()
    worker.current = null
    setProgress(undefined)
  }
  function resetResults() {
    stop()
    exporting.current?.cancel()
    request.current++
    staged.current.clear()
    setStagedCount(0)
    setResult(undefined)
    setDetail(undefined)
  }
  function select(side: Side, folder: PickedFolder) {
    resetResults()
    setFolders((previous) => ({ ...previous, [side]: folder }))
  }
  function input(side: Side, event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    try {
      if (files?.length) select(side, folderFromInput(files))
    } catch (error) {
      fail(error)
    }
    event.target.value = ''
  }
  async function pick(side: Side) {
    try {
      const handle = await advancedPicker.showDirectoryPicker?.()
      if (handle) select(side, await folderFromHandle(handle))
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) fail(error)
    }
  }
  function fail(error: unknown) {
    message(error instanceof Error ? error.message : 'Folder operation failed.')
  }
  function scan() {
    if (!folders.left || !folders.right) return
    stop()
    request.current++
    setDetail(undefined)
    setResult(undefined)
    setPage(0)
    setProgress({ done: 0, total: 0 })
    const scanWorker = new FolderWorker()
    worker.current = scanWorker
    scanWorker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
      if (data.progress) setProgress(data.progress)
      if (data.error) {
        stop()
        message(data.error)
      }
      if (data.result) {
        setResult(data.result)
        setLastFilters(filters)
        stop()
      }
    }
    scanWorker.onerror = () => {
      stop()
      message('The folder worker could not start.')
    }
    const job: FolderRequest = { kind: 'scan', a: folders.left, b: folders.right, filters }
    scanWorker.postMessage(job)
  }
  const textEntries =
    result?.entries.filter(
      (item) =>
        !item.directory &&
        item.status !== 'identical' &&
        item.status !== 'error' &&
        (!item.left || item.left.kind === 'text') &&
        (!item.right || item.right.kind === 'text'),
    ) ?? []
  async function openText(path: string) {
    const operation = ++request.current
    try {
      const [left, right] = await Promise.all([
        readText(folders.left?.entries.get(path)),
        readText(folders.right?.entries.get(path)),
      ])
      if (!mounted.current || operation !== request.current) return
      const current = textEntries.findIndex((item) => item.path === path)
      function stage(text: string) {
        staged.current.set(path, text)
        setStagedCount(staged.current.size)
        message('Staged for folder export.')
      }
      function navigate(direction: number) {
        const next = textEntries[current + direction]
        if (next) void openText(next.path)
        else message('No more changed text files in this direction.')
      }
      open(
        path,
        left,
        staged.current.get(path) ?? right,
        stage,
        navigate,
        textEntries.map((item) => item.path),
        openText,
      )
    } catch (error) {
      if (operation === request.current) fail(error)
    }
  }
  async function exportFolders(kind: 'copy' | 'report' | 'patch' | 'zip') {
    if (!result || !folders.left || !folders.right) return
    try {
      if (kind === 'copy') {
        await copy(folderSummary(result))
        message('Folder summary copied.')
      }
      if (kind === 'report')
        download('folder-comparison.html', folderReport(result), 'text/html;charset=utf-8')
      if (kind === 'patch' || kind === 'zip') {
        exporting.current?.cancel()
        const task = workerTask<FolderRequest, string | Uint8Array<ArrayBuffer>>(
          new FolderWorker(),
          {
            kind,
            result,
            a: folders.left,
            b: folders.right,
            edits: staged.current,
            context,
          },
          12000,
        )
        exporting.current = task
        const output = await task.result.finally(() => {
          if (exporting.current === task) exporting.current = null
        })
        if (!mounted.current) return
        if (typeof output === 'string') download('folders.patch', output)
        else download('changed-files.zip', output, 'application/zip')
      }
    } catch (error) {
      if (!(error instanceof Error) || error.message) fail(error)
    }
  }
  const totals = { left: 0, right: 0, modified: 0, identical: 0, error: 0 }
  const visible =
    result?.entries.filter((entry) => {
      ++totals[entry.status]
      return (
        (!status || entry.status === status) &&
        (!hideIdentical || entry.status !== 'identical') &&
        (!hideBinary || ![entry.left, entry.right].some((item) => item && item.kind !== 'text')) &&
        entry.path.toLowerCase().includes(search.toLowerCase())
      )
    }) ?? []
  const total = Math.ceil(visible.length / 100)
  const currentPage = Math.min(page, Math.max(0, total - 1))
  const active = Object.values(lastFilters ?? filters).filter((value) => value.trim()).length

  return (
    <section className="folder-workspace" hidden={hidden} aria-label="Folder comparison">
      <div className="folder-toolbar">
        {(['left', 'right'] as const).map((side) => (
          <div className="folder-picker" key={side}>
            <input
              hidden
              type="file"
              {...{ webkitdirectory: '' }}
              multiple
              ref={side === 'left' ? leftInput : rightInput}
              aria-label={side === 'left' ? 'Original directory' : 'Modified directory'}
              onChange={(event) => input(side, event)}
            />
            <Button icon="folder" onClick={() => (side === 'left' ? leftInput : rightInput).current?.click()}>
              {side === 'left' ? 'Original folder' : 'Modified folder'}
            </Button>
            <span title={folders[side]?.name}>{folders[side]?.name || 'Select a folder'}</span>
            {advancedPicker.showDirectoryPicker && (
              <Button
                icon="more"
                label={`Choose ${side} using directory access`}
                title="Include empty directories"
                onClick={() => void pick(side)}
              />
            )}
          </div>
        ))}
        <Button
          icon="swap"
          label="Swap folders"
          disabled={!folders.left || !folders.right}
          onClick={() => {
            resetResults()
            setFolders({ left: folders.right, right: folders.left })
          }}
        />
        <Button
          className="accent-button"
          icon="diff"
          disabled={!folders.left || !folders.right || !!progress}
          onClick={scan}
        >
          Compare folders
        </Button>
        <Button icon="settings" onClick={() => setFilterDialog(true)}>
          Filters{active ? ` (${active})` : ''}
        </Button>
        {progress && <Button onClick={stop}>Cancel scan</Button>}
      </div>
      {progress && (
        <div className="progress-row">
          <progress value={progress.done} max={progress.total || 1} />
          <span>
            {progress.done} / {progress.total} paths checked
          </span>
        </div>
      )}
      {!result && !progress && (
        <div className="folder-empty">
          <div className="empty-icon">
            <Icon name="folder" size={24} />
          </div>
          <h2>Compare two folders</h2>
          <p>Select an original and a modified folder to compare their files.</p>
        </div>
      )}
      {result && (
        <>
          <div className="folder-tools">
            <input
              aria-label="Search paths"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(0)
              }}
              placeholder="Search paths"
            />
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as PathStatus | '')
                setPage(0)
              }}
            >
              <option value="">Any status</option>
              {Object.entries(statusLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <Toggle checked={hideIdentical} change={setHideIdentical}>
              Hide identical
            </Toggle>
            <Toggle checked={hideBinary} change={setHideBinary}>
              Hide binary
            </Toggle>
            <div className="grow" />
            <Button onClick={() => void exportFolders('copy')}>Copy summary</Button>
            <Button onClick={() => void exportFolders('report')}>HTML report</Button>
            <Button onClick={() => void exportFolders('patch')}>Patch</Button>
            <Button onClick={() => void exportFolders('zip')}>Changed files ZIP</Button>
          </div>
          <div className="folder-table">
            <table>
              <thead>
                <tr>
                  <th>Relative path</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Original</th>
                  <th>Modified</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(currentPage * 100, (currentPage + 1) * 100).map((entry) => (
                  <tr key={entry.path}>
                    <td>
                      <button
                        type="button"
                        className="file-link"
                        onClick={() => {
                          if (textEntries.includes(entry)) void openText(entry.path)
                          else setDetail(entry)
                        }}
                      >
                        <Icon name={entry.directory ? 'folder' : 'file'} />
                        {entry.path}
                        {staged.current.has(entry.path) && <small>Staged</small>}
                      </button>
                    </td>
                    <td>
                      <span className={`file-status ${entry.status}`}>{statusLabels[entry.status]}</span>
                    </td>
                    <td>{entry.directory ? 'Directory' : (entry.left?.kind ?? entry.right?.kind ?? '—')}</td>
                    <td>{entry.left ? bytes(entry.left.size) : '—'}</td>
                    <td>{entry.right ? bytes(entry.right.size) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && <p className="table-empty">No paths match the current filters.</p>}
          </div>
          <div className="folder-foot">
            <span>
              {result.entries.length} entries · {totals.modified} modified · {totals.identical} identical ·{' '}
              {totals.right} added · {totals.left} removed · {result.skipped} excluded · {totals.error} failed
              · {bytes(result.bytes)} read{stagedCount ? ` · ${stagedCount} staged` : ''}
            </span>
            <div className="grow" />
            <Button
              icon="left"
              label="Previous page"
              disabled={!currentPage}
              onClick={() => setPage(currentPage - 1)}
            />
            <span>
              {total ? currentPage + 1 : 0} / {total}
            </span>
            <Button
              icon="right"
              label="Next page"
              disabled={currentPage + 1 >= total}
              onClick={() => setPage(currentPage + 1)}
            />
          </div>
        </>
      )}
      {filterDialog && (
        <Dialog title="Folder scan filters" close={() => setFilterDialog(false)}>
          <p>Enter one pattern per line. Patterns use .gitignore syntax and take effect on the next scan.</p>
          <label className="field column">
            Include patterns
            <textarea
              rows={3}
              value={filters.includes}
              maxLength={4000}
              onChange={(event) => setFilters({ ...filters, includes: event.target.value })}
            />
          </label>
          <label className="field column">
            Exclude patterns
            <textarea
              rows={5}
              value={filters.excludes}
              maxLength={4000}
              onChange={(event) => setFilters({ ...filters, excludes: event.target.value })}
            />
          </label>
          <label className="field column">
            Extensions
            <input
              value={filters.extensions}
              maxLength={4000}
              placeholder="txt, yaml, conf"
              onChange={(event) => setFilters({ ...filters, extensions: event.target.value })}
            />
          </label>
          <Button
            onClick={() =>
              setFilters({
                ...filters,
                excludes: [filters.excludes, ignorePreset].filter(Boolean).join('\n').slice(0, 4000),
              })
            }
          >
            Exclude common build and cache folders
          </Button>
        </Dialog>
      )}
      {detail && (
        <Dialog title={detail.path} close={() => setDetail(undefined)} wide>
          <p>{statusLabels[detail.status]}</p>
          <dl className="details-list">
            {(['left', 'right'] as const).map((side) => {
              const item = detail[side]
              return (
                <div key={side}>
                  <dt>{side === 'left' ? 'Original' : 'Modified'}</dt>
                  <dd>
                    {item ? (
                      <>
                        {bytes(item.size)} · SHA-256 <code>{item.hash}</code>
                      </>
                    ) : detail.directory ? (
                      'Directory or absent'
                    ) : (
                      'Unavailable'
                    )}
                  </dd>
                </div>
              )
            })}
          </dl>
          {(detail.left?.kind === 'image' || detail.right?.kind === 'image') && (
            <ImageCompare
              key={detail.path}
              left={folders.left?.entries.get(detail.path)}
              right={folders.right?.entries.get(detail.path)}
            />
          )}
        </Dialog>
      )}
    </section>
  )
}

function ImageCompare({ left, right }: { left?: File | null; right?: File | null }) {
  const [frames, setFrames] = useState<ImageBitmap[]>([])
  const [mode, setMode] = useState('split')
  const [opacity, setOpacity] = useState(0.5)
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let stopped = false
    const bitmaps: ImageBitmap[] = []
    async function load() {
      try {
        for (const file of [left, right]) {
          if (!file) continue
          const type = imageType(file.name)
          if (!type || file.size > 20 * 1024 ** 2)
            throw new Error('Image previews support local raster files up to 20 MiB.')
          const bitmap = await createImageBitmap(file.slice(0, file.size, type))
          if (
            stopped ||
            bitmap.width > 16_000 ||
            bitmap.height > 16_000 ||
            bitmap.width * bitmap.height > 12_000_000
          ) {
            bitmap.close()
            if (stopped) return
            throw new Error('Image preview exceeds 12 megapixels.')
          }
          bitmaps.push(bitmap)
        }
        setFrames([...bitmaps])
      } catch (error) {
        if (!stopped) setError(error instanceof Error ? error.message : 'Could not decode this image.')
      }
    }
    void load()
    return () => {
      stopped = true
      for (const bitmap of bitmaps) bitmap.close()
    }
  }, [left, right])
  useEffect(() => {
    const view = canvas.current
    if (!view || !frames.length) return
    const [a, b] = frames
    const split = mode === 'split' || !b
    view.width = split ? a.width + (b?.width ?? 0) : Math.max(a.width, b.width)
    view.height = Math.max(a.height, b?.height ?? 0)
    if (view.width * view.height > 24_000_000) {
      setError('The combined image dimensions exceed the preview limit.')
      return
    }
    const ctx = view.getContext('2d', { willReadFrequently: mode === 'pixel' })
    if (!ctx) return
    ctx.drawImage(a, 0, 0)
    if (!b) return
    if (split) ctx.drawImage(b, a.width, 0)
    else if (mode === 'overlay') {
      ctx.globalAlpha = opacity
      ctx.drawImage(b, 0, 0)
    } else {
      const initial = ctx.getImageData(0, 0, view.width, view.height)
      ctx.clearRect(0, 0, view.width, view.height)
      ctx.drawImage(b, 0, 0)
      const current = ctx.getImageData(0, 0, view.width, view.height)
      for (let i = 0; i < current.data.length; i += 4) {
        const diff = Math.max(
          Math.abs(initial.data[i] - current.data[i]),
          Math.abs(initial.data[i + 1] - current.data[i + 1]),
          Math.abs(initial.data[i + 2] - current.data[i + 2]),
          Math.abs(initial.data[i + 3] - current.data[i + 3]),
        )
        current.data[i] = diff ? 255 : 24
        current.data[i + 1] = diff ? Math.max(30, 220 - diff) : 30
        current.data[i + 2] = diff ? 56 : 40
        current.data[i + 3] = 255
      }
      ctx.putImageData(current, 0, 0)
    }
  }, [frames, mode, opacity])
  if (error) return <p className="error">{error}</p>
  return (
    <div className="image-compare">
      <div className="form-row">
        <select
          aria-label="Image comparison mode"
          value={mode}
          onChange={(event) => setMode(event.target.value)}
          disabled={frames.length < 2}
        >
          <option value="split">Side by side</option>
          <option value="overlay">Overlay</option>
          <option value="pixel">Pixel difference</option>
        </select>
        <label className="field">
          Zoom
          <input
            type="range"
            min=".1"
            max="2"
            step=".05"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        {mode === 'overlay' && (
          <label className="field">
            Opacity
            <input
              type="range"
              min="0"
              max="1"
              step=".05"
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
            />
          </label>
        )}
        <span>{frames.map((frame) => `${frame.width} × ${frame.height}`).join(' / ')}</span>
      </div>
      <div className="image-scroll">
        <canvas ref={canvas} aria-label="Local image comparison" style={{ zoom }} />
      </div>
    </div>
  )
}
