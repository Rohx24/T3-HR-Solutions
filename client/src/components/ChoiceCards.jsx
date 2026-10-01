// Pick-one option cards (icon, title, one-line description). Real radio inputs underneath, so keyboard
// and screen readers work. Used by the apply page and the call dialog.

export const CALL_ICONS = {
  whatsapp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 20 11.5Z" />
      <path d="M9 8.5c0 3.5 2.6 6.5 6 6.8l1.2-1.4-2-1.2-.9.8c-1.2-.5-2.1-1.4-2.6-2.6l.8-.9-1.2-2L9 8.5Z" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </svg>
  ),
}

export default function ChoiceCards({ name, label, options, value, onChange, hint }) {
  return (
    <fieldset className="field choice-field">
      {label && <legend>{label}</legend>}
      <div className="choice-grid">
        {options.map((o) => (
          <label key={o.value} className={`choice ${value === o.value ? 'on' : ''}`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.icon && (
              <span className="choice-icon" aria-hidden="true">
                {o.icon}
              </span>
            )}
            <span className="choice-text">
              <strong>{o.title}</strong>
              {o.text && <small>{o.text}</small>}
            </span>
            <span className="choice-tick" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
          </label>
        ))}
      </div>
      {hint && <p className="muted small">{hint}</p>}
    </fieldset>
  )
}
