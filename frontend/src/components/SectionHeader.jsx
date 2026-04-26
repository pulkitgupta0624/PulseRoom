const SectionHeader = ({ eyebrow, title, description, actions }) => (
  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div className="space-y-2">
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.3em] text-reef">{eyebrow}</p> : null}
      <h2 className="font-display text-3xl text-ink md:text-4xl">{title}</h2>
      {description ? <p className="max-w-2xl text-sm text-ink/70 md:text-base">{description}</p> : null}
    </div>
    {actions ? <div>{actions}</div> : null}
  </div>
);

export default SectionHeader;

