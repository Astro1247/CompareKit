import { useEffect, useRef, useState } from 'react'
import CompareWorker from '../core/compare.worker?worker'
import { type Session, blankSession, parseSession } from '../core/session'
import type { Comparison, ComparisonOptions } from '../core/text'
import { visualDefaults, type Visual } from '../editor/workspace'
import { trackUsage } from '../usage'

export const prefsKey = 'comparekit.preferences.v1'
export const savesKey = 'comparekit.sessions.v1'
export const savesEnabledKey = 'comparekit.session-saves.v1'
export const getLocal = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
export function loadVisual(): Visual {
  try {
    const data = JSON.parse(getLocal(prefsKey) ?? '{}')
    const visual = { ...visualDefaults }
    for (const key of [
      'wrap',
      'whitespace',
      'minimap',
      'numbers',
      'horizontal',
      'threeWayScroll',
      'remember',
    ] as const) {
      if (typeof data[key] === 'boolean') visual[key] = data[key]
    }
    for (const key of ['added', 'removed', 'modified', 'conflict'] as const) {
      if (typeof data[key] === 'string' && /^#[0-9a-f]{6}$/i.test(data[key])) visual[key] = data[key]
    }
    if (['system', 'light', 'dark'].includes(data.theme)) visual.theme = data.theme
    if (typeof data.language === 'string' && /^[\w-]{1,30}$/.test(data.language))
      visual.language = data.language
    if (Number.isFinite(data.font)) visual.font = Math.max(10, Math.min(32, data.font))
    if (Number.isFinite(data.intensity)) visual.intensity = Math.max(30, Math.min(200, data.intensity))
    return visual
  } catch {
    return { ...visualDefaults }
  }
}
export function loadStored(): Session[] {
  if (getLocal(savesEnabledKey) !== 'yes') return []
  try {
    const values: unknown = JSON.parse(getLocal(savesKey) ?? '[]')
    return Array.isArray(values)
      ? values.slice(0, 20).map((value) => parseSession(JSON.stringify(value)))
      : []
  } catch {
    return []
  }
}
export function useSystemDark() {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const [dark, setDark] = useState(media.matches)
  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)')
    const change = (event: MediaQueryListEvent) => setDark(event.matches)
    preference.addEventListener('change', change)
    return () => preference.removeEventListener('change', change)
  }, [])
  return dark
}

const none: Comparison = { blocks: [], removed: 0, added: 0, leftLines: 0, rightLines: 0 }
type Result = {
  diff: Comparison
  raw: Comparison
  left: string
  right: string
  options: ComparisonOptions
  error?: string
}
export function useComparison(session: Session, manual: boolean, revision: number, active: boolean) {
  const {
    left: { text: left },
    right: { text: right },
    options,
  } = session
  const [result, setResult] = useState<Result>({
    left: '',
    right: '',
    options: blankSession().options,
    diff: none,
    raw: none,
  })
  const requested = useRef(-1)
  useEffect(() => {
    if (!active || (manual && revision === requested.current)) return
    let worker: Worker | undefined
    let timeout: ReturnType<typeof setTimeout>
    const timer = setTimeout(
      () => {
        requested.current = revision
        if (!left && !right) {
          setResult({ diff: none, raw: none, left, right, options })
          return
        }
        const task = new CompareWorker()
        worker = task
        const fail = (error: string) => {
          task.terminate()
          clearTimeout(timeout)
          setResult({ diff: none, raw: none, left, right, options, error })
        }
        task.onmessage = ({
          data,
        }: MessageEvent<{ diff?: Comparison; raw?: Comparison; error?: string }>) => {
          task.terminate()
          clearTimeout(timeout)
          setResult({
            diff: data.diff ?? none,
            raw: data.raw ?? none,
            left,
            right,
            options,
            error: data.error,
          })
          if (data.diff && !data.error) trackUsage('text_compared', true)
        }
        task.onerror = () => fail('The comparison worker could not start.')
        timeout = setTimeout(
          () => fail('Comparison timed out. Shorten the inputs or remove a costly regular expression.'),
          4000,
        )
        task.postMessage({ left, right, options, workspace: true })
      },
      manual ? 0 : 140,
    )
    return () => {
      clearTimeout(timer)
      clearTimeout(timeout)
      worker?.terminate()
    }
  }, [left, right, options, manual, revision, active])
  return { ...result, stale: result.left !== left || result.right !== right || result.options !== options }
}
