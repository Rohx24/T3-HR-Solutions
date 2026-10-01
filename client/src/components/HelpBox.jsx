import { useState } from 'react'

// A plain-language "What is this page and what do I do here?" box at the top of each page.
// It can be hidden ("Got it") and brought back with "Show help", remembered per page.

function read(key) {
  try {
    return localStorage.getItem(key) === 'hidden'
  } catch {
    return false
  }
}
function write(key, hidden) {
  try {
    if (hidden) localStorage.setItem(key, 'hidden')
    else localStorage.removeItem(key)
  } catch {
    // storage unavailable: the box simply shows again next time
  }
}

export default function HelpBox({ id, title, children, steps = [] }) {
  const key = `hr-int.help.${id}`
  const [hidden, setHidden] = useState(() => read(key))

  if (hidden) {
    return (
      <button
        className="help-show"
        onClick={() => {
          write(key, false)
          setHidden(false)
        }}
      >
        <span aria-hidden="true">?</span> Show help for this page
      </button>
    )
  }

  return (
    <aside className="helpbox" role="note" aria-label={title}>
      <span className="helpbox-icon" aria-hidden="true">
        ?
      </span>
      <div className="helpbox-body">
        <strong>{title}</strong>
        {children && <p>{children}</p>}
        {steps.length > 0 && (
          <ol>
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        )}
      </div>
      <button
        className="helpbox-close"
        onClick={() => {
          write(key, true)
          setHidden(true)
        }}
      >
        Got it, hide this
      </button>
    </aside>
  )
}

// What each hiring step means, in plain words. Used on the job board and in the help boxes.
export const STAGE_HELP = {
  Applied: 'New. Not contacted yet.',
  Screening: 'First phone call or chat.',
  Technical: 'Skills interview or test.',
  'HR Round': 'Salary and joining date discussion.',
  Offer: 'Offer letter sent.',
  Hired: 'Accepted and joined.',
  Rejected: 'Not selected this time.',
}
export const stageHelp = (stage) => STAGE_HELP[stage] || 'Interview round for this job.'
