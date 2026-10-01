import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useToast } from './Toast.jsx'
import { Modal } from './ui.jsx'
import ChoiceCards, { CALL_ICONS } from './ChoiceCards.jsx'
import { formatBytes, intlNumber } from '../utils.js'

// Add details from a phone call with a candidate, three ways:
//   1. Record now: the call is on speaker and this device's microphone records it live
//      (works even when the phone itself cannot record calls).
//   2. Upload a recording made by the phone (m4a, mp3, amr, 3gp, wav, ogg, webm...).
//   3. Type notes.
// The server transcribes the audio and the AI pulls out salary, notice period, availability, etc.

const TABS = [
  ['record', 'Record the call now'],
  ['upload', 'Upload a recording'],
  ['type', 'Type notes'],
]

function pickMime() {
  for (const t of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']) {
    if (window.MediaRecorder?.isTypeSupported?.(t)) return t
  }
  return ''
}

const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

const AUDIO_EXTS = ['.amr', '.3gp', '.m4a', '.mp3', '.wav', '.ogg', '.opus', '.webm', '.aac', '.flac', '.mp4', '.mpeg']
const MAX_AUDIO_BYTES = 80 * 1024 * 1024

// Drop zone for a call recording, matching the resume upload. Shows the file with a player once chosen.
function AudioPicker({ file, onPick, onError, channel, onUseRecorder }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [url, setUrl] = useState('')
  const [duration, setDuration] = useState(null)
  const [playable, setPlayable] = useState(true)

  useEffect(() => {
    setDuration(null)
    setPlayable(true)
    if (!file) return setUrl('')
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])

  function pick(f) {
    if (!f) return
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    if (!f.type.startsWith('audio/') && !AUDIO_EXTS.includes(ext)) {
      return onError('That file is not an audio recording. Choose an mp3, m4a, amr, wav or similar file.')
    }
    if (f.size > MAX_AUDIO_BYTES) return onError(`That recording is ${formatBytes(f.size)}. The limit is 80 MB (about 3 hours).`)
    onError('')
    onPick(f)
  }

  const browse = () => inputRef.current?.click()

  return (
    <div className="field">
      <span>Call recording</span>
      {channel === 'whatsapp' ? (
        <div className="channel-note warn">
          <p>
            <strong>Phones can't record WhatsApp calls.</strong> Their call recorder only saves normal calls, so record WhatsApp calls
            here while you talk.
          </p>
          <button type="button" className="btn btn-small" onClick={onUseRecorder}>
            Record the call now instead
          </button>
        </div>
      ) : (
        <p className="muted small">Use the recording your phone saved after the call (most Android phones keep it in the Phone app).</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={`audio/*,${AUDIO_EXTS.join(',')}`}
        hidden
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {file ? (
        <div className="audio-file">
          <div className="audio-file-head">
            <span className="audio-file-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </span>
            <div className="audio-file-info">
              <strong>{file.name}</strong>
              <p className="muted small">
                {formatBytes(file.size)}
                {duration != null && ` · ${clock(Math.round(duration))}`}
              </p>
            </div>
            <button type="button" className="btn btn-small" onClick={browse}>
              Change file
            </button>
          </div>
          {playable ? (
            <audio
              controls
              src={url}
              className="audio"
              onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
              onError={() => setPlayable(false)}
            />
          ) : (
            <p className="muted small">This browser can't play this format, but it will still be transcribed.</p>
          )}
        </div>
      ) : (
        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onClick={browse}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            pick(e.dataTransfer.files?.[0])
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), browse())}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
          <strong>Click to choose the call recording</strong>
          <p className="muted small">Or drag it onto this box. Phone recordings (m4a, mp3, amr, 3gp, wav…), up to 80 MB.</p>
        </div>
      )}
    </div>
  )
}

