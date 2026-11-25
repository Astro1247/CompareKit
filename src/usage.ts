declare const __COMPAREKIT_USAGE__: { endpoint: string; websiteId: string } | null

const names = [
  'page_view',
  'sample_opened',
  'mode_text',
  'mode_folders',
  'mode_three_way',
  'layout_split',
  'layout_unified',
  'toggle_fold',
  'toggle_only_changes',
  'manual_compare',
  'text_compared',
  'text_merge_arrow_original',
  'text_merge_arrow_modified',
  'text_merge_original',
  'text_merge_modified',
  'three_way_compared',
  'three_way_arrow_a',
  'three_way_arrow_b',
  'three_way_accept_a',
  'three_way_accept_b',
  'three_way_accept_base',
  'three_way_accept_both',
  'three_way_manual_resolution',
  'three_way_sync_changed',
  'three_way_download',
  'folders_compared',
  'folder_file_opened',
  'folder_edit_staged',
  'folder_filters_applied',
  'folder_export_summary',
  'folder_export_report',
  'folder_export_patch',
  'folder_export_zip',
  'settings_opened',
  'settings_tab_compare',
  'settings_tab_editor',
  'settings_tab_privacy',
  'option_whitespace',
  'option_leading',
  'option_trailing',
  'option_blank',
  'option_case',
  'option_eol',
  'option_unicode',
  'option_json',
  'option_json_keys',
  'option_regex',
  'option_context',
  'option_show_ignored',
  'option_manual',
  'editor_theme',
  'editor_font',
  'editor_wrap',
  'editor_whitespace',
  'editor_numbers',
  'editor_minimap',
  'editor_horizontal_scroll',
  'editor_highlight_style',
  'editor_language',
  'undo',
  'redo',
  'swap_sides',
  'workspace_cleared',
  'text_files_opened',
  'bookmark_toggled',
  'search_opened',
  'preview_opened',
  'shortcuts_opened',
  'export_opened',
  'export_preview',
  'export_copy',
  'export_patch',
  'export_html',
  'export_session',
  'patch_applied',
  'sessions_opened',
  'session_created',
  'session_switched',
] as const

export type UsageEvent = (typeof names)[number]
const events = new Set<UsageEvent>(names)
type Choice = 'on' | 'off'
const config = __COMPAREKIT_USAGE__
const privacyControl = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
export const usageStorageKey =
  config && !privacyControl ? `comparekit.usage.v1:${config.endpoint}:${config.websiteId}` : null
let temporaryChoice: Choice | null = null
const sentOnce = new Set<UsageEvent>()

export function getUsageChoice(): Choice | null {
  if (!usageStorageKey) return 'off'
  if (temporaryChoice) return temporaryChoice
  try {
    const value = localStorage.getItem(usageStorageKey)
    return value === 'on' || value === 'off' ? value : null
  } catch {
    return 'off'
  }
}

export function setUsageChoice(choice: Choice) {
  if (!usageStorageKey) return
  try {
    localStorage.setItem(usageStorageKey, choice)
    temporaryChoice = null
  } catch {
    temporaryChoice = choice
  }
  window.dispatchEvent(new Event('comparekit-usage-choice'))
}

export function subscribeUsageChoice(update: () => void) {
  if (!usageStorageKey) return () => {}
  window.addEventListener('storage', update)
  window.addEventListener('comparekit-usage-choice', update)
  return () => {
    window.removeEventListener('storage', update)
    window.removeEventListener('comparekit-usage-choice', update)
  }
}

// The collector receives only a deployment hostname, a constant path, and an allowlisted action.
export function trackUsage(event: UsageEvent, once = false) {
  if (!config || !events.has(event) || (once && sentOnce.has(event)) || getUsageChoice() === 'off') return
  if (once) sentOnce.add(event)
  void fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'event',
      payload: {
        website: config.websiteId,
        hostname: location.hostname,
        url: '/',
        ...(event === 'page_view' ? {} : { name: event }),
      },
    }),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
    keepalive: true,
  }).catch(() => {})
}
