import { useState } from 'react';
import { projectInitials, projectLogoSource } from '../lib/projectLogos';
interface Project { code?: string; acronym?: string; name?: string }
export default function ProjectLogo({ project }: { project: Project }) {
  const source = projectLogoSource(project);
  const [failedSource, setFailedSource] = useState('');
  return <span className="pd-project-logo">
    {source && failedSource !== source
      ? <img src={source} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedSource(source)} />
      : <span className="pd-project-initials">{projectInitials(project)}</span>}
  </span>;
}
