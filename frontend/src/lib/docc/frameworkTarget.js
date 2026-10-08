// Framework targets can be counts, scored rubrics or narrative milestones.
export function frameworkTargetValue(target, fallback = null) {
  if (target?.numeric_value != null) return target.numeric_value;
  if (target?.ordinal_value != null) return `Scale ${target.ordinal_value}`;
  if (target?.text_value != null && target.text_value !== '') return target.text_value;
  return fallback;
}
