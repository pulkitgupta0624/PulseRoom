const MetricCard = ({ label, value, accent = 'text-reef' }) => (
  <div className="rounded-[24px] border border-ink/10 bg-white/75 p-5 shadow-bloom">
    <p className="text-xs uppercase tracking-[0.25em] text-ink/50">{label}</p>
    <p className={`mt-3 font-display text-3xl ${accent}`}>{value}</p>
  </div>
);

export default MetricCard;

