import { createContext, useContext, type ReactNode } from 'react'
import { useToast, type ToastType } from '../hooks/useToast'
import ToastContainer from '../components/ToastContainer'

interface ToastContextValue {
  addToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} })

/**
 * ToastProvider — wraps the app and provides `addToast` to all descendants
 * via `useToastContext`. The ToastContainer is mounted inside the provider so
 * it lives at a consistent place in the DOM regardless of page.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { toasts, addToast, removeToast } = useToast()

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToastContext() {
  return useContext(ToastContext)
}
