import { EVENT_FONT_PAIRINGS, normalizeEventTheme } from '../lib/eventTheme';

const EventThemeFields = ({ value, onChange }) => {
  const theme = normalizeEventTheme(value);
  const selectedPairing =
    EVENT_FONT_PAIRINGS.find((pairing) => pairing.id === theme.fontPairing) || EVENT_FONT_PAIRINGS[0];

  const updateTheme = (key, nextValue) => {
    onChange({
      ...theme,
      [key]: nextValue
    });
  };

  return (
    <div className="space-y-4 rounded-[24px] border border-ink/10 bg-sand/45 p-4">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Event page style</p>
        <p className="mt-1 text-sm text-ink/60">
          Pick the banner colors and font pairing that attendees will see on the public event page.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.18em] text-ink/45">Primary color</span>
          <div className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-3 py-2">
            <input
              type="color"
              value={theme.primaryColor}
              onChange={(event) => updateTheme('primaryColor', event.target.value)}
              className="h-9 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0"
            />
            <input
              value={theme.primaryColor}
              onChange={(event) => updateTheme('primaryColor', event.target.value)}
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
              value={theme.accentColor}
              onChange={(event) => updateTheme('accentColor', event.target.value)}
              className="h-9 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0"
            />
            <input
              value={theme.accentColor}
              onChange={(event) => updateTheme('accentColor', event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm uppercase text-ink outline-none"
              spellCheck="false"
            />
          </div>
        </label>

        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.18em] text-ink/45">Font pairing</span>
          <select
            value={theme.fontPairing}
            onChange={(event) => updateTheme('fontPairing', event.target.value)}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-reef"
          >
            {EVENT_FONT_PAIRINGS.map((pairing) => (
              <option key={pairing.id} value={pairing.id}>
                {pairing.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className="overflow-hidden rounded-[28px] border border-ink/10 bg-white"
        style={{
          background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.accentColor})`
        }}
      >
        <div className="bg-white/88 p-5 backdrop-blur-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Preview</p>
          <div className="mt-3 space-y-2">
            <h3
              className="text-2xl text-ink"
              style={{ fontFamily: selectedPairing.headingFont }}
            >
              Event page headline
            </h3>
            <p
              className="text-sm text-ink/70"
              style={{ fontFamily: selectedPairing.bodyFont }}
            >
              The banner, buttons, highlights, and supporting copy will inherit this event style.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                style={{ backgroundColor: theme.primaryColor }}
              >
                Primary
              </span>
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                style={{ backgroundColor: theme.accentColor }}
              >
                Accent
              </span>
              <span className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs text-ink/60">
                {selectedPairing.label}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventThemeFields;
