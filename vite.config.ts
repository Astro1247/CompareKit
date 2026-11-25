import { defineConfig, loadEnv } from 'vite'

function usageConfig(env: Record<string, string>) {
  let endpoint = env.COMPAREKIT_UMAMI_ENDPOINT?.trim()
  let websiteId = env.COMPAREKIT_UMAMI_WEBSITE_ID?.trim()
  if (!endpoint && !websiteId) {
    endpoint = env.COMPAREKIT_UMAMI_DEFAULT_ENDPOINT?.trim()
    websiteId = env.COMPAREKIT_UMAMI_DEFAULT_WEBSITE_ID?.trim()
  }
  if (!endpoint && !websiteId) return null
  const url = endpoint ? URL.parse(endpoint) : null
  if (
    !url ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^(?:[a-z\d.-]+|\[[a-f\d:]+\])$/i.test(url.hostname) ||
    !/^\/[\w./~-]+$/.test(url.pathname) ||
    !websiteId ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(websiteId)
  ) {
    throw new Error('Set both a valid Umami HTTPS collection endpoint and a public website UUID.')
  }
  return { endpoint: url.href, websiteId }
}

export default defineConfig(({ mode }) => {
  const usage = usageConfig(loadEnv(mode, process.cwd(), 'COMPAREKIT_UMAMI_'))
  return {
    base: './',
    worker: { format: 'es' },
    build: { target: 'es2022', chunkSizeWarningLimit: 4500 },
    define: { __COMPAREKIT_USAGE__: JSON.stringify(usage) },
    plugins: usage
      ? [
          {
            name: 'comparekit-usage-csp',
            transformIndexHtml(html) {
              if (!html.includes("connect-src 'none';")) {
                throw new Error('Could not apply the Umami endpoint to the default content security policy.')
              }
              return html.replace("connect-src 'none';", `connect-src ${usage.endpoint};`)
            },
          },
        ]
      : [],
  }
})
