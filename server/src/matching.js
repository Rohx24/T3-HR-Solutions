// match_score = % of the job's required skills the candidate has (case-insensitive).
export function scoreMatch(candidateSkills, requiredSkills) {
  const have = new Set(candidateSkills.map((s) => s.toLowerCase()));
  const matched_skills = requiredSkills.filter((s) => have.has(s.toLowerCase()));
  const missing_skills = requiredSkills.filter((s) => !have.has(s.toLowerCase()));
  const match_score = requiredSkills.length ? Math.round((100 * matched_skills.length) / requiredSkills.length) : 0;
  return { match_score, matched_skills, missing_skills };
}
