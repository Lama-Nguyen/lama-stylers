import { useEffect, useRef } from 'react'
import { processSyncQueue } from '../lib/indexedDB'
import { useOnlineStatus } from './useOnlineStatus.jsx'

export function useOfflineSync(syncFn = null) {
  const timerRef = useRef(null)
  const isOnline = useOnlineStatus()

  useEffect(() => {
    if (!isOnline) return
    clearTimeout(timerRef.current)

    const run = async () => {
      try {
        if (syncFn) await syncFn()
        else await processSyncQueue(async () => {})
      } catch (e) {
        console.error('[useOfflineSync]', e)
      }
      timerRef.current = setTimeout(run, 30_000)
    }

    run()
    return () => clearTimeout(timerRef.current)
  }, [isOnline, syncFn])

  return { isOnline }
}
