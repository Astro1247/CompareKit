export function workerTask<Input, Output>(worker: Worker, request: Input, timeout: number) {
  let cancel = () => {}
  const result = new Promise<Output>((resolve, reject) => {
    const timer = window.setTimeout(
      () => fail('The operation exceeded its time budget. Try a smaller input.'),
      timeout,
    )
    const stop = () => {
      window.clearTimeout(timer)
      worker.terminate()
    }
    const fail = (message: string) => {
      stop()
      reject(new Error(message))
    }
    cancel = () => fail('')
    worker.onerror = () => fail('The task could not start.')
    worker.onmessage = ({ data }: MessageEvent<{ output: Output; error?: string }>) => {
      if (data.error) fail(data.error)
      else {
        stop()
        resolve(data.output)
      }
    }
    try {
      worker.postMessage(request)
    } catch {
      fail('The input could not be sent to the local worker.')
    }
  })
  return { result, cancel }
}
