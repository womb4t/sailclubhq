/**
 * Waypoint Racing brand mark — three course marks (nodes) joined by legs into a
 * windward-leeward triangle. Single-colour: inherits `currentColor`, so set the
 * text colour on a parent (white on dark, near-black on light). Node holes and
 * route rails are true transparent cutouts, so it sits on any background.
 */
export function WaypointMark({
  className,
  title = 'Waypoint Racing',
}: {
  className?: string
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 200 176"
      className={className}
      role="img"
      aria-label={title}
      fill="none"
    >
      <defs>
        <mask id="wp-cutouts">
          <rect width="200" height="176" fill="white" />
          <circle cx="100" cy="26" r="12" fill="black" />
          <circle cx="26" cy="140" r="12" fill="black" />
          <circle cx="174" cy="140" r="12" fill="black" />
          <line x1="46" y1="118" x2="88" y2="52" stroke="black" strokeWidth="4" strokeLinecap="round" />
          <line x1="154" y1="118" x2="112" y2="52" stroke="black" strokeWidth="4" strokeLinecap="round" />
          <line x1="52" y1="140" x2="148" y2="140" stroke="black" strokeWidth="4" strokeLinecap="round" />
        </mask>
      </defs>
      <g fill="currentColor" mask="url(#wp-cutouts)">
        <path d="M26 140 L100 26 L116 37 L42 151 Z" />
        <path d="M100 26 L174 140 L158 151 L84 37 Z" />
        <path d="M26 130 L174 130 L174 150 L26 150 Z" />
        <circle cx="100" cy="26" r="24" />
        <circle cx="26" cy="140" r="24" />
        <circle cx="174" cy="140" r="24" />
      </g>
    </svg>
  )
}
