import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { STAGES, stageSlug } from '../utils.js'

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <header className="page-header">
      <div>
        {back}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function PageState({ loading, error, onRetry }) {
  if (error) {
    return (
      <div className="empty-state">
        <h2>Couldn't load this page</h2>
        <p className="muted">{error.message}</p>
        {onRetry && (
          <button className="btn" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    )
  }
  if (loading) return <Spinner label="Loading" />
  return null
}

export function Spinner({ label }) {
  return (
    <div className="spinner-wrap">
      <span className="spinner" aria-hidden="true" />
      {label && <span className="muted">{label}…</span>}
    </div>
  )
}

export function StageBadge({ stage }) {
  return <span className={`stage-badge stage-${stageSlug(stage)}`}>{stage}</span>
}

export function StageSelect({ value, onChange, stages = STAGES, disabled, label = 'Stage' }) {
  return (
    <select
      className={`stage-select stage-${stageSlug(value)}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={label}
    >
      {stages.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  )
}

export function SkillChips({ skills = [], max, variant = '' }) {
  const shown = max ? skills.slice(0, max) : skills
  const extra = skills.length - shown.length
  if (!skills.length) return <span className="muted small">No skills</span>
  return (
    <div className="chips">
      {shown.map((s) => (
        <span key={s} className={`chip ${variant ? `chip-${variant}` : ''}`}>
          {s}
        </span>
      ))}
      {extra > 0 && <span className="chip chip-more">+{extra}</span>}
    </div>
  )
}

export function ReturningBadge({ times }) {
  if (!times || times <= 1) return null
  return (
    <span className="badge badge-returning" title={`Applied ${times} times`}>
      Returning
    </span>
  )
}

export function MatchScore({ score }) {
  const tone = score >= 75 ? 'high' : score >= 50 ? 'mid' : 'low'
  return (
    <span className={`match match-${tone}`} title={`Has ${score ?? 0}% of the skills this job needs`}>
      {score ?? 0}% match
    </span>
  )
}

export function Stars({ value = 0 }) {
  return (
    <span className="stars" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? 'star on' : 'star'}>
          ★
        </span>
      ))}
    </span>
  )
}

export function StarInput({ value, onChange }) {
  return (
    <div className="star-input" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          key={n}
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={n <= value ? 'star on' : 'star'}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, title, onClose, children, wide }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  // Portal to <body>: an animated (transformed) page ancestor would otherwise trap position:fixed,
  // placing the dialog relative to the page instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
