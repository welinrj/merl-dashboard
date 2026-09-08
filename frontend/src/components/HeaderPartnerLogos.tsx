import './header-partner-logos.css';

// Reuse the institutional assets already supplied with the MERL portal.
// BASE_URL keeps them working at the GitHub Pages project path.
const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`;

export default function HeaderPartnerLogos() {
  return (
    <div className="merl-partner-logos" role="group" aria-label="Institutional partners">
      <img className="merl-partner-crest" src={asset('vanuatu-coat-of-arms.svg')} alt="Coat of arms of Vanuatu" />
      <img className="merl-partner-docc" src={asset('docc-logo.png')} alt="Department of Climate Change, Vanuatu" />
      <img className="merl-partner-mfat" src={asset('mfat-logo.png')} alt="New Zealand Ministry of Foreign Affairs and Trade" />
    </div>
  );
}
