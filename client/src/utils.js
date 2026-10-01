export const STAGES = ['Applied', 'Screening', 'Technical', 'HR Round', 'Offer', 'Hired', 'Rejected']

// Built-in stages have their own colour; a job's custom round names share the "round" colour.
const STAGE_SLUGS = {
  Applied: 'applied', Screening: 'screening', Technical: 'technical', 'HR Round': 'hr-round',
  Offer: 'offer', Hired: 'hired', Rejected: 'rejected', Interviewing: 'interviewing',
}
export const stageSlug = (stage = '') => STAGE_SLUGS[stage] || 'round'

export function timeAgo(iso) {
  if (!iso) return '-'
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000
  if (seconds < 60) return 'just now'
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of units) {
    const n = Math.floor(seconds / size)
    if (n >= 1) return `${n} ${unit}${n > 1 ? 's' : ''} ago`
  }
  return 'just now'
}

export function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatYears(n) {
  if (n == null || n === '') return '-'
  return `${n} yr${Number(n) === 1 ? '' : 's'}`
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function parseSkills(text) {
  const seen = new Set()
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
}

export function formatBytes(n = 0) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
