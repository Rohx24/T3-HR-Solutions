import { useEffect, useRef, useState } from 'react'

// Motion helpers. Headlines use a masked line reveal (each line slides up from behind a mask, expo-out),
// body copy rises word by word, and sections fade up as they scroll into view. All CSS-driven and
// disabled under prefers-reduced-motion.

export function LineReveal({ lines, label, as: Tag = 'h1', delay = 0, step = 110, className = '' }) {
  return (
    <Tag className={`line-reveal ${className}`} aria-label={label}>
      {lines.map((line, i) => (
        <span className="lr-mask" key={i} aria-hidden={label ? 'true' : undefined}>
          <span className="lr-line" style={{ animationDelay: `${delay + i * step}ms` }}>
            {line}
          </span>
        </span>
      ))}
    </Tag>
  )
}

export function RiseWords({ text, as: Tag = 'p', delay = 0, step = 14, className = '' }) {
  const words = String(text).split(' ')
  return (
    <Tag className={`rise-words ${className}`} aria-label={text}>
      {words.map((word, i) => (
        <span key={i} aria-hidden="true">
          <span className="wd" style={{ animationDelay: `${delay + i * step}ms` }}>
            {word}
          </span>{' '}
        </span>
      ))}
    </Tag>
  )
}

export function useInView(options = { threshold: 0.18 }) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || inView) return
    if (!('IntersectionObserver' in window)) return setInView(true)
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true)
        io.disconnect()
      }
    }, options)
    io.observe(el)
    return () => io.disconnect()
  }, [inView]) // eslint-disable-line react-hooks/exhaustive-deps
  return [ref, inView]
}

export function Reveal({ children, className = '', as: Tag = 'div', delay = 0, ...rest }) {
  const [ref, inView] = useInView()
  return (
    <Tag ref={ref} className={`reveal ${inView ? 'in-view' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  )
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Counts from the previous value to `value` with an expo-out curve.
export function CountUp({ value = 0, duration = 1100 }) {
  const [shown, setShown] = useState(reducedMotion() ? value : 0)
  const from = useRef(0)
  useEffect(() => {
    if (reducedMotion()) return setShown(value)
    const start = performance.now()
    const begin = from.current
    let raf
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
      setShown(Math.round(begin + (value - begin) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <span className="tabular">{shown}</span>
}
