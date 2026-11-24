import type { Session } from './session'

const budget = 32 * 1024 * 1024
const maxEntries = 80
const size = (item: Session) =>
  2 *
  (item.left.text.length +
    item.right.text.length +
    item.base.text.length +
    (item.merge?.result?.length ?? 0) +
    Object.values(item.merge?.choices ?? {}).reduce((sum, entry) => sum + (entry.manual?.length ?? 0), 0))

export class WorkspaceHistory {
  private past: Session[] = []
  private future: Session[] = []
  private lastGroup = ''
  private lastEdit = 0

  get canUndo() {
    return this.past.length > 0
  }
  get canRedo() {
    return this.future.length > 0
  }

  record(snapshot: Session, group = '', now = Date.now()) {
    if (!group || this.lastGroup !== group || now - this.lastEdit > 600 || this.future.length)
      this.push(snapshot)
    this.future = []
    this.lastGroup = group
    this.lastEdit = now
  }
  private push(snapshot: Session) {
    this.past.push(snapshot)
    let total = this.past.reduce((bytes, item) => bytes + size(item), 0)
    while (this.past.length > 1 && (this.past.length > maxEntries || total > budget)) {
      const dropped = this.past.shift()
      if (dropped) total -= size(dropped)
    }
  }
  undo(current: Session): Session | undefined {
    const previous = this.past.pop()
    if (previous) this.future.push(current)
    this.lastGroup = ''
    return previous
  }
  redo(current: Session): Session | undefined {
    const next = this.future.pop()
    if (next) this.push(current)
    this.lastGroup = ''
    return next
  }
}
