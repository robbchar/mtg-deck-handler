import type { Toast } from '../hooks/useToast'

const TYPE_STYLES: Record<Toast['type'], string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-green-200 bg-green-50 text-green-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
}

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: string) => void
}

/**
 * ToastContainer — renders the active toast stack in the bottom-right corner.
 * Pair with the useToast hook.
 */
export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      data-testid="toast-container"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          data-testid="toast"
          className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 shadow-lg text-sm font-medium ${TYPE_STYLES[toast.type]}`}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => onRemove(toast.id)}
            className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
            aria-label="Dismiss notification"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
