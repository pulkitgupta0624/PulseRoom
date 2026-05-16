import { Link } from 'react-router-dom';
import { buildOrganizerBrandTheme, normalizeOrganizerBranding } from '../lib/organizerBranding';

const OrganizerBrandingFields = ({ value, onChange, userId = '' }) => {
  const branding = normalizeOrganizerBranding(value);
  const brandTheme = buildOrganizerBrandTheme(branding);
  const publicPath = branding.publicHandle ? `/studio/${branding.publicHandle}` : `/organizers/${userId || 'your-id'}`;

  const updateBranding = (key, nextValue) => {
    onChange({
      ...branding,
      [key]: nextValue
    });
  };

  return (
    <div className="space-y-4 rounded-[28px] border border-ink/10 bg-sand/45 p-4">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Brand studio</p>
        <p className="mt-1 text-sm text-ink/60">
          Shape your public organizer hub, custom share URL, and the visual language attendees see before they ever book.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            to={publicPath}
            className="inline-flex rounded-full border border-ink/12 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-sand"
          >
            Open organizer profile
          </Link>
          <p className="text-xs text-ink/45">
            Save your profile first if you just changed the handle above.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.18em] text-ink/45">Public handle</span>
          <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-ink/35">pulse.room</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-ink/45">/studio/</span>
              <input
                value={branding.publicHandle}
                onChange={(event) => updateBranding('publicHandle', event.target.value)}
                placeholder="your-brand"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
                spellCheck="false"
              />
            </div>
          </div>
        </label>

        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.18em] text-ink/45">Hero headline</span>
          <input
            value={branding.heroTitle}
            onChange={(event) => updateBranding('heroTitle', event.target.value)}
            placeholder="Run launches, salons, or summit seasons under one brand."
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-reef"
          />
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="text-xs uppercase tracking-[0.18em] text-ink/45">Hero subtitle</span>
          <textarea
            value={branding.heroSubtitle}
            onChange={(event) => updateBranding('heroSubtitle', event.target.value)}
            placeholder="Tell attendees what makes your event universe distinct before they ever open a booking flow."
            rows={3}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-reef"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.18em] text-ink/45">Logo URL</span>
          <input
            value={branding.logoUrl}
            onChange={(event) => updateBranding('logoUrl', event.target.value)}
            placeholder="https://cdn.example.com/logo.png"
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-reef"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.18em] text-ink/45">Cover image URL</span>
          <input
            value={branding.coverImageUrl}
            onChange={(event) => updateBranding('coverImageUrl', event.target.value)}
            placeholder="https://cdn.example.com/cover.jpg"
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-reef"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.18em] text-ink/45">Primary color</span>
          <div className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-3 py-2">
            <input
              type="color"
              value={branding.primaryColor}
              onChange={(event) => updateBranding('primaryColor', event.target.value)}
              className="h-9 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0"
            />
            <input
              value={branding.primaryColor}
              onChange={(event) => updateBranding('primaryColor', event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm uppercase text-ink outline-none"
              spellCheck="false"
            />
          </div>
        </label>

        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.18em] text-ink/45">Accent color</span>
          <div className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-3 py-2">
            <input
              type="color"
              value={branding.accentColor}
              onChange={(event) => updateBranding('accentColor', event.target.value)}
              className="h-9 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0"
            />
            <input
              value={branding.accentColor}
              onChange={(event) => updateBranding('accentColor', event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm uppercase text-ink outline-none"
              spellCheck="false"
            />
          </div>
        </label>

        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.18em] text-ink/45">Font pairing</span>
          <select
            value={branding.fontPairing}
            onChange={(event) => updateBranding('fontPairing', event.target.value)}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-reef"
          >
            <option value="modern">Modern Sans</option>
            <option value="editorial">Editorial Serif</option>
            <option value="contrast">Contrast Serif</option>
            <option value="crisp">Crisp Sans</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.18em] text-ink/45">CTA label</span>
          <input
            value={branding.ctaLabel}
            onChange={(event) => updateBranding('ctaLabel', event.target.value)}
            placeholder="Book a private brief"
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-reef"
          />
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="text-xs uppercase tracking-[0.18em] text-ink/45">CTA destination URL</span>
          <input
            value={branding.ctaUrl}
            onChange={(event) => updateBranding('ctaUrl', event.target.value)}
            placeholder="https://your-brand.com/contact"
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-reef"
          />
        </label>
      </div>

      <div
        className="overflow-hidden rounded-[28px] border border-ink/10"
        style={{
          ...brandTheme.styles,
          background: brandTheme.heroBackground
        }}
      >
        {branding.coverImageUrl ? (
          <div
            className="border-b border-white/12 bg-cover bg-center px-5 py-16"
            style={{
              backgroundImage: `linear-gradient(135deg, rgba(18,18,18,0.38), rgba(18,18,18,0.18)), url(${branding.coverImageUrl})`
            }}
          />
        ) : null}
        <div className="space-y-4 px-5 py-6 text-[color:var(--organizer-hero-text)]">
          <div className="flex flex-wrap items-center gap-3">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt="Organizer logo preview"
                className="h-12 w-12 rounded-2xl border border-white/20 bg-white/10 object-cover p-1"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
            ) : null}
            <Link
              to={publicPath}
              className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em] transition hover:bg-white/16"
            >
              {publicPath}
            </Link>
          </div>
          <div className="space-y-2">
            <h3
              className="text-3xl leading-tight"
              style={{ fontFamily: 'var(--organizer-heading-font)' }}
            >
              {branding.heroTitle || 'Your public organizer hub'}
            </h3>
            <p
              className="max-w-2xl text-sm md:text-base"
              style={{ fontFamily: 'var(--organizer-body-font)' }}
            >
              {branding.heroSubtitle || 'This preview shows the visual language attendees will recognize across your organizer-facing surfaces.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-semibold">
              {branding.ctaLabel || 'Primary CTA'}
            </span>
            <span className="rounded-full border border-white/16 bg-white/8 px-3 py-1 text-xs">
              {brandTheme.fonts.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrganizerBrandingFields;
