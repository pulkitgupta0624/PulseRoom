const FilterBar = ({ filters, onChange, onSubmit, facets = {}, loading = false }) => {
  const categories = facets.categories || [];
  const cities = facets.city || [];

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-[28px] border border-ink/10 bg-white/70 p-4 shadow-bloom"
    >
      <div className="grid gap-3 md:grid-cols-[2fr,1fr,1fr,1fr]">
        <input
          value={filters.q}
          onChange={(event) => onChange('q', event.target.value)}
          placeholder="Search with typo-tolerant discovery"
          className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none transition focus:border-reef"
        />

        <select
          value={filters.type}
          onChange={(event) => onChange('type', event.target.value)}
          className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
        >
          <option value="">All formats</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="hybrid">Hybrid</option>
        </select>

        <select
          value={filters.category}
          onChange={(event) => onChange('category', event.target.value)}
          className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.value} value={category.value}>
              {category.value} ({category.count})
            </option>
          ))}
        </select>

        <select
          value={filters.city}
          onChange={(event) => onChange('city', event.target.value)}
          className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
        >
          <option value="">All cities</option>
          {cities.map((city) => (
            <option key={city.value} value={city.value}>
              {city.value} ({city.count})
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr,1fr,1fr,1fr,auto]">
        <input
          type="date"
          value={filters.startsAfter || ''}
          onChange={(event) => onChange('startsAfter', event.target.value)}
          className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-reef"
        />

        <input
          type="date"
          value={filters.startsBefore || ''}
          onChange={(event) => onChange('startsBefore', event.target.value)}
          className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-reef"
        />

        <input
          type="number"
          min="0"
          value={filters.minPrice}
          onChange={(event) => onChange('minPrice', event.target.value)}
          placeholder="Min price"
          className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-reef"
        />

        <input
          type="number"
          min="0"
          value={filters.maxPrice}
          onChange={(event) => onChange('maxPrice', event.target.value)}
          placeholder="Max price"
          className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-reef"
        />

        <button
          type="submit"
          className="rounded-2xl bg-ink px-5 py-3 font-semibold text-sand transition hover:bg-dusk"
        >
          {loading ? 'Searching...' : 'Refresh'}
        </button>
      </div>
    </form>
  );
};

export default FilterBar;
