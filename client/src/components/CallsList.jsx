import { useState } from 'react'
import { api } from '../api.js'
import { formatDate, timeAgo } from '../utils.js'
import { useToast } from './Toast.jsx'
import { SkillChips, Spinner } from './ui.jsx'

const METHOD = { recorded: 'Live recording', uploaded: 'Uploaded recording', typed: 'Typed notes' }
const FIELD_LABELS = {
  current_company: 'Current company',
  current_title: 'Current role',
  current_ctc: 'Current salary',
  expected_ctc: 'Expected salary',
  notice_period: 'Notice period',
  can_join_by: 'Can join by',
  current_location: 'Lives in',
  availability_for_interview: 'Free for interviews',
  reason_for_change: 'Why they want to change',
}

const dur = (s) => (s ? `${Math.floor(s / 60)} min ${s % 60} s` : null)
const has = (v) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== '')

function CallItem({ call, onChanged }) {
  const toast = useToast()
  const [retrying, setRetrying] = useState(false)
  const ins = call.insights

  async function retry() {
    setRetrying(true)
    try {
      await api.retryCall(call.id)
      toast.info('Trying again', { message: 'The AI is reading the call again.' })
      onChanged?.()
    } catch (err) {
      toast.error('Could not retry', { message: err.message })
    } finally {
      setRetrying(false)
    }
  }

  const facts = ins
    ? [
        ...Object.entries(FIELD_LABELS).map(([k, label]) => [label, ins[k]]),
        ['Experience', ins.total_experience_years != null ? `${ins.total_experience_years} years` : null],
        ['Preferred locations', (ins.preferred_locations || []).join(', ')],
        ['Can relocate', ins.willing_to_relocate == null ? null : ins.willing_to_relocate ? 'Yes' : 'No'],
        ['Languages', (ins.languages || []).join(', ')],
      ].filter(([, v]) => has(v))
    : []

  return (
    <li className={`call-item call-${call.status}`}>
      <div className="call-head">
        <div>
          <strong>{call.channel === 'whatsapp' ? 'WhatsApp call' : 'Phone call'}</strong>
          <span className="muted small"> · {METHOD[call.method]}</span>
          <span className="muted small">
            {' '}
            · {formatDate(call.created_at)} ({timeAgo(call.created_at)})
            {call.duration_seconds ? ` · ${dur(call.duration_seconds)}` : ''}
            {call.recorded_by ? ` · by ${call.recorded_by}` : ''}
          </span>
        </div>
        {call.status === 'processing' && (
          <span className="call-status processing">
            <Spinner /> AI is writing it up…
          </span>
        )}
        {call.status === 'done' && ins?.interest_level && ins.interest_level !== 'Not discussed' && (
          <span className={`call-status interest-${ins.interest_level.toLowerCase().replace(/\s+/g, '-')}`}>{ins.interest_level}</span>
        )}
      </div>

      {call.status === 'failed' && (
        <div className="call-error">
          <span>{call.error || 'Something went wrong while reading this call.'}</span>
          {call.has_audio && (
            <button className="btn btn-small" onClick={retry} disabled={retrying}>
              Try again
            </button>
          )}
        </div>
      )}
      {call.status === 'done' && call.error && <p className="muted small">{call.error}</p>}

      {call.summary && <p className="call-summary">{call.summary}</p>}

      {facts.length > 0 && (
        <dl className="call-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {ins &&
        [
          ['Key points', ins.key_points],
          ['Concerns', ins.concerns],
          ['Next steps', ins.follow_up_actions],
        ]
          .filter(([, v]) => has(v))
          .map(([label, v]) => (
            <div key={label} className="call-block">
              <p className="label">{label}</p>
              <ul className="exp-points">
                {v.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          ))}
      {has(ins?.skills_mentioned) && (
        <div className="call-block">
          <p className="label">Skills mentioned</p>
          <SkillChips skills={ins.skills_mentioned} />
        </div>
      )}
      {ins?.hr_comments && (
        <div className="call-block">
          <p className="label">Recruiter's comments</p>
          <p>{ins.hr_comments}</p>
        </div>
      )}
      {has(ins?.updated_fields) && (
        <p className="call-updated small">Profile updated from this call: {ins.updated_fields.map((f) => f.replace(/_/g, ' ')).join(', ')}</p>
      )}

      {call.notes && (
        <div className="call-block">
          <p className="label">Notes typed by the recruiter</p>
          <p className="pre">{call.notes}</p>
        </div>
      )}
      {call.has_audio && <audio controls preload="none" src={api.callAudioUrl(call.id)} className="audio" />}
      {call.transcript && (
        <details className="call-transcript">
          <summary>Read the full transcript</summary>
          <p className="pre">{call.transcript}</p>
        </details>
      )}
    </li>
  )
}

export default function CallsList({ calls = [], onChanged }) {
  if (!calls.length) {
    return <p className="muted">No calls yet. After you speak to this candidate, press Add call details.</p>
  }
  return (
    <ul className="call-list">
      {calls.map((c) => (
        <CallItem key={c.id} call={c} onChanged={onChanged} />
      ))}
    </ul>
  )
}
