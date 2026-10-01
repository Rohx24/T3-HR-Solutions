import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { formatDate, intlNumber } from '../utils.js'
import { useToast } from './Toast.jsx'
import { Modal } from './ui.jsx'

// Call-recording consent on the candidate profile: current answer, and a way to ask for it.

const METHOD = { link: 'consent link', apply_page: 'apply page', verbal: 'on a call' }

export function consentLabel(rc) {
  const when = rc?.at ? formatDate(rc.at) : ''
  switch (rc?.status) {
    case 'granted':
      return { tone: 'yes', text: `Agreed to call recording`, detail: `${when} · ${METHOD[rc.method] ?? rc.method}${rc.method === 'verbal' && rc.recorded_by ? `, confirmed by ${rc.recorded_by}` : ''}` }
    case 'refused':
      return { tone: 'no', text: 'Said no to call recording', detail: `${when} · ${METHOD[rc.method] ?? rc.method}` }
    case 'withdrawn':
      return { tone: 'no', text: 'Withdrew consent to call recording', detail: `${when} · ${METHOD[rc.method] ?? rc.method}` }
    case 'requested':
      return { tone: 'wait', text: 'Asked about call recording, waiting for an answer', detail: `Link created ${formatDate(rc.requested_at)}` }
    default:
      return { tone: 'none', text: 'Not asked about call recording yet', detail: 'Ask before you record a call.' }
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function AskConsentDialog({ open, candidate, onClose, onChanged }) {
  const toast = useToast()
  const { user } = useAuth()
  const [link, setLink] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    if (!open || !candidate) return
    setLink(null)
    setError('')
    api.createConsentLink(candidate.id).then(
      (l) => {
        const url = `${window.location.origin}${l.path}`
        const first = candidate.name.split(' ')[0]
        const job = (candidate.applications || []).find((a) => !['Hired', 'Rejected'].includes(a.stage))
        const me = (l.recruiter_name || user?.name || 'your recruiter').split(' ')[0]
        setLink({ ...l, url })
        setMessage(
          `Hi ${first}, this is ${me} from T3Cogno${job ? ` about the ${job.job_title} role` : ''}. I'd like to call you. ` +
            `We record calls only so our system can note details like salary, notice period and availability, and the recording is deleted once notes are taken. ` +
            `Is that OK? Please tap to choose: ${url}`,
        )
        onChanged?.()
      },
      (e) => setError(e.message),
    )
  }, [open, candidate?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function markAnswer(status) {
    setBusy(status)
    try {
      await api.recordConsent(candidate.id, status)
      toast.success(status === 'granted' ? 'Saved: they agreed to recording' : 'Saved: they said no to recording')
      onChanged?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const number = intlNumber(candidate?.phone)
  const subject = 'T3Cogno: can we record our calls with you?'

  return (
    <Modal open={open} title={`Ask ${candidate?.name?.split(' ')[0] || 'them'} about call recording`} onClose={onClose} wide>
      <div className="form">
        <p className="muted">
          Send this message. Their personal link explains how recordings are used and lets them answer yes or no. You'll see the
          answer on their profile.
        </p>
        {error && <p className="form-error">{error}</p>}
        <label className="field">
          <span>Message</span>
          <textarea rows={6} value={link ? message : 'Creating their link…'} onChange={(e) => setMessage(e.target.value)} disabled={!link} />
        </label>
        <div className="consent-send">
          {number && (
            <a
              className={`btn btn-primary ${link ? '' : 'disabled'}`}
              href={link ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!link}
            >
              Send on WhatsApp
            </a>
          )}
          {candidate?.email && (
            <a
              className={`btn ${link ? '' : 'disabled'}`}
              href={link ? `mailto:${candidate.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}` : undefined}
              aria-disabled={!link}
            >
              Send by email
            </a>
          )}
          <button
            type="button"
            className="btn"
            disabled={!link}
            onClick={async () => {
              const ok = await copyText(message)
              ok ? toast.success('Message copied') : toast.info('Select the text and copy it')
            }}
          >
            Copy message
          </button>
        </div>
        {link && <p className="muted small">The link works for 30 days. They can change their answer from it at any time.</p>}

        <div className="consent-verbal">
          <p className="strong">Already asked them on the phone?</p>
          <div className="consent-verbal-actions">
            <button type="button" className="btn btn-small" onClick={() => markAnswer('granted')} disabled={Boolean(busy)}>
              They agreed
            </button>
            <button type="button" className="btn btn-small" onClick={() => markAnswer('refused')} disabled={Boolean(busy)}>
              They said no
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function RecordingConsent({ candidate, onChanged }) {
  const [asking, setAsking] = useState(false)
  const rc = candidate.recording_consent
  const label = consentLabel(rc)
  return (
    <div className={`consent-bar tone-${label.tone}`}>
      <div className="consent-bar-text">
        <strong>{label.text}</strong>
        <span className="muted small">{label.detail}</span>
      </div>
      {rc?.status !== 'granted' && (
        <button type="button" className="btn btn-small" onClick={() => setAsking(true)}>
          {rc?.status === 'requested' ? 'Ask again' : 'Ask to record calls'}
        </button>
      )}
      <AskConsentDialog open={asking} candidate={candidate} onClose={() => setAsking(false)} onChanged={onChanged} />
    </div>
  )
}
