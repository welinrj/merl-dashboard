// Sources and the exact programme/project scope are recorded beside the assets.
const local = (name: string) => `${import.meta.env.BASE_URL}project-logos/${name}.jpeg`;
const logos: Record<string, string> = {
  '23A398': local('vcap2'),
  'VCAP2': local('vcap2'),
  'VCCRP-001': local('vccrp'),
  'VCCRP': local('vccrp'),
  '23A198': local('icat'),
  'ICAT-VU-II': local('icat'),
  'CBIT-VU': local('cbit'),
  '23D898': local('strength'),
  'DOCC-SRC-PEBACC+': local('pebacc'),
  'DOCC-WEB-FCPF': `${import.meta.env.BASE_URL}project-images/fcpf.webp`,
  'FRLD-VU': 'https://www.frld.org/themes/custom/frld/images/logo.png',
};
export function projectLogoSource(project: { code?: string; acronym?: string }) {
  return logos[String(project.code || '').trim().toUpperCase()]
    || logos[String(project.acronym || '').trim().toUpperCase()] || '';
}
export function projectInitials(project: { acronym?: string; name?: string; code?: string }) {
  if (project.acronym) return project.acronym;
  const shortName = project.name?.match(/\(([^)]+)\)/)?.[1];
  if (shortName && shortName.length <= 12) return shortName;
  const words = String(project.name || '').split(/[^\p{L}\p{N}]+/u)
    .filter(word => word && !/^(and|the|of|to|for|in|with|through|a|an)$/i.test(word));
  return words.slice(0,5).map(word => word[0]).join('').toUpperCase() || project.code || 'Project';
}
