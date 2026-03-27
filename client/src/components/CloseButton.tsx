import type { ButtonHTMLAttributes } from 'react'

interface CloseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  onClick: () => void
  'aria-label'?: string
  className?: string
}

/**
 * Reusable × close button with a standard icon.
 * Spreads any additional props (e.g. data-testid) onto the underlying button.
 */
function CloseButton({
  onClick,
  'aria-label': ariaLabel = 'Close',
  className = '',
  ...rest
}: CloseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`rounded-md p-1.5 text-gray-400 focus:outline-none focus:ring-2 ${className}`}
      {...rest}
    >
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  )
}

export default CloseButton
