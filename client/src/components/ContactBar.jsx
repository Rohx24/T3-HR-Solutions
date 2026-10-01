import { formatDate, intlNumber } from '../utils.js'

// The candidate's call preference (chosen on the apply page) with one-tap ways to reach them.
// The preferred way is the primary button. WhatsApp links open the chat; tap the call icon there.
export default function ContactBar({ candidate }) {
  const number = intlNumber(candidate.phone)
  const pref = candidate.contact?.preference
  if (!number && !pref) return null

  const whatsappBtn = number && (
    <a
      key="wa"
      className={`btn btn-small ${pref === 'whatsapp' ? 'btn-primary' : ''}`}
      href={`https://wa.me/${number}`}
      target="_blank"
      rel="noreferrer"
      title="Opens the WhatsApp chat. Tap the call icon there to call."
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 20 11.5Z" />
      </svg>
      WhatsApp
    </a>
  )
  const phoneBtn = number && (
    <a key="tel" className={`btn btn-small ${pref === 'phone' ? 'btn-primary' : ''}`} href={`tel:+${number}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
      </svg>
      Call
    </a>
  )

  return (
    <div className={`contact-bar ${pref ? `pref-${pref}` : ''}`}>
      <div className="contact-pref">
        {pref ? (
          <>
            <span>
              Prefers a <strong>{pref === 'whatsapp' ? 'WhatsApp call' : 'normal phone call'}</strong>
            </span>
            <span className="muted small">
              Chosen on the apply page{candidate.contact.consent_at ? ` · agreed to be contacted ${formatDate(candidate.contact.consent_at)}` : ''}
              {candidate.contact.whatsapp_permission === 'requested' && ' · WhatsApp call permission requested'}
            </span>
          </>
        ) : (
          <span className="muted small">No call preference yet. Reach them however suits you.</span>
        )}
      </div>
      <div className="contact-actions">{pref === 'phone' ? [phoneBtn, whatsappBtn] : [whatsappBtn, phoneBtn]}</div>
    </div>
  )
}
