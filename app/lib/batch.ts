/**
 * Coalesces bursts of calls into at most one `flush` per interval.
 * Used to stream tokens into the editor without re-rendering per token.
 */
export function createBatcher(flush: () => void, intervalMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined

  return {
    schedule() {
      timer ??= setTimeout(() => {
        timer = undefined
        flush()
      }, intervalMs)
    },
    /** Runs any pending flush immediately. */
    flush() {
      clearTimeout(timer)
      timer = undefined
      flush()
    }
  }
}
