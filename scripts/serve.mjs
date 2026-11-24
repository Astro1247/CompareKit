import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGzip } from 'node:zlib'

const root = resolve(process.env.STATIC_ROOT || fileURLToPath(new URL('../dist', import.meta.url)))
const port = Number(process.env.PORT ?? 8080)
const host = process.env.HOST ?? '127.0.0.1'
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.ttf': 'font/ttf',
}
const headers = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' blob: data:; font-src 'self'; worker-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Resource-Policy': 'same-origin',
}
const production = process.env.STATIC_ROOT === undefined
const server = createServer(async (request, response) => {
  try {
    if (production) for (const [name, value] of Object.entries(headers)) response.setHeader(name, value)
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end()
      return
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (pathname.includes('\\') || [...pathname].some((character) => character.charCodeAt(0) < 32))
      throw new Error('Invalid path')
    if (pathname === '/healthz') {
      await stat(resolve(root, 'index.html'))
      response
        .writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
        .end(request.method === 'HEAD' ? '' : 'ok\n')
      return
    }
    const file = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`)
    if (!file.startsWith(root + sep)) throw new Error('Outside static root')
    const info = await stat(file)
    if (!info.isFile()) throw new Error('Not a file')
    const extension = extname(file)
    const compressible = ['.html', '.css', '.js', '.json', '.txt', '.md', '.svg'].includes(extension)
    const gzip =
      compressible &&
      info.size > 1024 &&
      (request.headers['accept-encoding'] ?? '')
        .split(',')
        .some((item) => /^\s*gzip(?:\s*;\s*q\s*=\s*(?!0(?:\.0*)?\s*$)[0-9.]+)?\s*$/i.test(item))
    response.writeHead(200, {
      'Content-Type': Object.hasOwn(types, extension) ? types[extension] : 'application/octet-stream',
      ...(compressible && { Vary: 'Accept-Encoding' }),
      ...(gzip ? { 'Content-Encoding': 'gzip' } : { 'Content-Length': info.size }),
      'Cache-Control': /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    if (request.method === 'HEAD') response.end()
    else {
      const stream = createReadStream(file).on('error', () => response.destroy())
      response.on('close', () => stream.destroy())
      if (gzip) stream.pipe(createGzip().on('error', () => response.destroy())).pipe(response)
      else stream.pipe(response)
    }
  } catch {
    if (!response.headersSent) response.writeHead(404).end('Not found\n')
  }
})
server.listen(port, host, () => console.log(`CompareKit http://${host}:${port}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close())
