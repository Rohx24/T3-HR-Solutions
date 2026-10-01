import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api.js'

// "Guide me": a guided walkthrough of the hiring workflow. Each step points at an element marked with
// data-tour="...", navigating to the right page first. Steps whose element is missing (e.g. an empty
// workspace has no jobs yet) are shown as a centred card instead of being skipped silently.

const firstJobRoute = async () => {
  const jobs = await api.jobs().catch(() => [])
  const job = jobs.find((j) => j.status === 'open') || jobs[0]
  return job ? `/jobs/${job.id}` : '/jobs'
}
const firstCandidateRoute = async () => {
  const list = await api.candidates().catch(() => [])
  return list[0] ? `/candidates/${list[0].id}` : '/candidates'
}

export const TOUR_STEPS = [
  {
    route: '/',
    target: 'nav',
    title: 'Your workspace',
    body: 'Everything here belongs to your account only. Use these three sections: Home for a summary, Candidates for the people you add, and Jobs for your openings.',
  },
  {
    route: '/',
    target: 'stats',
    title: 'Your numbers at a glance',
    body: 'How many candidates you have, who came back to apply again, open jobs, and applications still in progress. They update as you work.',
  },
  {
    route: '/',
    target: 'funnel',
    title: 'Where candidates are stuck',
    body: 'The funnel shows how many applications sit in each interview stage, from Applied through to Hired or Rejected.',
  },
  {
    route: '/candidates',
    target: 'upload',
    title: 'Step 1: add a resume',
    body: 'Click "Upload a resume" and choose a PDF, Word or text file. The details are read from the resume and filled in for you. If the same email applies again, the existing profile is updated instead of duplicated.',
  },
  {
    route: '/candidates',
    target: 'filters',
    title: 'Find anyone in seconds',
    body: 'Search by name, skill or anything in the resume, or filter by role and skill. Export CSV downloads exactly what you are looking at.',
  },
  {
    route: '/candidates',
    target: 'pool',
    title: 'Open a profile',
    body: 'Click any row to see the full profile. A "Returning" badge means the person has applied before.',
  },
  {
    route: firstCandidateRoute,
    target: 'applications',
    title: 'Put them in a pipeline',
    body: 'See every job this person is in and change their stage. Use "Add to job" to put them forward for another role or client.',
  },
  {
    route: firstCandidateRoute,
    target: 'note-form',
    title: 'Step 2: write feedback after every interview',
    body: 'After each interview, pick the round, give a 1 to 5 rating and write what you saw. Your name is added automatically and it all appears in the history on the right.',
  },
  {
    route: '/jobs',
    target: 'new-job',
    title: 'Step 3: open a job',
    body: 'Create a job for a client company with the skills it needs. You can add a new company right inside the form.',
  },
  {
    route: firstJobRoute,
    target: 'kanban',
    title: 'Move candidates through stages',
    body: 'Each column is an interview stage. Drag a card to another column, or use the dropdown on the card. Every move is logged on the candidate’s history.',
  },
  {
    route: firstJobRoute,
    target: 'suggestions',
    title: 'Step 4: reuse people you already have',
    body: 'People you already have are ranked by how well their skills match this job, with matched and missing skills shown. Add the best fits with one click instead of sourcing from scratch.',
  },
  {
    route: null,
    target: 'guide',
    title: 'That’s the whole workflow',
    body: 'Upload, interview, comment, reuse. You can replay this tour any time from the Guide me button.',
  },
]

const TourContext = createContext(null)
const PAD = 8

export function TourProvider({ children }) {
  const [index, setIndex] = useState(-1)
  const active = index >= 0
  const start = useCallback(() => setIndex(0), [])
  const stop = useCallback(() => setIndex(-1), [])
  const value = useMemo(() => ({ active, start, stop }), [active, start, stop])
  return (
    <TourContext.Provider value={value}>
      {children}
      {active && <TourOverlay index={index} setIndex={setIndex} onClose={stop} />}
    </TourContext.Provider>
  )
}

