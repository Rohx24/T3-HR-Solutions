// T3Cogno wordmark in the brand gradient (#0C86E9 to #10ECC2), drawn in SVG so no image asset is needed.
export default function Logo({ light = false, product = 'Talent' }) {
  return (
    <span className={`logo ${light ? 'logo-light' : ''}`}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="t3-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0.18" stopColor="#0C86E9" />
            <stop offset="1" stopColor="#10ECC2" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="3" fill="url(#t3-grad)" />
        <text x="16" y="21.5" textAnchor="middle" fontFamily="Arimo, Arial, sans-serif" fontWeight="700" fontSize="14.5" fill="#fff">
          T3
        </text>
      </svg>
      <span className="logo-word">
        <strong>T3COGNO</strong>
        <span>{product}</span>
      </span>
    </span>
  )
}
