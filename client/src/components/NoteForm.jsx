import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { STAGES } from '../utils.js'
import { useToast } from './Toast.jsx'
import { StarInput } from './ui.jsx'

const AUTHOR_KEY = 'hr-int.author'

function readAuthor() {
  try {
    return localStorage.getItem(AUTHOR_KEY) || ''
  } catch {
    return ''
  }
}

function saveAuthor(name) {
  try {
    localStorage.setItem(AUTHOR_KEY, name)
  } catch {
    // storage unavailable, nothing to remember
  }
}

export default function NoteForm({ candidateId, applications, onSaved }) {
  const toast = useToast()
  const first = applications[0]
  const [appId, setAppId] = useState(first ? String(first.id) : '')
  const [round, setRound] = useState(first && first.stage !== 'Applied' ? first.stage : 'Screening')
  const [rating, setRating] = useState(0)
  const [author, setAuthor] = useState(readAuthor)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Keep the selected application valid when the list changes.
  useEffect(() => {
    if (appId && !applications.some((a) => String(a.id) === appId)) setAppId('')
  }, [applications, appId])

  function chooseApp(value) {
    setAppId(value)
    const app = applications.find((a) => String(a.id) === value)
    if (app && app.stage !== 'Applied') setRound(app.stage)
  }

  async function submit(e) {
    e.preventDefault()
    if (!rating) return setError('Give a rating from 1 to 5.')
    if (!body.trim()) return setError('Write a comment.')
    setBusy(true)
    setError('')
    try {
      await api.addNote(candidateId, {
        application_id: appId ? Number(appId) : null,
        round,
        author: author.trim() || 'Recruiter',
        rating,
        body: body.trim(),
      })
      saveAuthor(author.trim())
      toast.success('Comment added', { message: `${round} · ${rating}/5` })
      setBody('')
      setRating(0)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-row">
        <label className="field">
          <span>Application</span>
          <select value={appId} onChange={(e) => chooseApp(e.target.value)}>
            <option value="">General (no job)</option>
            {applications.map((a) => (
              <option key={a.id} value={a.id}>
                {a.job_title} · {a.company_name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Round</span>
          <select value={round} onChange={(e) => setRound(e.target.value)}>
            {STAGES.filter((s) => s !== 'Applied').map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <div className="field">
          <span>Rating</span>
          <StarInput value={rating} onChange={setRating} />
        </div>
        <label className="field">
          <span>Interviewer</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" />
        </label>
      </div>
      <label className="field">
        <span>Comment</span>
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Strengths, gaps, recommendation for the next round…"
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save comment'}
        </button>
      </div>
    </form>
  )
}
