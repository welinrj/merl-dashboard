// Ported from the Efferd registry block "@efferd/logo-cloud-2" (efferd.com):
// "Stylish logo grid featuring top tech brands with decorative plus icons and
// dynamic borders." Adapted from the shadcn/ui original for this project:
// tech-brand wordmarks replaced with the programme's stakeholder identities,
// bg-secondary/background mapped to the portal's gray scale, and laid out as
// a 2x2 checkerboard sized for the sign-in column.
import DecorIcon from './DecorIcon';

const CREST = `${import.meta.env.BASE_URL}vanuatu-coat-of-arms.svg`;
const DOCC  = `${import.meta.env.BASE_URL}docc-logo.png`;
const MFAT  = `${import.meta.env.BASE_URL}mfat-logo.png`;

function LogoCard({ className = '', children }) {
  return (
    <div className={`relative flex items-center justify-center bg-white px-4 py-6 min-h-[92px] ${className}`}>
      {children}
    </div>
  );
}

export default function LogoCloud() {
  return (
    <div className="grid grid-cols-2 border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Government of Vanuatu — national emblem */}
      <LogoCard className="border-r border-b border-gray-200 bg-gray-50">
        <div className="flex flex-col items-center gap-1.5">
          <img src={CREST} alt="Government of Vanuatu" className="h-10 w-auto pointer-events-none select-none" />
          <span className="text-[10px] font-semibold tracking-wide text-gray-500 uppercase">Government of Vanuatu</span>
        </div>
        <DecorIcon className="z-10" position="bottom-right" />
      </LogoCard>

      {/* Department of Climate Change */}
      <LogoCard className="border-b border-gray-200">
        <img src={DOCC} alt="Department of Climate Change — Government of Vanuatu"
          className="max-h-9 max-w-[85%] object-contain pointer-events-none select-none" />
      </LogoCard>

      {/* Ministry of Climate Change — official name lockup (no published logo) */}
      <LogoCard className="border-r border-gray-200">
        <div className="text-center leading-tight">
          <div className="text-xs font-bold tracking-wide text-gray-600 uppercase">Ministry of<br />Climate Change</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Republic of Vanuatu</div>
        </div>
      </LogoCard>

      {/* New Zealand MFAT — funder */}
      <LogoCard className="bg-gray-50">
        <img src={MFAT} alt="New Zealand Ministry of Foreign Affairs and Trade — Manatū Aorere"
          className="max-h-10 max-w-[85%] object-contain pointer-events-none select-none" />
      </LogoCard>
    </div>
  );
}
