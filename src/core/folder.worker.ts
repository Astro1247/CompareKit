import {
  folderPatch,
  folderZip,
  scanFolders,
  type Filters,
  type FolderResult,
  type PickedFolder,
} from './folders'

export type FolderRequest =
  | { kind: 'scan'; a: PickedFolder; b: PickedFolder; filters: Filters }
  | {
      kind: 'patch' | 'zip'
      result: FolderResult
      a: PickedFolder
      b: PickedFolder
      edits: Map<string, string>
      context: number
    }

self.onmessage = async ({ data }: MessageEvent<FolderRequest>) => {
  try {
    if (data.kind === 'patch') {
      self.postMessage({ output: await folderPatch(data.result, data.a, data.b, data.edits, data.context) })
      return
    }
    if (data.kind === 'zip') {
      self.postMessage({ output: await folderZip(data.result, data.b, data.edits) })
      return
    }
    if (data.kind !== 'scan') return
    const result = await scanFolders(data.a, data.b, data.filters, (done, total) => {
      self.postMessage({ progress: { done, total } })
    })
    self.postMessage({ result })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Folder scan failed.' })
  }
}
