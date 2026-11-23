// Presentation only: keep the results engine's percentage, never divide
// actual by target here (baseline, direction and qualitative methods differ).
export const resultNumber = value => value != null && typeof value !== 'boolean'
  && String(value).trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

export function resultComparison({ actual, target, achievement, reviewStatus } = {}) {
  const achieved = resultNumber(actual), planned = resultNumber(target);
  const percentage = resultNumber(achievement);
  const reported = achieved !== null;
  const approved = ['approved', 'published', 'locked'].includes(reviewStatus);
  const comparable = reported && planned !== null && percentage !== null;
  return {
    achieved, planned, reported, approved,
    // Unknown is visually empty, rather than implying zero achievement.
    percentage: comparable ? percentage : null,
    width: comparable ? Math.min(100, Math.max(0, percentage)) : null,
    tone: !reported ? 'unreported' : !approved ? 'pending' : comparable && percentage >= 100 ? 'completed' : 'reported',
  };
}
