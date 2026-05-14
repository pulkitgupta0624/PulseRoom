import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import EventCard from '../components/EventCard';
import SectionHeader from '../components/SectionHeader';
import SeriesMembershipPanel from '../components/SeriesMembershipPanel';
import { api } from '../lib/api';
import { buildOrganizerBrandTheme, getOrganizerPublicPath } from '../lib/organizerBranding';

const StripeCheckoutModal = lazy(() => import('../components/StripeCheckoutModal'));

const DeferredCheckoutFallback = ({ label = 'Loading secure checkout...' }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4 backdrop-blur-sm">
    <div className="w-full max-w-md rounded-[28px] border border-ink/10 bg-white px-6 py-10 text-center shadow-bloom">
      <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-reef border-t-transparent" />
      <p className="mt-4 text-sm text-ink/60">{label}</p>
    </div>
  </div>
);

const SeriesDetailPage = () => {
  const { seriesId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useSelector((state) => state.auth);
  const [payload, setPayload] = useState(null);
  const [organizerProfile, setOrganizerProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);
  const [status, setStatus] = useState(null);
  const [checkoutSession, setCheckoutSession] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const stripeRedirectHandledRef = useRef('');

  const redirectMembershipPurchaseId = searchParams.get('seriesMembershipPurchaseId');
  const redirectPaymentIntentId = searchParams.get('payment_intent');
  const redirectStatus = searchParams.get('redirect_status');

  const loadSeries = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/events/series/${seriesId}`);
      setPayload(response.data.data);
      setError(null);
    } catch (loadError) {
      setPayload(null);
      setError(loadError.response?.data?.message || 'Unable to load this series right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSeries();
  }, [seriesId]);

  useEffect(() => {
    const organizerId = payload?.series?.organizerId;
    if (!organizerId) {
      setOrganizerProfile(null);
      return undefined;
    }

    let active = true;

    api.get(`/api/users/profile/${organizerId}`)
      .then((response) => {
        if (active) {
          setOrganizerProfile(response.data.data);
        }
      })
      .catch(() => {
        if (active) {
          setOrganizerProfile(null);
        }
      });

    return () => {
      active = false;
    };
  }, [payload?.series?.organizerId]);

  const clearStripeReturnParams = () => {
    if (!redirectMembershipPurchaseId && !redirectPaymentIntentId && !redirectStatus) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('seriesMembershipPurchaseId');
    nextSearchParams.delete('payment_intent');
    nextSearchParams.delete('payment_intent_client_secret');
    nextSearchParams.delete('redirect_status');
    setSearchParams(nextSearchParams, { replace: true });
  };

  const finalizeMembershipPayment = async ({ purchaseId, paymentIntentId }) => {
    const response = await api.post(`/api/events/series/memberships/${purchaseId}/confirm-payment`, {
      paymentIntentId
    });
    const result = response.data.data;

    if (result.membershipActivated) {
      setCheckoutSession(null);
      setCheckoutOpen(false);
      await loadSeries();
      setStatus({
        tone: 'success',
        message: 'Your series pass is active. Member pricing and early access are now unlocked.'
      });
      return result;
    }

    setCheckoutSession(null);
    setCheckoutOpen(false);
    setStatus({
      tone: 'info',
      message:
        result.message ||
        'Stripe is still processing your payment. Your series pass will unlock once confirmation arrives.'
    });
    await loadSeries();
    return result;
  };

  useEffect(() => {
    if (!redirectMembershipPurchaseId || !redirectStatus) {
      return;
    }

    const redirectKey = [
      redirectMembershipPurchaseId,
      redirectPaymentIntentId || '',
      redirectStatus
    ].join(':');

    if (stripeRedirectHandledRef.current === redirectKey) {
      return;
    }

    stripeRedirectHandledRef.current = redirectKey;

    if (redirectStatus !== 'succeeded') {
      setStatus({
        tone: 'error',
        message: 'Stripe could not verify the series payment. Please retry checkout.'
      });
      clearStripeReturnParams();
      return;
    }

    let cancelled = false;

    const finalizeRedirectPayment = async () => {
      setStatus({
        tone: 'info',
        message: 'Stripe returned successfully. Activating your series pass...'
      });

      try {
        await finalizeMembershipPayment({
          purchaseId: redirectMembershipPurchaseId,
          paymentIntentId: redirectPaymentIntentId || undefined
        });
      } catch (paymentError) {
        if (!cancelled) {
          setStatus({
            tone: 'error',
            message:
              paymentError.response?.data?.message ||
              'Stripe accepted the payment, but the series pass could not be activated yet.'
          });
        }
      } finally {
        if (!cancelled) {
          clearStripeReturnParams();
        }
      }
    };

    finalizeRedirectPayment();

    return () => {
      cancelled = true;
    };
  }, [redirectMembershipPurchaseId, redirectPaymentIntentId, redirectStatus]);

  const handleJoin = async () => {
    setJoining(true);
    setStatus(null);
    try {
      const membershipPrice = Number(payload?.series?.membershipSettings?.price || 0);
      if (membershipPrice > 0) {
        const response = await api.post(`/api/events/series/${seriesId}/memberships/checkout`);
        const result = response.data.data;

        if (result.payment?.provider === 'stripe' && result.paymentIntent?.clientSecret) {
          setCheckoutSession({
            resourceId: result.purchase._id,
            returnParamKey: 'seriesMembershipPurchaseId',
            clientSecret: result.paymentIntent.clientSecret,
            amount: result.purchase.amount,
            currency: result.purchase.currency,
            eventTitle: payload?.series?.name || 'Series pass',
            tierName: result.purchase.seriesSnapshot?.planName || payload?.series?.membershipSettings?.planName,
            checkoutTitle: 'Activate series pass',
            checkoutSubtitle: `${payload?.series?.name || 'Series'} - ${result.purchase.seriesSnapshot?.planName || 'Membership'}`,
            checkoutDescription: 'Stripe will confirm your membership after payment.'
          });
          setCheckoutOpen(true);
          setStatus({
            tone: 'info',
            message: 'Series pass reserved. Complete the Stripe payment below to unlock member access.'
          });
        } else if (result.membership) {
          await loadSeries();
          setStatus({
            tone: 'success',
            message: 'Your series pass is active. Member pricing and early access are now unlocked.'
          });
        }
      } else {
        await api.post(`/api/events/series/${seriesId}/memberships/join`);
        await loadSeries();
        setStatus({
          tone: 'success',
          message: 'Your series pass is active. Member pricing and early access are now unlocked.'
        });
      }
    } catch (joinError) {
      setStatus({
        tone: 'error',
        message: joinError.response?.data?.message || 'Unable to join this series right now.'
      });
    } finally {
      setJoining(false);
    }
  };

  const handleCheckoutClose = () => {
    setCheckoutOpen(false);
    setStatus({
      tone: 'info',
      message: 'Stripe payment is still pending for this series pass. Reopen checkout when you are ready.'
    });
  };

  const organizerBrandTheme = useMemo(
    () => buildOrganizerBrandTheme(organizerProfile?.organizerProfile?.branding || {}),
    [organizerProfile?.organizerProfile?.branding]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-reef border-t-transparent" />
          <p className="text-sm text-ink/50">Loading series details...</p>
        </div>
      </div>
    );
  }

  if (error || !payload?.series) {
    return (
      <div className="space-y-6">
        <SectionHeader
          eyebrow="Series"
          title="Series unavailable"
          description={error || 'This series could not be found.'}
        />
        <Link to="/" className="inline-flex rounded-full bg-ink px-5 py-3 font-semibold text-sand">
          Back to events
        </Link>
      </div>
    );
  }

  const series = payload.series;
  const events = payload.events || [];
  const upcomingEvents = events.filter((event) => new Date(event.startsAt).getTime() > Date.now());
  const pastEvents = events.filter((event) => new Date(event.startsAt).getTime() <= Date.now());
  const organizerHubPath = organizerProfile
    ? getOrganizerPublicPath(organizerProfile, series.organizerId)
    : `/organizers/${series.organizerId}`;
  const heroTitle = series.name;
  const heroSubtitle =
    organizerProfile?.organizerProfile?.branding?.heroSubtitle ||
    series.description ||
    series.summary;

  return (
    <div className="space-y-10" style={organizerBrandTheme.styles}>
      <section
        className="overflow-hidden rounded-[36px] border border-[color:var(--organizer-outline)] shadow-bloom"
        style={{
          background: organizerBrandTheme.heroBackground
        }}
      >
        <div
          className="relative"
          style={{
            backgroundImage: series.theme?.coverImageUrl
              ? `linear-gradient(135deg, rgba(18,18,18,0.32), rgba(18,18,18,0.12)), url(${series.theme.coverImageUrl})`
              : organizerProfile?.organizerProfile?.branding?.coverImageUrl
                ? `linear-gradient(135deg, rgba(18,18,18,0.32), rgba(18,18,18,0.12)), url(${organizerProfile.organizerProfile.branding.coverImageUrl})`
                : undefined,
            backgroundPosition: 'center',
            backgroundSize: 'cover'
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_35%)]" />
          <div className="relative flex flex-col gap-6 px-6 py-10 text-[color:var(--organizer-hero-text)] md:px-10">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-white/18 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em]">
                Series
              </span>
              {organizerProfile?.organizerProfile?.branding?.publicHandle ? (
                <span className="rounded-full border border-white/18 bg-white/8 px-3 py-1 text-xs uppercase tracking-[0.24em]">
                  /studio/{organizerProfile.organizerProfile.branding.publicHandle}
                </span>
              ) : null}
            </div>

            <div className="space-y-3">
              <h1 className="max-w-4xl text-4xl leading-tight md:text-5xl" style={{ fontFamily: 'var(--organizer-heading-font)' }}>
                {heroTitle}
              </h1>
              <p className="max-w-3xl text-sm text-white/82 md:text-base">{heroSubtitle}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {!user ? (
                <Link to="/auth" className="rounded-full border border-white/18 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/16">
                  Sign in to join
                </Link>
              ) : null}
              {organizerProfile ? (
                <Link
                  to={organizerHubPath}
                  className="rounded-full border border-white/18 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/14"
                >
                  View organizer studio
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <SeriesMembershipPanel
        series={series}
        joining={joining}
        onJoin={user ? handleJoin : null}
        status={status}
      />
      {checkoutSession && !checkoutOpen ? (
        <button
          type="button"
          onClick={() => setCheckoutOpen(true)}
          className="rounded-full border border-dusk/25 bg-white px-4 py-2 text-sm font-semibold text-dusk transition hover:bg-dusk/5"
        >
          Resume series checkout
        </button>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[24px] border border-[color:var(--organizer-outline)] bg-white/82 p-5 shadow-bloom">
          <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Active members</p>
          <p className="mt-2 font-display text-4xl text-ink">{series.stats?.activeMembers || 0}</p>
        </div>
        <div className="rounded-[24px] border border-[color:var(--organizer-outline)] bg-white/82 p-5 shadow-bloom">
          <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Total events</p>
          <p className="mt-2 font-display text-4xl text-ink">{series.stats?.totalEvents || 0}</p>
        </div>
        <div className="rounded-[24px] border border-[color:var(--organizer-outline)] bg-white/82 p-5 shadow-bloom">
          <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Upcoming</p>
          <p className="mt-2 font-display text-4xl text-ink">{series.stats?.upcomingEvents || 0}</p>
        </div>
      </section>

      {upcomingEvents.length > 0 ? (
        <section className="space-y-6">
          <SectionHeader
            eyebrow="Upcoming"
            title="Next in the series"
            description="Book the next live drops, member-only sessions, and repeat formats from one place."
          />
          <div className="grid gap-5 lg:grid-cols-3">
            {upcomingEvents.map((event) => (
              <EventCard key={event._id} event={event} />
            ))}
          </div>
        </section>
      ) : null}

      {pastEvents.length > 0 ? (
        <section className="space-y-6">
          <SectionHeader
            eyebrow="Library"
            title="Past sessions"
            description="Browse previous drops and keep the replay-ready history under the same banner."
          />
          <div className="grid gap-5 lg:grid-cols-3">
            {pastEvents.map((event) => (
              <EventCard key={event._id} event={event} compact />
            ))}
          </div>
        </section>
      ) : null}

      {checkoutSession && checkoutOpen ? (
        <Suspense fallback={<DeferredCheckoutFallback label="Loading series checkout..." />}>
          <StripeCheckoutModal
            session={checkoutSession}
            onClose={handleCheckoutClose}
            onComplete={(paymentIntentId) =>
              finalizeMembershipPayment({
                purchaseId: checkoutSession.resourceId,
                paymentIntentId
              })
            }
          />
        </Suspense>
      ) : null}
    </div>
  );
};

export default SeriesDetailPage;
