import { SkillChips } from './ui.jsx'

// Shows the extra job details (from the client's job description) in plain words.

export function experienceText(d) {
  if (!d) return null
  const { experience_min: min, experience_max: max } = d
  if (min != null && max != null) return `${min} to ${max} years`
  if (min != null) return `${min}+ years`
  if (max != null) return `Up to ${max} years`
  return null
}

export function jobSummaryLine(job) {
  const d = job.details || {}
  return [d.location, d.work_mode, experienceText(d), d.salary].filter(Boolean).join(' · ')
}

export default function JobDetails({ job }) {
  const d = job.details || {}
  const facts = [
    ['Location', d.location],
    ['Work mode', d.work_mode],
    ['Job type', d.employment_type],
    ['Experience', experienceText(d)],
    ['Salary / budget', d.salary],
    ['Openings', d.openings],
    ['Notice period', d.notice_period],
    ['Education', d.education],
    ['Industry', d.industry],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '')

  if (!facts.length && !d.nice_to_have_skills?.length && !d.responsibilities?.length && !job.jd_text) return null

  return (
    <div className="job-details">
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
      {d.nice_to_have_skills?.length > 0 && (
        <div>
          <p className="label">Good to have</p>
          <SkillChips skills={d.nice_to_have_skills} />
        </div>
      )}
      {d.responsibilities?.length > 0 && (
        <div>
          <p className="label">Responsibilities</p>
          <ul className="exp-points">
            {d.responsibilities.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {job.jd_text && (
        <details className="call-transcript">
          <summary>Read the client's full job description</summary>
          <p className="pre">{job.jd_text}</p>
        </details>
      )}
    </div>
  )
}
