// Renders the call-recording notice from the server (/api/public/privacy or a consent link), so every page
// shows the same wording as the version stored with each consent.
export default function NoticeSections({ notice }) {
  if (!notice) return null
  return (
    <dl className="notice">
      {notice.sections.map((s) => (
        <div className="notice-row" key={s.title}>
          <dt>{s.title}</dt>
          <dd>{s.text}</dd>
        </div>
      ))}
    </dl>
  )
}
