export function RouteOverlay({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 180" className={className} aria-hidden="true" fill="none">
      <path
        d="M0,150 C140,60 320,120 480,20"
        stroke="#C1075D"
        strokeWidth="3"
        strokeLinecap="round"
        className="route-line"
      />
    </svg>
  )
}
