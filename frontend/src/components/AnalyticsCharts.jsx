import dayjs from 'dayjs';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  BarChart,
  Bar
} from 'recharts';
import { formatCurrency } from '../lib/formatters';

const panelClass = 'rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom';

const MetricTile = ({ label, value, accent = 'text-ink' }) => (
  <div className="rounded-[24px] border border-ink/8 bg-white px-4 py-4">
    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">{label}</p>
    <p className={`mt-2 font-display text-3xl ${accent}`}>{value}</p>
  </div>
);

const ChartTooltip = ({ active, label, payload }) => {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3 shadow-lg">
      <p className="text-xs uppercase tracking-[0.18em] text-ink/40">{label}</p>
      <div className="mt-2 space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-ink/55">{entry.name}</span>
            <span className="font-semibold text-ink">
              {entry.name.toLowerCase().includes('revenue')
                ? formatCurrency(entry.value || 0)
                : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const EmptyState = ({ title, description }) => (
  <div className={panelClass}>
    <p className="font-display text-2xl text-ink">{title}</p>
    <p className="mt-2 text-sm text-ink/55">{description}</p>
  </div>
);

const AnalyticsCharts = ({ title, description, analytics }) => {
  if (!analytics?.series?.length) {
    return (
      <EmptyState
        title={title || 'Analytics'}
        description={description || 'Analytics will appear as soon as bookings start flowing.'}
      />
    );
  }

  const series = analytics.series.map((point) => ({
    ...point,
    label: dayjs(point.date).format('DD MMM')
  }));

  return (
    <section className="space-y-6">
      {(title || description) && (
        <div>
          {title && <h2 className="font-display text-3xl text-ink">{title}</h2>}
          {description && <p className="mt-2 max-w-3xl text-sm text-ink/60">{description}</p>}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricTile
          label="Confirmed Bookings"
          value={analytics.totals?.confirmedBookings || 0}
        />
        <MetricTile label="Attendees" value={analytics.totals?.attendees || 0} accent="text-dusk" />
        <MetricTile label="Checked In" value={analytics.totals?.checkedIns || 0} accent="text-reef" />
        <MetricTile
          label="Revenue"
          value={formatCurrency(analytics.totals?.revenue || 0)}
          accent="text-ember"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className={panelClass}>
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Revenue Over Time</p>
            <p className="mt-1 text-sm text-ink/60">Rolling view across the last {analytics.windowDays} days.</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff7a59" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#ff7a59" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7ddd2" />
                <XAxis dataKey="label" tick={{ fill: '#6f665d', fontSize: 12 }} />
                <YAxis tick={{ fill: '#6f665d', fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#ff7a59"
                  strokeWidth={2.5}
                  fill="url(#revenueFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={panelClass}>
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Demand Velocity</p>
            <p className="mt-1 text-sm text-ink/60">Bookings and attendee intake by day.</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7ddd2" />
                <XAxis dataKey="label" tick={{ fill: '#6f665d', fontSize: 12 }} />
                <YAxis tick={{ fill: '#6f665d', fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="bookings"
                  name="Bookings"
                  stroke="#1d7c74"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="attendees"
                  name="Attendees"
                  stroke="#2f4f7f"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={panelClass}>
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Attendee Growth</p>
            <p className="mt-1 text-sm text-ink/60">Cumulative audience build over the selected window.</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="attendeeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1d7c74" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#1d7c74" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7ddd2" />
                <XAxis dataKey="label" tick={{ fill: '#6f665d', fontSize: 12 }} />
                <YAxis tick={{ fill: '#6f665d', fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="cumulativeAttendees"
                  name="Audience"
                  stroke="#1d7c74"
                  strokeWidth={2.5}
                  fill="url(#attendeeFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={panelClass}>
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Top Events By Revenue</p>
            <p className="mt-1 text-sm text-ink/60">Highest grossing events in the current scope.</p>
          </div>
          {analytics.topEvents?.length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.topEvents.map((item) => ({
                    ...item,
                    shortTitle: item.title.length > 20 ? `${item.title.slice(0, 20)}...` : item.title
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7ddd2" />
                  <XAxis dataKey="shortTitle" tick={{ fill: '#6f665d', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#6f665d', fontSize: 12 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="revenue" name="Revenue" fill="#2f4f7f" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="rounded-2xl bg-sand/70 px-4 py-6 text-sm text-ink/55">
              No event-level revenue rankings yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export default AnalyticsCharts;
