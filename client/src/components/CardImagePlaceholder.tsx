interface CardImagePlaceholderProps {
  className?: string
}

export default function CardImagePlaceholder({ className = '' }: CardImagePlaceholderProps) {
  return (
    <div
      className={`flex items-center justify-center rounded bg-gradient-to-br from-slate-700 to-indigo-900 ${className}`}
      role="presentation"
      aria-hidden="true"
      data-testid="card-image-placeholder"
    >
      <svg
        viewBox="0 0 40 56"
        className="h-3/4 w-3/4 text-indigo-200 opacity-30"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Diamond outline — classic MTG card-back motif */}
        <path
          d="M20 3 L37 28 L20 53 L3 28 Z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        {/* Inner oval */}
        <ellipse
          cx="20"
          cy="28"
          rx="9.5"
          ry="13.5"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>
    </div>
  )
}