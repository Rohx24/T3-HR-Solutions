import { useRef } from 'react'
import { useToast } from './Toast.jsx'

// Public apply link for a job, with source-tagged copies so applicants' source is filled in automatically.
const SOURCES = ['Naukri', 'LinkedIn', 'WhatsApp']

// navigator.clipboard only works on https/localhost; fall back to a hidden textarea on plain http.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export default function ShareApplyLink({ job }) {
  const toast = useToast()
  const inputRef = useRef(null)
  if (!job.apply_token) return null
  const url = `${window.location.origin}/apply/${job.apply_token}`
  const withSrc = (src) => `${url}?src=${encodeURIComponent(src)}`

  async function copy(text, what) {
    if (await copyText(text)) toast.success('Link copied', { message: what })
    else {
      inputRef.current?.select()
      toast.info('Press Ctrl+C / ⌘C to copy', { message: 'Your browser blocked automatic copying.' })
    }
  }

  const waShare = `https://wa.me/?text=${encodeURIComponent(`We're hiring: ${job.title}. Apply in a minute here: ${withSrc('WhatsApp')}`)}`

  return (
    <div className="share-apply">
      <p className="label">Apply link for candidates</p>
      <div className="share-row">
        <input ref={inputRef} readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Apply link" />
        <button type="button" className="btn btn-primary" onClick={() => copy(url, 'Paste it anywhere you advertise this job.')}>
          Copy link
        </button>
        <a className="btn" href={url} target="_blank" rel="noreferrer">
          Open
        </a>
      </div>
      <div className="share-sources">
        <span className="muted small">Copy a tagged link so you know where applicants came from:</span>
        {SOURCES.map((s) => (
          <button type="button" key={s} className="chip chip-button" onClick={() => copy(withSrc(s), `Applicants from this link are marked "${s}".`)}>
            {s}
          </button>
        ))}
        <a className="chip chip-button" href={waShare} target="_blank" rel="noreferrer">
          Share on WhatsApp ↗
        </a>
      </div>
      {job.status === 'closed' && <p className="muted small">This job is closed, so the link tells candidates it is no longer accepting applications.</p>}
    </div>
  )
}
