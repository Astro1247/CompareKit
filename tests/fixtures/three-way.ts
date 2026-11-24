export const base = 'server:\n  host: 2.0.0.0\n  port: 8080\n  workers: 4\n  timeout: 30\n  keepalive: true\n'
export const versionA = base.replace('2.0.0.0', '3.0.0.0')
export const versionB =
  'server:\n  host: 1.0.0.0\n  port: 8443\n  workers: 8\n  timeout: 60\n  keepalive: true\n  compression: gzip\n'
export const merged = versionB.replace('1.0.0.0', '3.0.0.0')