function Recorder({ onReady, onRecordingChange, channel }) {
  const [state, setState] = useState('idle') // idle | recording | paused | done
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState('')
  const [url, setUrl] = useState(null)
  const rec = useRef(null)
  const chunks = useRef([])
  const stream = useRef(null)
  const timer = useRef(null)
  const raf = useRef(null)
  const audioCtx = useRef(null)

  const stopTracks = () => {
    stream.current?.getTracks().forEach((t) => t.stop())
    cancelAnimationFrame(raf.current)
    clearInterval(timer.current)
    audioCtx.current?.close().catch(() => {})
  }
  useEffect(() => () => stopTracks(), [])
  useEffect(() => onRecordingChange?.(state === 'recording' || state === 'paused'), [state]) // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      return setError('This browser cannot record. Please use Google Chrome, or upload a recording instead.')
    }
    try {
      // Echo cancellation and noise suppression would filter out the other person's voice coming
      // from the phone's speaker, so they are turned off to capture both sides clearly.
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 },
      })
    } catch {
      return setError('Microphone permission was blocked. Click the lock icon in the address bar, allow the microphone, and try again.')
    }
    const mime = pickMime()
    const mr = new MediaRecorder(stream.current, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64000 })
    chunks.current = []
    mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    mr.onstop = () => {
      const type = mr.mimeType || mime || 'audio/webm'
      const blob = new Blob(chunks.current, { type })
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
      setUrl(URL.createObjectURL(blob))
      onReady(new File([blob], `live-call.${ext}`, { type }))
      stopTracks()
    }
    mr.start(1000)
    rec.current = mr

    // Live level meter so the recruiter can see both voices are being picked up.
    audioCtx.current = new AudioContext()
    const analyser = audioCtx.current.createAnalyser()
    analyser.fftSize = 512
    audioCtx.current.createMediaStreamSource(stream.current).connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let peak = 0
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
      setLevel(Math.min(1, peak / 60))
      raf.current = requestAnimationFrame(tick)
    }
    tick()
    setSeconds(0)
    timer.current = setInterval(() => setSeconds((s) => (rec.current?.state === 'recording' ? s + 1 : s)), 1000)
    setState('recording')
  }

  const pause = () => (rec.current.pause(), setState('paused'))
  const resume = () => (rec.current.resume(), setState('recording'))
  const stop = () => (rec.current.stop(), setState('done'))
  const redo = () => {
    setUrl(null)
    onReady(null)
    setState('idle')
  }

  return (
    <div className="recorder">
      {state === 'idle' && (
        <>
          <ol className="steps-list">
            {channel === 'whatsapp' ? (
              <li>
                Start a <strong>WhatsApp voice call</strong> from your phone (use <strong>Open WhatsApp chat</strong> above) and switch on
                the <strong>speaker</strong>.
              </li>
            ) : (
              <li>
                <strong>Call their mobile</strong> from your phone and switch on the <strong>speaker</strong>.
              </li>
            )}
            <li>Keep the phone close to this computer or tablet.</li>
            <li>Tell the candidate the call is being recorded.</li>
            <li>Press <strong>Start recording</strong>. Press <strong>Stop</strong> when the call ends.</li>
          </ol>
          <button type="button" className="btn btn-primary btn-lg rec-start" onClick={start}>
            <span className="rec-dot" aria-hidden="true" /> Start recording
          </button>
        </>
      )}
      {(state === 'recording' || state === 'paused') && (
        <div className="rec-live">
          <div className="rec-status">
            <span className={`rec-dot ${state === 'recording' ? 'pulse' : ''}`} aria-hidden="true" />
            <strong>{state === 'recording' ? 'Recording' : 'Paused'}</strong>
            <span className="rec-clock tabular">{clock(seconds)}</span>
          </div>
          <div className="rec-meter" aria-label="Sound level">
            <i style={{ transform: `scaleX(${state === 'recording' ? Math.max(0.03, level) : 0.03})` }} />
          </div>
          <p className="muted small">The bar should move when either of you speaks. If it does not move for the candidate, bring the phone closer.</p>
          <div className="form-actions start">
            {state === 'recording' ? (
              <button type="button" className="btn" onClick={pause}>
                Pause
              </button>
            ) : (
              <button type="button" className="btn" onClick={resume}>
                Resume
              </button>
            )}
            <button type="button" className="btn btn-danger" onClick={stop}>
              Stop
            </button>
          </div>
        </div>
      )}
      {state === 'done' && url && (
        <div className="rec-done">
          <p className="strong">Recording ready ({clock(seconds)}). Listen back if you like:</p>
          <audio controls src={url} className="audio" />
          <button type="button" className="btn btn-small btn-ghost" onClick={redo}>
            Discard and record again
          </button>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

export default function CallDialog({ open, candidate, onClose, onSaved }) {
  const toast = useToast()
  const [tab, setTab] = useState('record')
  const [channel, setChannel] = useState('phone')
  const [audio, setAudio] = useState(null)
  const [notes, setNotes] = useState('')
  const [appId, setAppId] = useState('')
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recorderKey, setRecorderKey] = useState(0)

  useEffect(() => {
    if (open) {
      setTab('record')
      setChannel(candidate?.contact?.preference === 'whatsapp' ? 'whatsapp' : 'phone')
      setAudio(null)
      setNotes('')
      setAppId('')
      setError('')
      setRecorderKey((k) => k + 1)
    }
  }, [open])

  function close() {
    if (recording && !window.confirm('A recording is in progress. Stop and discard it?')) return
    onClose()
  }

  function switchTab(t) {
    if (recording) return
    setTab(t)
    setAudio(null)
    setError('')
  }

  async function save(e) {
    e.preventDefault()
    if (tab !== 'type' && !audio) return setError(tab === 'record' ? 'Record the call first, then press Save.' : 'Choose the recording file first.')
    if (tab === 'type' && !notes.trim()) return setError('Type a few notes about the call first.')
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      if (audio && tab !== 'type') {
        form.append('audio', audio)
        form.append('method', tab === 'record' ? 'recorded' : 'uploaded')
      }
      form.append('channel', channel)
      if (notes.trim()) form.append('notes', notes.trim())
      if (appId) form.append('application_id', appId)
      const call = await api.logCall(candidate.id, form)
      toast.success('Call saved', {
        message: call.status === 'processing' ? 'The AI is writing it up. This usually takes under a minute.' : 'Your notes were added.',
      })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const apps = candidate?.applications || []
  const number = intlNumber(candidate?.phone)

  return (
    <Modal open={open} title={`Add call details: ${candidate?.name || ''}`} onClose={close} wide>
      <form className="form" onSubmit={save}>
        <ChoiceCards
          name="call-channel"
          label="How did you call?"
          value={channel}
          onChange={setChannel}
          options={[
            { value: 'phone', title: 'Phone call', text: 'Normal call to their mobile', icon: CALL_ICONS.phone },
            { value: 'whatsapp', title: 'WhatsApp call', text: 'Voice call in WhatsApp', icon: CALL_ICONS.whatsapp },
          ]}
          hint={
            candidate?.contact?.preference &&
            `They asked for a ${candidate.contact.preference === 'whatsapp' ? 'WhatsApp call' : 'normal phone call'} when they applied.`
          }
        />
        {number && (
          <div className="call-start">
            {channel === 'whatsapp' ? (
              <a className="btn" href={`https://wa.me/${number}`} target="_blank" rel="noreferrer">
                <span className="call-start-icon" aria-hidden="true">{CALL_ICONS.whatsapp}</span>
                Open WhatsApp chat
              </a>
            ) : (
              <a className="btn" href={`tel:+${number}`}>
                <span className="call-start-icon" aria-hidden="true">{CALL_ICONS.phone}</span>
                Call {candidate.phone}
              </a>
            )}
            <span className="muted small">
              {channel === 'whatsapp'
                ? 'Opens their chat in WhatsApp. Tap the call icon there to start a voice call.'
                : 'On a phone this starts the call. On a computer, dial the number from your mobile.'}
            </span>
          </div>
        )}
        <div className="tabs" role="tablist">
          {TABS.map(([key, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab === key}
              key={key}
              className={`tab ${tab === key ? 'active' : ''}`}
              onClick={() => switchTab(key)}
              disabled={recording && tab !== key}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'record' && <Recorder key={recorderKey} channel={channel} onReady={setAudio} onRecordingChange={setRecording} />}

        {tab === 'upload' && (
          <AudioPicker file={audio} onPick={setAudio} onError={setError} channel={channel} onUseRecorder={() => switchTab('record')} />
        )}

        <label className="field">
          <span>{tab === 'type' ? 'What did you learn on the call?' : 'Anything to add? (optional)'}</span>
          <textarea
            rows={tab === 'type' ? 6 : 3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Currently at Infosys, 6 LPA, expects 8 LPA, 30 days notice, prefers Bengaluru, free for interviews after 6 pm."
          />
        </label>

        {apps.length > 0 && (
          <label className="field">
            <span>Which job was the call about? (optional)</span>
            <select value={appId} onChange={(e) => setAppId(e.target.value)}>
              <option value="">General call</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.job_title} · {a.company_name}
                </option>
              ))}
            </select>
          </label>
        )}

        <p className="muted small">
          The AI writes out the call and fills in salary, notice period, availability and other details on this profile.
          You can always read the full transcript and listen to the recording later.
        </p>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || recording}>
            {busy ? 'Saving…' : 'Save call'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
