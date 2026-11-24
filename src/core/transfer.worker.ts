import { makePatch, previewPatch, textReport } from './export'
import type { ComparisonOptions, Document } from './text'

export type TransferRequest =
  | { kind: 'patch'; left: string; right: string; path: string; context: number }
  | { kind: 'report'; left: Document; right: Document; options: ComparisonOptions; unified: boolean }
  | { kind: 'apply'; text: string; patch: string }

self.onmessage = ({ data }: MessageEvent<TransferRequest>) => {
  try {
    let output: string
    if (data.kind === 'patch') output = makePatch(data.left, data.right, data.path, data.context)
    else if (data.kind === 'apply') output = previewPatch(data.text, data.patch)
    else output = textReport(data.left, data.right, data.options, data.unified)
    self.postMessage({ output })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Export failed.' })
  }
}
