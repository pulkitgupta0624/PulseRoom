import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import SectionHeader from '../components/SectionHeader';
import FilterBar from '../components/FilterBar';
import EventCard from '../components/EventCard';
import { fetchEvents, fetchRecommendations } from '../features/events/eventsSlice';

const HomePage = () => {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { list, recommendations, loading, searchFacets, searchMeta } = useSelector((state) => state.events);
  const [filters, setFilters] = useState({
    q: '',
    type: '',
    category: '',
    city: '',
    startsAfter: '',
    startsBefore: '',
    minPrice: '',
    maxPrice: ''
  });

  useEffect(() => {
    if (user) dispatch(fetchRecommendations());
  }, [dispatch, user]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const params = {};
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '') {
          params[key] = value;
        }
      });
      dispatch(fetchEvents(params));
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [dispatch, filters]);

  const handleChange = (key, value) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const handleSearch = (e) => {
    e.preventDefault();
    dispatch(fetchEvents(Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))));
  };

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="overflow-hidden rounded-[36px] border border-ink/10 bg-white/75 shadow-bloom">
        <div className="grid gap-10 bg-gradient-to-br from-dusk via-ink to-reef px-6 py-10 text-sand md:grid-cols-[1.3fr,0.7fr] md:px-10 md:py-12">
          <div className="space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sand/65">
              PulseRoom Platform
            </p>
            <div className="space-y-4">
              <h1 className="max-w-3xl font-display text-4xl leading-tight md:text-6xl">
                Launch, run, and scale live event experiences with production-grade control.
              </h1>
              <p className="max-w-2xl text-base text-sand/78 md:text-lg">
                Browse public events, book tickets, jump into live sessions, and manage everything
                from an organizer command center designed for real operations.
              </p>
            </div>
          </div>

          <div className="grid gap-4 rounded-[28px] border border-sand/10 bg-white/8 p-5 backdrop-blur md:grid-cols-2">
            {[
              ['Realtime chat', 'Socket-driven event rooms and private messaging'],
              ['Flexible ticketing', 'Free, paid, and VIP tiers with booking control'],
              ['Live interaction', 'Polls, Q&A, reactions, and announcements'],
              ['Admin oversight', 'Analytics, reports, revenue, and moderation']
            ].map(([title, desc]) => (
              <div key={title} className="rounded-2xl border border-sand/10 bg-sand/5 p-4">
                <p className="font-display text-xl">{title}</p>
                <p className="mt-2 text-sm text-sand/72">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FilterBar
        filters={filters}
        onChange={handleChange}
        onSubmit={handleSearch}
        facets={searchFacets}
        loading={loading}
      />

      {/* Recommendations */}
      {user && recommendations.length > 0 && (
        <section className="space-y-6">
          <SectionHeader
            eyebrow="Recommended"
            title="Suggested for your event graph"
            description="Scored from your profile interests and platform activity."
          />
          <div className="grid gap-5 lg:grid-cols-3">
            {recommendations.map((event) => (
              <EventCard key={event._id} event={event} compact />
            ))}
          </div>
        </section>
      )}

      {/* All events */}
      <section className="space-y-6">
        <SectionHeader
          eyebrow="Discover"
          title="Upcoming events"
          description="Search across public conferences, virtual experiences, and hybrid productions."
        />

        {searchMeta?.found >= 0 && (
          <p className="text-sm text-ink/55">
            {searchMeta.found} result{searchMeta.found === 1 ? '' : 's'} across live filters
          </p>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 rounded-full border-2 border-reef border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && list.length === 0 && (
          <div className="rounded-[28px] border border-ink/10 bg-white/70 px-6 py-14 text-center shadow-bloom">
            <p className="font-display text-2xl text-ink">No events found</p>
            <p className="mt-3 text-sm text-ink/55">
              Try adjusting your search filters or check back soon.
            </p>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-3">
          {list.map((event) => (
            <EventCard key={event._id} event={event} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default HomePage;
