import { useEffect, useSyncExternalStore } from 'react'
import { getUsageChoice, setUsageChoice, subscribeUsageChoice, trackUsage, usageStorageKey } from '../usage'
import { Button, Toggle } from './controls'

export function UsageNotice() {
  const choice = useSyncExternalStore(subscribeUsageChoice, getUsageChoice)
  useEffect(() => {
    if (choice !== 'off') trackUsage('page_view', true)
  }, [choice])

  if (choice !== null) return null
  return (
    <aside className="usage-notice" aria-label="Usage metrics">
      <strong>Usage metrics</strong>
      <p>
        Umami counts visits and feature use. Your text, files, and comparison results stay in this browser.
      </p>
      <div className="form-row">
        <Button onClick={() => setUsageChoice('on')}>Keep on</Button>
        <Button onClick={() => setUsageChoice('off')}>Turn off</Button>
      </div>
    </aside>
  )
}

export function UsageSettings() {
  const choice = useSyncExternalStore(subscribeUsageChoice, getUsageChoice)
  if (!usageStorageKey) return null
  return (
    <Toggle checked={choice !== 'off'} change={(enabled) => setUsageChoice(enabled ? 'on' : 'off')}>
      Send usage metrics to Umami
    </Toggle>
  )
}
