import { useEffect, useSyncExternalStore } from 'react'
import { getUsageChoice, setUsageChoice, subscribeUsageChoice, trackUsage, usageStorageKey } from '../usage'
import { Button, Icon, Toggle } from './controls'

export function UsageNotice() {
  const choice = useSyncExternalStore(subscribeUsageChoice, getUsageChoice)
  useEffect(() => {
    if (choice !== 'off') trackUsage('page_view', true)
  }, [choice])

  if (choice !== null) return null
  return (
    <aside className="usage-notice" aria-label="Usage metrics">
      <header className="usage-notice-heading">
        <span className="usage-notice-lock">
          <Icon name="lock" size={17} />
        </span>
        <h2>Your comparisons stay private</h2>
      </header>
      <p>All comparison data stays in this browser, including your text, files, and results.</p>
      <p>Usage metrics are on. Umami counts visits and feature use to help us improve CompareKit.</p>
      <div className="usage-notice-actions">
        <Button className="accent-button" onClick={() => setUsageChoice('on')}>
          Got it
        </Button>
        <Button className="outlined" onClick={() => setUsageChoice('off')}>
          Turn off metrics
        </Button>
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
