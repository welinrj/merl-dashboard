import { IslandLogo, IslandWave, islandLogo } from './IslandBrand';
export default function IslandReportCover({ title, period, project, generated, dataAsAt }) {
  return <section className="island-report-cover" aria-label="Report cover">
    <div className="island-cover-brand"><IslandLogo size={76} /><span>MERL Portal</span></div>
    <div><p>DEPARTMENT OF CLIMATE CHANGE · VANUATU</p><h2>{title}</h2><p><strong>{period}</strong></p>{project && <p>{project}</p>}<p>Generated: {generated}<br />Data as at: {dataAsAt || 'Not reported'}</p></div>
    <img className="island-cover-art" src={islandLogo} alt="" /><IslandWave />
  </section>;
}
