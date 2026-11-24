import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react'

const paths = {
  logo: 'M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4',
  text: 'M4 5h16M4 10h16M4 15h11M4 20h8',
  folder: 'M3 6h7l2 2h9v11H3z',
  three: 'M5 4v16m14-16v16m-7-16v16M5 7h14M5 17h14',
  open: 'M3 19V5h7l2 2h8v3M3 19l4-9h15l-4 9z',
  swap: 'M3 8h17m-4-4 4 4-4 4M21 16H4m4-4-4 4 4 4',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  left: 'm15 6-6 6 6 6',
  right: 'm9 6 6 6-6 6',
  split: 'M3 5h18v14H3zM12 5v14',
  inline: 'M3 5h18v14H3zM3 12h18',
  fold: 'M4 4h16M4 20h16M8 12h8m-4-4v8',
  export: 'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
  fullscreen: 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5',
  undo: 'M9 5 4 10l5 5m-5-5h10a5 5 0 0 1 0 10',
  redo: 'm15 5 5 5-5 5m5-5H10a5 5 0 0 0 0 10',
  search: 'M16 16l5 5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  more: 'M4 12h1m6 0h1m6 0h1',
  file: 'M5 3h9l5 5v13H5zM14 3v6h5M8 13h8m-8 4h6',
  lock: 'M6 11h12v10H6zM9 11V8a3 3 0 0 1 6 0v3m-3 6v1',
  link: 'M10 13a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-2 2m3 5a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l2-2',
  close: 'm6 6 12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  bookmark: 'M7 4h10v16l-5-4-5 4z',
  bolt: 'm13 2-8 12h6l-1 8 9-12h-7z',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-2-15-4 18',
  diff: 'M4 7h8M8 3v8m4 6h8',
  trash: 'M4 7h16m-14 0 1 14h10l1-14M9 7V4h6v3',
  focus: 'M4 4h16v16H4zM7 7h10v10H7z',
} as const
export type IconName = keyof typeof paths
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  )
}
export function Button({
  icon,
  children,
  label,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={props.title ?? label}
      className={`button ${className}`}
      {...props}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}
export function Dialog({
  title,
  close,
  children,
  wide = false,
}: {
  title: string
  close: () => void
  children: ReactNode
  wide?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className={wide ? 'wide-dialog' : ''}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <header className="dialog-head">
        <h2>{title}</h2>
        <Button icon="close" label="Close dialog" onClick={close} />
      </header>
      <div className="dialog-body">{children}</div>
    </dialog>
  )
}
export function Toggle({
  checked,
  children,
  change,
}: {
  checked: boolean
  children: ReactNode
  change: (value: boolean) => void
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => change(event.target.checked)} />
      {children}
    </label>
  )
}
export function Popover({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const holder = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function leave(event: Event) {
      if (!(event.target instanceof Node) || !holder.current?.contains(event.target)) setOpen(false)
    }
    function dismiss(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      holder.current?.querySelector('button')?.focus()
    }
    function select(event: MouseEvent) {
      if (
        event.target instanceof Element &&
        holder.current?.contains(event.target) &&
        event.target.closest('.popover-panel button')
      )
        setOpen(false)
    }
    document.addEventListener('pointerdown', leave)
    document.addEventListener('focusin', leave)
    document.addEventListener('keydown', dismiss)
    document.addEventListener('click', select)
    return () => {
      document.removeEventListener('pointerdown', leave)
      document.removeEventListener('focusin', leave)
      document.removeEventListener('keydown', dismiss)
      document.removeEventListener('click', select)
    }
  }, [open])
  return (
    <div className="popover" ref={holder}>
      <Button icon={icon} label={title} aria-expanded={open} onClick={() => setOpen(!open)} />
      {open && <div className="popover-panel">{children}</div>}
    </div>
  )
}
export function bytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MiB`
  return `${(value / 1024 ** 3).toFixed(1)} GiB`
}
