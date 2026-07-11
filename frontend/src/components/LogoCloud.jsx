// Ported from the Efferd registry block "@efferd/logo-cloud-2" (efferd.com):
// "Stylish logo grid featuring top tech brands with decorative plus icons and
// dynamic borders." Adapted from the shadcn/ui original for this project:
// tech-brand wordmarks replaced with the programme's stakeholder identities,
// bg-secondary/background mapped to the portal grays, and laid out as a slim
// full-width strip that sits above the portal's navigation header.
import DecorIcon from './DecorIcon';

const CREST = `${import.meta.env.BASE_URL}vanuatu-coat-of-arms.svg`;
const DOCC  = `${import.meta.env.BASE_URL}docc-logo.png`;
const MFAT  = `${import.meta.env.BASE_URL}mfat-logo.png`;

function LogoCard({ className = '', children }) {
  return (
    <div className={`relative flex items-center justify-center gap-2 px-3 py-2 min-h-[52px] bg-white ${className}`}>
      {children}
    </div>
  );
}

export default function LogoCloud() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-gray-200 bg-white">
      {/* Government of Vanuatu — national emblem */}
      <LogoCard className="border-r border-gray-200 bg-gray-50 border-b sm:border-b-0">
        <img src={CREST} alt="" className="h-7 w-auto pointer-events-none select-none" />
        <span className="text-[10px] font-bold tracking-wide text-gray-500 uppercase leading-tight">
          Government<br />of Vanuatu
        </span>
        <DecorIcon className="z-10 hidden sm:block" position="bottom-right" />
      </LogoCard>

      {/* Department of Climate Change */}
      <LogoCard className="border-b sm:border-b-0 sm:border-r border-gray-200">
        <img src={DOCC} alt="Department of Climate Change — Government of Vanuatu"
          className="max-h-7 max-w-[85%] object-contain pointer-events-none select-none" />
        <DecorIcon className="z-10 hidden sm:block" position="bottom-right" />
      </LogoCard>

      {/* Ministry of Climate Change — official name lockup (no published logo) */}
      <LogoCard className="border-r border-gray-200 sm:bg-gray-50">
        <div className="text-center leading-tight">
          <div className="text-[10px] font-bold tracking-wide text-gray-500 uppercase">Ministry of Climate Change</div>
          <div className="text-[9px] text-gray-400">Republic of Vanuatu</div>
        </div>
        <DecorIcon className="z-10 hidden sm:block" position="bottom-right" />
      </LogoCard>

      {/* New Zealand MFAT — funder */}
      <LogoCard className="bg-gray-50 sm:bg-white">
        <img src={MFAT} alt="New Zealand Ministry of Foreign Affairs and Trade — Manatū Aorere"
          className="max-h-8 max-w-[85%] object-contain pointer-events-none select-none" />
      </LogoCard>
    </div>
  );
}
