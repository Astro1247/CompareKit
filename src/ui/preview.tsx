import { createElement, type ReactNode } from 'react'
import { marked } from 'marked'
import { type DefaultTreeAdapterTypes, parseFragment } from 'parse5'
import type { Document } from '../core/text'
import { Dialog } from './controls'

const elements = new Set([
  'p',
  'div',
  'span',
  'section',
  'article',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'br',
  'hr',
  'b',
  'strong',
  'i',
  'em',
  's',
  'del',
  'sub',
  'sup',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'dl',
  'dt',
  'dd',
  'kbd',
  'details',
  'summary',
])
const blocked = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'template',
  'link',
  'meta',
  'form',
  'input',
])
const maxPreview = 256 * 1024

// Parsing creates a JavaScript tree. Only allowlisted, attribute-free React elements reach the live DOM.
export function previewNodes(source: string, mode: 'html' | 'markdown'): ReactNode[] {
  if (source.length > maxPreview) return ['Document preview is limited to 256 KiB.']
  const html = mode === 'markdown' ? marked.parse(source, { async: false }) : source
  let remaining = 10_000
  function append(node: DefaultTreeAdapterTypes.ChildNode, key: number, depth: number): ReactNode {
    if (--remaining < 0 || depth > 35) return null
    if ('value' in node) return node.value
    if (
      !('tagName' in node) ||
      node.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
      blocked.has(node.tagName)
    )
      return null
    const tag = node.tagName
    if (tag === 'img') return node.attrs.find((attribute) => attribute.name === 'alt')?.value ?? null
    if (tag === 'br' || tag === 'hr') return createElement(tag, { key })
    const children = node.childNodes.map((child, index) => append(child, index, depth + 1))
    return createElement(elements.has(tag) ? tag : 'span', { key }, children)
  }
  return parseFragment(html).childNodes.map((node, index) => append(node, index, 0))
}

export default function PreviewDialog({
  left,
  right,
  language,
  close,
}: {
  left: Document
  right: Document
  language: string
  close: () => void
}) {
  function preview(doc: Document) {
    const name = doc.name.toLowerCase()
    const html =
      language === 'html' ||
      /\.html?$/.test(name) ||
      /^\s*<(?:!doctype html|html|article|div|h[1-6]|p)\b/i.test(doc.text)
    const markdown =
      language === 'markdown' || /\.md$/.test(name) || /^\s*(?:# |\x60{3}|\*\*|>\s)/m.test(doc.text)
    try {
      if (html || markdown) return previewNodes(doc.text, html ? 'html' : 'markdown')
      return <pre>{doc.text.length > maxPreview ? 'Document preview is limited to 256 KiB.' : doc.text}</pre>
    } catch {
      return <p>Could not render this local document.</p>
    }
  }
  return (
    <Dialog title="Document preview" close={close} wide>
      <p>Formats local HTML and Markdown with inert links and embedded resources.</p>
      <div className="preview-grid">
        {(
          [
            ['Original preview', left],
            ['Modified preview', right],
          ] as const
        ).map(([label, doc]) => (
          <section className="preview-pane" aria-label={label} key={label}>
            <header>{doc.name}</header>
            <article>{preview(doc)}</article>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
