import { useState } from 'react'
import type { ComparisonOptions } from '../core/text'
import type { Visual } from '../editor/workspace'
import { type UsageEvent, trackUsage } from '../usage'
import { Button, Dialog, Toggle } from './controls'
import { UsageSettings } from './usage'

export const languages = [
  ['auto', 'Auto detect'],
  ['plaintext', 'Plain text'],
  ['json', 'JSON'],
  ['yaml', 'YAML'],
  ['xml', 'XML'],
  ['html', 'HTML'],
  ['markdown', 'Markdown'],
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['python', 'Python'],
  ['php', 'PHP'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['java', 'Java'],
  ['kotlin', 'Kotlin'],
  ['sql', 'SQL'],
  ['shell', 'Shell'],
  ['powershell', 'PowerShell'],
  ['dockerfile', 'Dockerfile'],
  ['ini', 'INI'],
  ['toml', 'TOML'],
  ['nginx', 'Nginx config'],
  ['css', 'CSS'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['csharp', 'C#'],
]
const ignores = [
  ['whitespace', 'All whitespace'],
  ['leading', 'Leading whitespace'],
  ['trailing', 'Trailing whitespace'],
  ['blank', 'Blank lines'],
  ['case', 'Case'],
  ['eol', 'Line endings'],
  ['unicode', 'Unicode composition'],
  ['json', 'Equivalent JSON formatting'],
  ['jsonKeys', 'Equivalent JSON key order'],
] as const
const sections = [
  ['Compare', 'settings_tab_compare'],
  ['Editor', 'settings_tab_editor'],
  ['Privacy', 'settings_tab_privacy'],
] as const
const optionEvents = {
  whitespace: 'option_whitespace',
  leading: 'option_leading',
  trailing: 'option_trailing',
  blank: 'option_blank',
  case: 'option_case',
  eol: 'option_eol',
  unicode: 'option_unicode',
  json: 'option_json',
  jsonKeys: 'option_json_keys',
  regex: 'option_regex',
  context: 'option_context',
} as const
const visualEvents: Partial<Record<keyof Visual, UsageEvent>> = {
  theme: 'editor_theme',
  font: 'editor_font',
  wrap: 'editor_wrap',
  whitespace: 'editor_whitespace',
  numbers: 'editor_numbers',
  minimap: 'editor_minimap',
  horizontal: 'editor_horizontal_scroll',
  intensity: 'editor_highlight_style',
  added: 'editor_highlight_style',
  removed: 'editor_highlight_style',
  modified: 'editor_highlight_style',
  conflict: 'editor_highlight_style',
}
export function Settings({
  close,
  visual,
  setVisual,
  options,
  setOptions,
  manual,
  setManual,
  showIgnored,
  setShowIgnored,
  storage,
  setStorage,
  clearSaved,
}: {
  close: () => void
  visual: Visual
  setVisual: (value: Visual) => void
  options: ComparisonOptions
  setOptions: (value: ComparisonOptions) => void
  manual: boolean
  setManual: (value: boolean) => void
  showIgnored: boolean
  setShowIgnored: (value: boolean) => void
  storage: boolean
  setStorage: (value: boolean) => void
  clearSaved: () => void
}) {
  const [section, setSection] = useState<(typeof sections)[number][0]>('Compare')
  const [regex, setRegex] = useState('')
  const [error, setError] = useState('')
  function visualField<K extends keyof Visual>(key: K, value: Visual[K]) {
    setVisual({ ...visual, [key]: value })
    const event = visualEvents[key]
    if (event && value !== visual[key])
      trackUsage(event, key === 'font' || event === 'editor_highlight_style')
  }
  function option<K extends keyof ComparisonOptions>(key: K, value: ComparisonOptions[K]) {
    setOptions({ ...options, [key]: value })
    if (value !== options[key]) trackUsage(optionEvents[key], key === 'context')
  }
  function add() {
    if (!regex || options.regex.includes(regex)) return
    try {
      if (options.regex.length >= 20) throw new Error('Use up to 20 rules.')
      new RegExp(regex, 'u')
      option('regex', [...options.regex, regex])
      setRegex('')
      setError('')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Invalid regular expression.')
    }
  }
  return (
    <Dialog title="Settings" close={close}>
      <nav className="segments settings-tabs" aria-label="Settings sections">
        {sections.map(([tab, event]) => (
          <Button
            key={tab}
            aria-pressed={section === tab}
            onClick={() => {
              if (section !== tab) trackUsage(event)
              setSection(tab)
            }}
          >
            {tab}
          </Button>
        ))}
      </nav>
      {section === 'Compare' && (
        <>
          <fieldset>
            <legend>Ignore differences</legend>
            <div className="option-grid">
              {ignores.map(([key, label]) => (
                <Toggle key={key} checked={options[key]} change={(value) => option(key, value)}>
                  {label}
                </Toggle>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Ignore lines matching a regular expression</legend>
            <form
              className="form-row"
              onSubmit={(event) => {
                event.preventDefault()
                add()
              }}
            >
              <input
                aria-label="Regular expression"
                maxLength={256}
                value={regex}
                onChange={(event) => setRegex(event.target.value)}
                placeholder="Example ^Last modified "
              />
              <Button onClick={add}>Add rule</Button>
            </form>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {options.regex.length > 0 && (
              <ul className="rules">
                {options.regex.map((rule) => (
                  <li key={rule}>
                    <code>{rule}</code>
                    <Button
                      icon="close"
                      label={`Remove rule ${rule}`}
                      onClick={() =>
                        option(
                          'regex',
                          options.regex.filter((item) => item !== rule),
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
            <Button
              onClick={() => {
                option('regex', [
                  '^! Last configuration change',
                  '^! NVRAM config last updated',
                  '^# Generated at',
                ])
                setError('')
              }}
            >
              Use network config preset
            </Button>
          </fieldset>
          <div className="option-grid">
            <Toggle
              checked={showIgnored}
              change={(value) => {
                setShowIgnored(value)
                trackUsage('option_show_ignored')
              }}
            >
              Mark ignored differences
            </Toggle>
            <Toggle
              checked={manual}
              change={(value) => {
                setManual(value)
                trackUsage('option_manual')
              }}
            >
              Manual comparison
            </Toggle>
            <label className="field">
              Unchanged context
              <input
                aria-label="Unchanged context"
                type="number"
                min={0}
                max={100}
                value={options.context}
                onChange={(event) =>
                  option('context', Math.max(0, Math.min(100, Number(event.target.value))))
                }
              />
            </label>
          </div>
        </>
      )}
      {section === 'Editor' && (
        <>
          <div className="option-grid">
            <label className="field">
              Theme
              <select
                aria-label="Theme"
                value={visual.theme}
                onChange={(event) => visualField('theme', event.target.value as Visual['theme'])}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className="field">
              Font size
              <input
                aria-label="Font size"
                type="number"
                min={10}
                max={32}
                value={visual.font}
                onChange={(event) =>
                  visualField('font', Math.max(10, Math.min(32, Number(event.target.value))))
                }
              />
            </label>
            <Toggle checked={visual.wrap} change={(value) => visualField('wrap', value)}>
              Word wrap
            </Toggle>
            <Toggle checked={visual.whitespace} change={(value) => visualField('whitespace', value)}>
              Whitespace marks
            </Toggle>
            <Toggle checked={visual.numbers} change={(value) => visualField('numbers', value)}>
              Line numbers
            </Toggle>
            <Toggle checked={visual.minimap} change={(value) => visualField('minimap', value)}>
              Minimap
            </Toggle>
            <Toggle checked={visual.horizontal} change={(value) => visualField('horizontal', value)}>
              Sync horizontal scroll
            </Toggle>
          </div>
          <fieldset>
            <legend>Highlighting</legend>
            <div className="option-grid">
              <label className="field">
                Intensity{' '}
                <input
                  type="range"
                  min={30}
                  max={200}
                  value={visual.intensity}
                  onChange={(event) => visualField('intensity', Number(event.target.value))}
                />
              </label>
              {(['added', 'removed', 'modified', 'conflict'] as const).map((key) => (
                <label key={key} className="field color-field">
                  {key}
                  <input
                    type="color"
                    value={visual[key] || (key === 'added' ? '#2ea043' : '#f85149')}
                    onChange={(event) => visualField(key, event.target.value)}
                  />
                </label>
              ))}
              <Button
                onClick={() => {
                  setVisual({
                    ...visual,
                    intensity: 100,
                    added: '',
                    removed: '',
                    modified: '#7988f6',
                    conflict: '#b86a14',
                  })
                  trackUsage('editor_highlight_style', true)
                }}
              >
                Reset colors
              </Button>
            </div>
          </fieldset>
        </>
      )}
      {section === 'Privacy' && (
        <>
          <p>Comparisons run in this browser. Saved sessions include the full contents of all panes.</p>
          <UsageSettings />
          <Toggle checked={visual.remember} change={(value) => visualField('remember', value)}>
            Remember editor preferences
          </Toggle>
          <Toggle checked={storage} change={setStorage}>
            Enable explicit session saves on this browser
          </Toggle>
          <Button onClick={clearSaved} icon="trash">
            Clear all saved comparisons
          </Button>
        </>
      )}
    </Dialog>
  )
}
export const shortcuts = [
  ['Ctrl/⌘ + Enter', 'Compare now'],
  ['Ctrl/⌘ + O', 'Open local files'],
  ['Ctrl/⌘ + S', 'Open exports'],
  ['Ctrl/⌘ + Z', 'Undo'],
  ['Ctrl/⌘ + Shift + Z or Ctrl + Y', 'Redo'],
  ['Ctrl/⌘ + Shift + X', 'Swap sides'],
  ['Ctrl/⌘ + Shift + F', 'Search both versions'],
  ['F7 / Shift + F7', 'Next / previous change'],
  ['Alt + ← / →', 'Apply to original / modified'],
  ['Ctrl/⌘ + B', 'Toggle bookmark'],
  ['Alt + Shift + ← / →', 'Previous / next bookmark'],
  ['Ctrl/⌘ + Shift + U', 'Switch split / unified'],
  ['Ctrl/⌘ + Shift + H', 'Toggle unchanged sections'],
  ['Alt + Shift + F', 'Fullscreen'],
  ['Ctrl/⌘ + Shift + C', 'Copy diff'],
  ['Ctrl/⌘ + Shift + P', 'Download patch'],
  ['Ctrl/⌘ + ,', 'Settings'],
  ['Ctrl/⌘ + /', 'Keyboard shortcuts'],
  ['Esc', 'Exit focus mode / close dialog'],
]
export function ShortcutHelp({ close }: { close: () => void }) {
  const [search, setSearch] = useState('')
  return (
    <Dialog title="Keyboard shortcuts" close={close}>
      <input
        className="full-input"
        aria-label="Search shortcuts"
        placeholder="Search shortcuts"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <dl className="shortcuts">
        {shortcuts
          .filter((item) => item.join(' ').toLowerCase().includes(search.toLowerCase()))
          .map(([keys, label]) => (
            <div key={keys}>
              <dt>{label}</dt>
              <dd>
                <kbd>{keys}</kbd>
              </dd>
            </div>
          ))}
      </dl>
    </Dialog>
  )
}
