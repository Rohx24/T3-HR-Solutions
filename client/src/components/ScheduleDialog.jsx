import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useToast } from './Toast.jsx'
import { Modal } from './ui.jsx'

// Schedule an interview for one of the job's rounds: date, time, length, who and where.
// `application` needs: id, rounds, stage, and a label (candidate / job) for the title.

const pad = (n) => String(n).padStart(2, '0')
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function suggestedRound(app) {
  const i = app.rounds.indexOf(app.stage)
  if (i === -1) return app.rounds[0]
  return app.rounds[Math.min(i, app.rounds.length - 1)]
}

export default function ScheduleDialog({ application, title, onClose, onSaved }) {
  const { user } = useAuth()
  const toast = useToast()
  const tomorrow = new Date(Date.now() + 86_400_000)
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!application) return
    setForm({
      round: suggestedRound(application),
      date: toLocalInput(tomorrow),
      time: '11:00',
      duration: '45',
      interviewer: user?.name || '',
      location: '',
    })
    setError('')
  }, [application]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (!form.date || !form.time) return setError('Please choose a date and a time.')
    const when = new Date(`${form.date}T${form.time}`)
    if (Number.isNaN(when.getTime())) return setError('That date or time does not look right.')
    setBusy(true)
    setError('')
    try {
      await api.scheduleInterview({
        application_id: application.id,
        round: form.round,
        scheduled_at: when.toISOString(),
        duration_minutes: Number(form.duration) || null,
        interviewer: form.interviewer,
        location: form.location,
      })
      toast.success('Interview scheduled', { message: `${form.round} · ${formatWhen(when.toISOString())}` })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={Boolean(application)} title={title || 'Schedule an interview'} onClose={onClose}>
      {application && (
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>Which round?</span>
            <select value={form.round || ''} onChange={set('round')}>
              {application.rounds.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <label className="field">
              <span>Date</span>
              <input type="date" value={form.date || ''} onChange={set('date')} required />
            </label>
            <label className="field">
              <span>Time</span>
              <input type="time" value={form.time || ''} onChange={set('time')} required />
            </label>
          </div>
          <div className="form-row">
            <label className="field">
              <span>How long?</span>
              <select value={form.duration || ''} onChange={set('duration')}>
                {['15', '30', '45', '60', '90', '120'].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Interviewer</span>
              <input value={form.interviewer || ''} onChange={set('interviewer')} placeholder="Who will take it" />
            </label>
          </div>
          <label className="field">
            <span>
              Where? <span className="muted">(office address or meeting link, optional)</span>
            </span>
            <input value={form.location || ''} onChange={set('location')} placeholder="e.g. Google Meet link, or Office, 2nd floor" />
          </label>
          <p className="muted small">The candidate moves to this round on the hiring board when you schedule it.</p>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Schedule interview'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export function formatWhen(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// One interview line with its actions (finish / cancel). Used on the candidate page.
export function InterviewItem({ iv, onChanged }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function update(patch, done) {
    setBusy(true)
    try {
      await api.updateInterview(iv.id, patch)
      toast.success(done)
      onChanged?.()
    } catch (err) {
      toast.error('Could not update the interview', { message: err.message })
    } finally {
      setBusy(false)
    }
  }

  const past = new Date(iv.scheduled_at) < new Date()
  return (
    <li className={`iv-item iv-${iv.status}`}>
      <div className="iv-main">
        <div className="iv-title">
          <strong>{iv.round}</strong>
          <span className={`iv-status iv-status-${iv.status}`}>
            {iv.status === 'scheduled' ? (past ? 'Waiting to be marked' : 'Scheduled') : iv.status === 'completed' ? 'Finished' : 'Cancelled'}
          </span>
        </div>
        <span className="muted small">
          {iv.job_title} · {formatWhen(iv.scheduled_at)}
          {iv.duration_minutes ? ` · ${iv.duration_minutes} min` : ''}
        </span>
        <span className="muted small">
          {[iv.interviewer && `With ${iv.interviewer}`, iv.location].filter(Boolean).join(' · ')}
        </span>
        {iv.status === 'completed' && iv.completed_at && <span className="small iv-done">Finished {formatWhen(iv.completed_at)}</span>}
      </div>
      {iv.status === 'scheduled' && (
        <div className="iv-actions">
          <button className="btn btn-small btn-primary" disabled={busy} onClick={() => update({ status: 'completed' }, 'Marked as finished')}>
            Mark as finished
          </button>
          <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => update({ status: 'cancelled' }, 'Interview cancelled')}>
            Cancel
          </button>
        </div>
      )}
    </li>
  )
}
