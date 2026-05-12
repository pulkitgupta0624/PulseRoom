import { useEffect, useRef } from 'react';
import gsap from 'gsap';

const StatCard = ({ label, value, accent = 'text-ink' }) => (
  <div className="rounded-[24px] border border-ink/10 bg-white/85 px-4 py-4 shadow-bloom">
    <p className="text-xs uppercase tracking-[0.22em] text-ink/45">{label}</p>
    <p className={`mt-2 font-display text-3xl ${accent}`}>{value}</p>
  </div>
);

const BadgeCard = ({ badge }) => {
  const initials = badge.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="rounded-[24px] border border-dusk/12 bg-white/90 px-4 py-4 shadow-bloom">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-dusk/10 font-display text-lg text-dusk">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-ink">{badge.name}</p>
          <p className="mt-1 text-sm text-ink/60">{badge.description}</p>
        </div>
      </div>
      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-ink/35">
        Unlocked {badge.awardedAt ? new Date(badge.awardedAt).toLocaleDateString() : 'recently'}
      </p>
    </div>
  );
};

const GamificationShowcase = ({ summary, loading, error }) => {
  const rootRef = useRef(null);
  const badgeGridRef = useRef(null);
  const progressRef = useRef(null);

  const badges = summary?.badges || [];
  const perks = summary?.perks || [];
  const recentActivity = summary?.recentActivity || [];
  const nextGoals = summary?.nextGoals || [];
  const stats = summary?.stats || {};
  const level = summary?.level || {};
  const pointsToNextLevel = Number(level.pointsToNextLevel || 0);

  useEffect(() => {
    if (!rootRef.current) {
      return undefined;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '[data-gamification-stat]',
        { autoAlpha: 0, y: 14 },
        { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power3.out', stagger: 0.06 }
      );
    }, rootRef);

    return () => ctx.revert();
  }, [loading, summary?.totalPoints, level.label]);

  useEffect(() => {
    if (!progressRef.current) {
      return;
    }

    gsap.fromTo(
      progressRef.current,
      { scaleX: 0, transformOrigin: 'left center' },
      { scaleX: 1, duration: 0.9, ease: 'power3.out' }
    );
  }, [level.progressPercent]);

  useEffect(() => {
    if (!badgeGridRef.current || !badges.length) {
      return undefined;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '[data-badge-card]',
        { autoAlpha: 0, y: 18, rotateX: -8 },
        { autoAlpha: 1, y: 0, rotateX: 0, duration: 0.65, ease: 'back.out(1.5)', stagger: 0.08 }
      );
    }, badgeGridRef);

    return () => ctx.revert();
  }, [badges.length]);

  if (loading) {
    return <div className="h-72 animate-pulse rounded-[32px] bg-white/60" />;
  }

  if (!summary) {
    return null;
  }

  return (
    <section ref={rootRef} className="overflow-hidden rounded-[32px] border border-dusk/15 bg-gradient-to-br from-dusk/5 via-white to-reef/10 p-6 shadow-bloom">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.26em] text-dusk">Community Rewards</p>
          <h2 className="mt-3 font-display text-3xl text-ink">Points, badges, and perks</h2>
          <p className="mt-2 text-sm text-ink/65">
            Earn points for showing up, contributing to live Q&amp;A, booking early, leaving
            reviews, and opting into networking. Your milestones live here.
          </p>
          {error && (
            <p className="mt-4 rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
          <div data-gamification-stat><StatCard label="Total Points" value={summary.totalPoints || 0} accent="text-dusk" /></div>
          <div data-gamification-stat><StatCard label="Current Level" value={level.label || 'Starter'} accent="text-reef" /></div>
          <div data-gamification-stat><StatCard label="Badges" value={badges.length} accent="text-ember" /></div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <div className="space-y-6">
          <div className="rounded-[28px] border border-ink/10 bg-white/85 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Level Progress</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {pointsToNextLevel > 0
                    ? `${pointsToNextLevel} points to the next level`
                    : 'Top level unlocked'}
                </p>
              </div>
              <p className="rounded-full bg-dusk/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-dusk">
                {level.progressPercent || 0}% progress
              </p>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-sand">
              <div
                ref={progressRef}
                className="h-full rounded-full bg-gradient-to-r from-dusk to-reef transition-all"
                style={{ width: `${level.progressPercent || 0}%` }}
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatCard label="Booked" value={stats.confirmedBookings || 0} accent="text-ink" />
              <StatCard label="Attended" value={stats.attendedEvents || 0} accent="text-dusk" />
              <StatCard label="Top Q&A" value={stats.topQuestions || 0} accent="text-reef" />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Unlocked Badges</p>
              <h3 className="mt-1 font-display text-2xl text-ink">
                {badges.length ? 'Your current collection' : 'Your next badge is waiting'}
              </h3>
            </div>

            {badges.length > 0 ? (
              <div ref={badgeGridRef} className="grid gap-4 md:grid-cols-2">
                {badges.map((badge) => (
                  <div key={badge.key} data-badge-card>
                    <BadgeCard badge={badge} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[28px] border border-dusk/12 bg-white/85 px-5 py-6">
                <p className="font-semibold text-ink">Start with your first booking.</p>
                <p className="mt-2 text-sm text-ink/60">
                  Confirm an event ticket, opt into networking, or leave a review after attending
                  to begin unlocking badges.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-ink/10 bg-white/85 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Unlocked Perks</p>
            <h3 className="mt-1 font-display text-2xl text-ink">What your badges unlock</h3>
            {perks.length > 0 ? (
              <div className="mt-4 space-y-3">
                {perks.map((perk) => (
                  <div key={perk.key} className="rounded-2xl border border-reef/12 bg-reef/5 px-4 py-4">
                    <p className="font-semibold text-ink">{perk.name}</p>
                    <p className="mt-1 text-sm text-ink/60">{perk.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-sand/70 px-4 py-4 text-sm text-ink/60">
                Perks unlock alongside milestone badges. Power Attendee currently unlocks ticket
                early access before the public sale window.
              </p>
            )}
          </div>

          <div className="rounded-[28px] border border-ink/10 bg-white/85 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Next Milestones</p>
            <h3 className="mt-1 font-display text-2xl text-ink">Closest unlocks</h3>
            <div className="mt-4 space-y-3">
              {nextGoals.length > 0 ? (
                nextGoals.map((goal) => {
                  const progress = goal.target > 0 ? Math.round((goal.current / goal.target) * 100) : 0;
                  return (
                    <div key={goal.badgeKey} className="rounded-2xl bg-sand/70 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-ink">{goal.name}</p>
                        <p className="text-xs uppercase tracking-[0.16em] text-ink/40">
                          {goal.current}/{goal.target}
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-ink/60">{goal.description}</p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-reef to-dusk"
                          style={{ width: `${Math.min(100, progress)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-2xl bg-reef/8 px-4 py-4 text-sm text-ink/60">
                  You have cleared the currently tracked badge milestones. Keep attending and
                  contributing to grow your points total.
                </p>
              )}
            </div>
          </div>

          {recentActivity.length > 0 && (
            <div className="rounded-[28px] border border-ink/10 bg-white/85 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Recent Activity</p>
              <div className="mt-4 space-y-3">
                {recentActivity.slice(0, 4).map((item, index) => (
                  <div
                    key={`${item.actionKey || item.badgeKey || item.title}-${index}`}
                    className="flex items-start justify-between gap-3 rounded-2xl bg-sand/65 px-4 py-4"
                  >
                    <div>
                      <p className="font-semibold text-ink">{item.title}</p>
                      {item.description && (
                        <p className="mt-1 text-sm text-ink/60">{item.description}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-dusk">
                        {item.points ? `+${item.points}` : 'Badge'}
                      </p>
                      <p className="mt-1 text-xs text-ink/35">
                        {item.occurredAt ? new Date(item.occurredAt).toLocaleDateString() : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default GamificationShowcase;
