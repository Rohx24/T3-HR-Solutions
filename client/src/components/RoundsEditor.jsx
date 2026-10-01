// Edits a job's own list of interview rounds, in order. Applied (start) and Offer / Hired / Rejected
// (end) are fixed and added automatically, so people only name the interviews in between.

export const DEFAULT_ROUNDS = ['Screening', 'Technical', 'HR Round']

const PRESETS = [
  ['One interview', ['Interview']],
  ['Two rounds', ['First interview', 'Final interview']],
  ['Standard (3 rounds)', DEFAULT_ROUNDS],
]

export default function RoundsEditor({ rounds, onChange }) {
  const set = (i, value) => onChange(rounds.map((r, j) => (j === i ? value : r)))
  const remove = (i) => onChange(rounds.filter((_, j) => j !== i))
  const move = (i, d) => {
    const next = [...rounds]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }

  return (
    <div className="rounds-editor">
      <div className="rounds-presets">
        <span className="muted small">Quick choice:</span>
        {PRESETS.map(([label, list]) => (
          <button type="button" key={label} className="chip chip-button" onClick={() => onChange([...list])}>
            {label}
          </button>
        ))}
      </div>

      <ol className="rounds-list">
        <li className="round-fixed">Applied <span className="muted small">(start, automatic)</span></li>
        {rounds.map((r, i) => (
          <li key={i} className="round-row">
            <span className="round-n">{i + 1}</span>
            <input
              value={r}
              onChange={(e) => set(i, e.target.value)}
              placeholder={`Round ${i + 1} name, e.g. Phone call`}
              aria-label={`Round ${i + 1} name`}
              maxLength={40}
            />
            <button type="button" className="icon-sq" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">
              ↑
            </button>
            <button type="button" className="icon-sq" onClick={() => move(i, 1)} disabled={i === rounds.length - 1} aria-label="Move down" title="Move down">
              ↓
            </button>
            <button type="button" className="icon-sq danger" onClick={() => remove(i)} disabled={rounds.length === 1} aria-label="Remove round" title="Remove">
              ×
            </button>
          </li>
        ))}
        <li className="round-fixed">Offer → Hired <span className="muted small">(end, automatic; Rejected is always available)</span></li>
      </ol>

      {rounds.length < 10 && (
        <button type="button" className="btn btn-small" onClick={() => onChange([...rounds, ''])}>
          + Add a round
        </button>
      )}
    </div>
  )
}

export const cleanRounds = (rounds) => rounds.map((r) => r.trim()).filter(Boolean)
