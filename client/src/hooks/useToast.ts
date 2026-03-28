import { useState, useCallback, useRef } from 'react'

export type ToastType = 'error' | 'success' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

const AUTO_DISMISS_MS = 4000

/**
 * useToast — lightweight in-app notification system with no external deps.
 *
 * Returns:
 *   toasts   — array of active Toast objects (pass to ToastContainer)
 *   addToast — show a new toast (auto-dismissed after AUTO_DISMISS_MS ms)
 *   removeToast — manually dismiss by id
 */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: string) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback(
    (message: string, type: ToastType = 'error') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
      setToasts((prev) => [...prev, { id, message, type }])
      const timer = setTimeout(() => removeToast(id), AUTO_DISMISS_MS)
      timers.current.set(id, timer)
    },
    [removeToast],
  )

  return { toasts, addToast, removeToast }
}
