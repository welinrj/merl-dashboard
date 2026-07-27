// Dashboard hero — a full-bleed image banner (the DoCC emblem set into a mossy
// stone wall) with the framework title set over the dark right-hand side. It is
// purely a brand banner; the headline figures live once, in the Dashboard's
// stat strip below, so nothing is repeated here.
const HERO_IMG = `${import.meta.env.BASE_URL}IMG_0912.png`;

export default function DashboardHero() {
  return (
    <div className="dash-hero animate-fade-up">
      <div className="dash-hero-bg" style={{ backgroundImage: `url(${HERO_IMG})` }} aria-hidden="true" />

      {/* copy — brand only; the figures live once in the stat strip below */}
      <div className="dash-hero-copy">
        <div className="dash-hero-eyebrow">DoCC · Vanuatu · 2025–2030</div>
        <h1 className="dash-hero-title">
          Growing a <b>climate&#8209;resilient</b> Vanuatu
        </h1>
        <p className="dash-hero-sub">
          Monitoring, evaluation and learning for Vanuatu&rsquo;s Loss &amp; Damage
          investments — planning, delivery and results in one place.
        </p>
      </div>
    </div>
  );
}
