import { compare, compareWorkspace, defaults, type ComparisonOptions } from './text'
import { threeWay } from './three-way'

self.onmessage = ({
  data,
}: MessageEvent<{
  left: string
  right: string
  options: ComparisonOptions
  base?: string
  workspace?: boolean
}>) => {
  try {
    if (data.base !== undefined) {
      self.postMessage({ parts: threeWay(data.base, data.left, data.right) })
      return
    }
    const calculate = data.workspace ? compareWorkspace : compare
    const diff = calculate(data.left, data.right, data.options)
    const raw = Object.entries(data.options).some(
      ([key, value]) =>
        key !== 'context' &&
        (Array.isArray(value) ? value.length > 0 : value !== defaults[key as keyof ComparisonOptions]),
    )
      ? calculate(data.left, data.right)
      : diff
    self.postMessage({ diff, raw })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Comparison failed.' })
  }
}
