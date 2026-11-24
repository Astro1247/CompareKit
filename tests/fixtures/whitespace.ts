const steps = [
  '  - name: Refresh cache',
  '    retries: 3',
  '    timeout: 30',
  '  - name: Run health check',
  '    endpoint: /health',
]

export const whitespaceOriginal = ['tasks:', ...steps, 'enabled: true', ''].join('\n')
export const whitespaceModified = [
  'tasks:',
  '  scheduled:',
  ...steps.map((line) => '  ' + line),
  'enabled: true',
  '',
].join('\n')
