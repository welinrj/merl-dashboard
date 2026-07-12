import { InfiniteSlider } from "@/components/ui/infinite-slider";

// Programme stakeholders for the DoCC MERL Dashboard. Assets are self-hosted
// in /public (resolved through BASE_URL so they work under the GitHub Pages
// base path) rather than loaded from an external CDN. The logos are full
// colour, so the registry block's `dark:` invert treatment is dropped.
const BASE = import.meta.env.BASE_URL;

const logos = [
	{
		src: `${BASE}vanuatu-coat-of-arms.svg`,
		alt: "Government of Vanuatu",
	},
	{
		src: `${BASE}docc-logo.png`,
		alt: "Department of Climate Change — Government of Vanuatu",
	},
	{
		src: `${BASE}mfat-logo.png`,
		alt: "New Zealand Ministry of Foreign Affairs and Trade — Manatū Aorere",
	},
];

export function LogoCloud() {
	// Edge fade applied inline: Tailwind v3 doesn't emit a `mask-[…]` utility,
	// so the registry block's fade class would be a no-op here.
	const fade =
		"linear-gradient(to right, transparent, black 8%, black 92%, transparent)";
	return (
		<div
			className="overflow-hidden py-4"
			style={{ WebkitMaskImage: fade, maskImage: fade }}
		>
			<InfiniteSlider gap={56} reverse speed={80} speedOnHover={25}>
				{logos.map((logo) => (
					<img
						alt={logo.alt}
						className="pointer-events-none h-8 w-auto select-none object-contain md:h-10"
						height="auto"
						key={`logo-${logo.alt}`}
						loading="lazy"
						src={logo.src}
						width="auto"
					/>
				))}
			</InfiniteSlider>
		</div>
	);
}
