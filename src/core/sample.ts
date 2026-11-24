export const sampleLeft =
  'server:\n  host: 127.0.0.1\n  port: 8080\n  workers: 2\n\nlogging:\n  level: info\n  format: plain\n\ncache:\n  enabled: false\n  ttl: 60\n\nfeatures:\n  healthcheck: true\n  metrics: false\n'
export const sampleRight =
  'server:\n  host: 127.0.0.1\n  port: 8443\n  workers: 4\n  tls: true\n\nlogging:\n  level: warn\n  format: json\n\ncache:\n  enabled: true\n  ttl: 300\n\nfeatures:\n  healthcheck: true\n  metrics: true\n'