export function useTour() {
  return useContext(TourContext)
}

function TourOverlay({ index, setIndex, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const step = TOUR_STEPS[index]
  const [rect, setRect] = useState(null)
  const [ready, setReady] = useState(false)
  const last = index === TOUR_STEPS.length - 1

  // 1. Go to the step's page.
  useEffect(() => {
    let cancelled = false
    setReady(false)
    setRect(null)
    ;(async () => {
      const route = typeof step.route === 'function' ? await step.route() : step.route
      if (cancelled) return
      if (route && route !== location.pathname) navigate(route)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [index]) // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Wait for the target to render, scroll it into view, then track its position.
  useLayoutEffect(() => {
    if (!ready) return
    let raf
    let tries = 0
    let el = null
    // Pages load their data after navigating, so keep looking for the target (up to ~3s) and scroll it
    // into view the moment it first appears; then follow it every frame while the page settles.
    const measure = () => {
      if (!el || !document.body.contains(el)) {
        el = document.querySelector(`[data-tour="${step.target}"]`)
        if (el) bringIntoView(el)
      }
      if (el) {
        const r = el.getBoundingClientRect()
        setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
      } else if (tries++ > 180) {
        setRect('missing')
        return
      }
      raf = requestAnimationFrame(measure)
    }
    raf = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf)
  }, [ready, index, location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, TOUR_STEPS.length - 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, setIndex])

  const box = rect && rect !== 'missing' ? rect : null
  const card = cardPosition(box)

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={`Guide: ${step.title}`}>
      {box ? (
        <div className="tour-spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className={`tour-card ${box ? '' : 'centered'}`} style={card} key={index}>
        <div className="tour-meta">
          <span className="mono">
            {String(index + 1).padStart(2, '0')} / {String(TOUR_STEPS.length).padStart(2, '0')}
          </span>
          <button className="tour-skip" onClick={onClose}>
            {last ? 'Close' : 'Skip tour'}
          </button>
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        {rect === 'missing' && step.target !== 'guide' && (
          <p className="tour-note">Nothing to point at here yet. Add some data and replay the tour.</p>
        )}
        <div className="tour-progress" aria-hidden="true">
          {TOUR_STEPS.map((_, i) => (
            <i key={i} className={i <= index ? 'on' : ''} />
          ))}
        </div>
        <div className="tour-actions">
          <button className="btn btn-ghost" onClick={() => setIndex(index - 1)} disabled={index === 0}>
            Back
          </button>
          <button className="btn btn-primary" onClick={() => (last ? onClose() : setIndex(index + 1))}>
            {last ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Scroll page content so its top sits just under the sticky top bar, leaving room for the card below.
// Elements in the sidebar/top bar are always visible, so they are left alone.
function bringIntoView(el) {
  if (el.closest('.sidebar, .topbar')) return
  const top = window.scrollY + el.getBoundingClientRect().top - 96
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

// Place the card below the highlight, else above, else beside it, else docked bottom-right.
function cardPosition(box) {
  if (!box) return {}
  const vw = window.innerWidth
  const vh = window.innerHeight
  const W = Math.min(360, vw - 32)
  const H = 260
  const GAP = 14
  const x = (left) => Math.max(16, Math.min(vw - W - 16, left))
  const y = (top) => Math.max(16, Math.min(vh - H - 16, top))
  if (box.top + box.height + GAP + H <= vh - 16) return { top: box.top + box.height + GAP, left: x(box.left), width: W }
  if (box.top - GAP - H >= 16) return { top: box.top - GAP - H, left: x(box.left), width: W }
  if (box.left + box.width + GAP + W <= vw - 16) return { top: y(box.top), left: box.left + box.width + GAP, width: W }
  if (box.left - GAP - W >= 16) return { top: y(box.top), left: box.left - GAP - W, width: W }
  return { top: vh - H - 16, left: vw - W - 16, width: W }
}
