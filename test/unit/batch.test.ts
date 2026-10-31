import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBatcher } from '~/lib/batch'

describe('createBatcher', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces bursts into one flush per interval', () => {
    vi.useFakeTimers()
    const flush = vi.fn()
    const batcher = createBatcher(flush, 50)

    batcher.schedule()
    batcher.schedule()
    batcher.schedule()
    expect(flush).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)
    expect(flush).toHaveBeenCalledTimes(1)

    batcher.schedule()
    vi.advanceTimersByTime(50)
    expect(flush).toHaveBeenCalledTimes(2)
  })

  it('flushes immediately on demand and cancels the pending timer', () => {
    vi.useFakeTimers()
    const flush = vi.fn()
    const batcher = createBatcher(flush, 50)

    batcher.schedule()
    batcher.flush()
    vi.advanceTimersByTime(100)
    expect(flush).toHaveBeenCalledTimes(1)
  })
})
