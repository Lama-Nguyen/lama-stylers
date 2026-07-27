import { useState, useCallback, useRef } from 'react'

const MAX_TOASTS       = 5
const AUTO_DISMISS_MS  = 5000

export function useToastQueue() {
  const [toasts, setToasts]   = useState([])
  const timeoutsRef           = useRef({})

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    clearTimeout(timeoutsRef.current[id])
    delete timeoutsRef.current[id]
  }, [])

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random()
    setToasts(prev => {
      let next = [...prev, { id, message, type }]
      if (next.length > MAX_TOASTS) {
        const removed = next.shift()
        clearTimeout(timeoutsRef.current[removed.id])
        delete timeoutsRef.current[removed.id]
      }
      return next
    })
    timeoutsRef.current[id] = setTimeout(() => removeToast(id), AUTO_DISMISS_MS)
    return id
  }, [removeToast])

  return { toasts, addToast, removeToast }
}
