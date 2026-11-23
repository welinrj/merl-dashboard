const known = value => value != null && value !== '' && Number.isFinite(Number(value));

// Public snapshot fields only. Plans and targets are never achievements.
export function publishedMapResult(project) {
  const kpis = [...(project.public_kpis || [])].filter(row => known(row.actual_value))
    .sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')) || String(b.period_label || '').localeCompare(String(a.period_label || '')));
  if (kpis.length) {
    const row = kpis[0];
    return { kind: 'indicator', label: row.label, value: Number(row.actual_value), unit: row.unit || '', period: row.period_label || project.last_published_period || null };
  }
  if (known(project.published_beneficiaries)) return { kind: 'beneficiaries', value: Number(project.published_beneficiaries), period: project.last_published_period || null };
  if (known(project.progress_pct)) return { kind: 'progress', value: Number(project.progress_pct), period: project.last_published_period || null };
  return null;
}
