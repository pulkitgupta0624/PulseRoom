import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import SectionHeader from '../components/SectionHeader';
import EventCapacityBar from '../components/EventCapacityBar';
import EventReportModal from '../components/EventReportModal';
import AddToCalendarButton from '../components/AddToCalendarButton';
import EventSponsorSection from '../components/EventSponsorSection';
import { fetchEventById } from '../features/events/eventsSlice';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/formatters';

const ShareButton = ({ event, shareUrl }) => {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handler = (inputEvent) => {
      if (ref.current && !ref.current.contains(inputEvent.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const url = shareUrl || window.location.href;
  const title = event?.title || 'PulseRoom Event';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_error) {
      // Ignore clipboard failures in unsupported environments.
    }
    setOpen(false);
  };

  const shareVia = (platform) => {
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);
    const links = {
      twitter: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      whatsapp: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`
    };

    window.open(links[platform], '_blank', 'noopener');
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white/80 px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-sand"
      >
        <svg className="h-4 w-4 text-ink/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
        {copied ? 'Copied!' : 'Share'}
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-2 w-44 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-bloom">
          <button
            type="button"
            onClick={copyLink}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-ink transition hover:bg-sand/60"
          >
            Copy link
          </button>
          <hr className="mx-4 border-ink/8" />
          <button
            type="button"
            onClick={() => shareVia('twitter')}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-ink transition hover:bg-sand/60"
          >
            X (Twitter)
          </button>
          <button
            type="button"
            onClick={() => shareVia('linkedin')}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-ink transition hover:bg-sand/60"
          >
            LinkedIn
          </button>
          <button
            type="button"
            onClick={() => shareVia('whatsapp')}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-ink transition hover:bg-sand/60"
          >
            WhatsApp
          </button>
        </div>
      )}
    </div>
  );
};

const EventDetailPage = () => {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { currentEvent: event } = useSelector((state) => state.events);
  const [selectedTierId, setSelectedTierId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [attendee, setAttendee] = useState({ name: '', email: '' });
  const [capacityData, setCapacityData] = useState([]);
  const [status, setStatus] = useState(null);
  const [booking, setBooking] = useState(false);
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [waitlistEntry, setWaitlistEntry] = useState(null);
  const [waitlistOffer, setWaitlistOffer] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [activeReferralCode, setActiveReferralCode] = useState('');
  const [organizerProfile, setOrganizerProfile] = useState(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [organizerStatus, setOrganizerStatus] = useState(null);
  const referralVisitTrackedRef = useRef(false);

  const waitlistOfferToken = searchParams.get('waitlistOfferToken');
  const requestedTierFromLink = searchParams.get('tierId');
  const referralCodeFromLink = searchParams.get('ref');

  useEffect(() => {
    referralVisitTrackedRef.current = false;
  }, [eventId]);

  useEffect(() => {
    const storageKey = `pulseroom.referral.${eventId}`;
    const storedReferralCode = window.sessionStorage.getItem(storageKey);

    if (referralCodeFromLink) {
      window.sessionStorage.setItem(storageKey, referralCodeFromLink);
      setActiveReferralCode(referralCodeFromLink);
      return;
    }

    setActiveReferralCode(storedReferralCode || '');
  }, [eventId, referralCodeFromLink]);

  useEffect(() => {
    const shouldTrackReferral = Boolean(referralCodeFromLink && !referralVisitTrackedRef.current);
    dispatch(
      fetchEventById(
        shouldTrackReferral
          ? {
            eventId,
            referralCode: referralCodeFromLink
          }
          : eventId
      )
    );

    if (shouldTrackReferral) {
      referralVisitTrackedRef.current = true;
    }
  }, [dispatch, eventId, referralCodeFromLink]);

  useEffect(() => {
    if (user) {
      setAttendee((previous) => ({
        name: previous.name || user.email.split('@')[0],
        email: previous.email || user.email
      }));
    }
  }, [user]);

  useEffect(() => {
    if (requestedTierFromLink) {
      setSelectedTierId(requestedTierFromLink);
    }
  }, [requestedTierFromLink]);

  useEffect(() => {
    if (event?.ticketTiers?.length && !selectedTierId) {
      setSelectedTierId(event.ticketTiers[0].tierId);
    }
  }, [event, selectedTierId]);

  useEffect(() => {
    const loadOrganizerProfile = async () => {
      if (!event?.organizerId) {
        setOrganizerProfile(null);
        return;
      }

      try {
        const response = await api.get(`/api/users/profile/${event.organizerId}`);
        setOrganizerProfile(response.data.data);
      } catch (_error) {
        setOrganizerProfile(null);
      }
    };

    loadOrganizerProfile();
  }, [event?.organizerId, user?.id]);

  useEffect(() => {
    if (!event) {
      return;
    }

    const storageKey = `pulseroom.referral.${eventId}`;
    const offerStatus = event.referralOffer?.status;

    if (offerStatus && offerStatus !== 'active') {
      window.sessionStorage.removeItem(storageKey);
      setActiveReferralCode('');
    }
  }, [event, eventId]);

  const selectedTier = useMemo(
    () => event?.ticketTiers?.find((tier) => tier.tierId === selectedTierId) || event?.ticketTiers?.[0],
    [event, selectedTierId]
  );

  const capacityByTier = useMemo(
    () =>
      capacityData.reduce((accumulator, item) => {
        accumulator[item.tierId] = item;
        return accumulator;
      }, {}),
    [capacityData]
  );

  const selectedCapacity = selectedTier ? capacityByTier[selectedTier.tierId] : null;
  const isSelectedTierSoldOut = Boolean(selectedCapacity && selectedCapacity.remaining === 0);
  const waitlistOfferActive = Boolean(waitlistOffer?.isOfferActive);
  const canonicalEventUrl = typeof window !== 'undefined' ? `${window.location.origin}/events/${eventId}` : '';
  const organizerShareUrl =
    user?.id === event?.organizerId && event?.referralLink ? event.referralLink : canonicalEventUrl;
  const activeReferralOffer = event?.referralOffer?.status === 'active' ? event.referralOffer : null;
  const referralPreviewDiscount = selectedTier
    ? activeReferralOffer?.discountType === 'fixed'
      ? Math.min(selectedTier.price * quantity, activeReferralOffer.discountValue || 0)
      : Number(((selectedTier.price * quantity) * ((activeReferralOffer?.discountValue || 0) / 100)).toFixed(2))
    : 0;
  const discountedTotal = Math.max(0, (selectedTier?.price || 0) * quantity - referralPreviewDiscount);

  const refreshCapacity = async () => {
    try {
      const response = await api.get(`/api/bookings/capacity/${eventId}`);
      setCapacityData(response.data.data);
    } catch (_error) {
      // Ignore non-critical capacity refresh failures.
    }
  };

  useEffect(() => {
    refreshCapacity();
    const intervalId = setInterval(refreshCapacity, 30_000);
    return () => clearInterval(intervalId);
  }, [eventId]);

  useEffect(() => {
    const loadWaitlistStatus = async () => {
      if (!user || !selectedTier?.tierId) {
        setWaitlistEntry(null);
        return;
      }

      try {
        const response = await api.get('/api/bookings/waitlist/me', {
          params: {
            eventId,
            tierId: selectedTier.tierId
          }
        });
        setWaitlistEntry(response.data.data);
      } catch (_error) {
        setWaitlistEntry(null);
      }
    };

    loadWaitlistStatus();
  }, [eventId, selectedTier?.tierId, user]);

  useEffect(() => {
    const loadWaitlistOffer = async () => {
      if (!user || !waitlistOfferToken) {
        setWaitlistOffer(null);
        return;
      }

      try {
        const response = await api.get(`/api/bookings/waitlist/offers/${waitlistOfferToken}`, {
          params: {
            eventId,
            tierId: requestedTierFromLink || selectedTierId
          }
        });
        const offer = response.data.data;
        setWaitlistOffer(offer);
        setWaitlistEntry(offer);
        setSelectedTierId(offer.tierId);
        setQuantity(offer.quantity);
        setAttendee(offer.attendee);
      } catch (error) {
        setWaitlistOffer(null);
        setStatus({
          tone: 'error',
          message: error.response?.data?.message || 'This waitlist claim link is no longer active.'
        });
      }
    };

    loadWaitlistOffer();
  }, [eventId, requestedTierFromLink, selectedTierId, user, waitlistOfferToken]);

  const handleBooking = async (formEvent) => {
    formEvent.preventDefault();
    setStatus(null);
    setBooking(true);

    try {
      const response = await api.post('/api/bookings/checkout', {
        eventId,
        tierId: selectedTier?.tierId,
        quantity,
        attendee,
        referralCode: activeReferralCode || undefined,
        waitlistOfferToken: waitlistOffer?.offerToken
      });

      const createdBooking = response.data.data.booking;
      const savedAmount = createdBooking.referral?.discountAmount || 0;
      setStatus({
        tone: 'success',
        message: createdBooking.invoice?.invoiceNumber
          ? `Booking confirmed. Invoice ${createdBooking.invoice.invoiceNumber} is ready and your QR ticket is now in My Tickets.${savedAmount ? ` You saved ${formatCurrency(savedAmount, createdBooking.currency)} with the referral invite.` : ''}`
          : 'Booking submitted successfully.'
      });
      setWaitlistOffer(null);
      await Promise.all([dispatch(fetchEventById(eventId)), refreshCapacity()]);
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error.response?.data?.message || 'Unable to complete booking'
      });
    } finally {
      setBooking(false);
    }
  };

  const handleJoinWaitlist = async () => {
    if (!selectedTier) {
      return;
    }

    setStatus(null);
    setJoiningWaitlist(true);

    try {
      const response = await api.post('/api/bookings/waitlist', {
        eventId,
        tierId: selectedTier.tierId,
        quantity,
        attendee
      });

      setWaitlistEntry(response.data.data);
      setStatus({
        tone: 'success',
        message: `You are on the waitlist for ${selectedTier.name}. We will notify you if a spot opens.`
      });
      await refreshCapacity();
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error.response?.data?.message || 'Unable to join the waitlist'
      });
    } finally {
      setJoiningWaitlist(false);
    }
  };

  const handleFollowToggle = async () => {
    if (!user || !organizerProfile?.canFollowOrganizer || !event?.organizerId) {
      return;
    }

    setFollowLoading(true);
    setOrganizerStatus(null);

    try {
      const response = organizerProfile.isFollowingOrganizer
        ? await api.delete(`/api/users/organizers/${event.organizerId}/follow`)
        : await api.post(`/api/users/organizers/${event.organizerId}/follow`);
      const followState = response.data.data;

      setOrganizerProfile((current) =>
        current
          ? {
            ...current,
            isFollowingOrganizer: followState.isFollowing,
            followersCount: followState.followersCount
          }
          : current
      );
      setOrganizerStatus({
        tone: 'success',
        message: followState.isFollowing
          ? 'You will now get notified when this organizer publishes new events.'
          : 'You will no longer receive new-event notifications from this organizer.'
      });
    } catch (error) {
      setOrganizerStatus({
        tone: 'error',
        message: error.response?.data?.message || 'Unable to update organizer follow status.'
      });
    } finally {
      setFollowLoading(false);
    }
  };

  if (!event) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-reef border-t-transparent" />
          <p className="text-sm text-ink/50">Loading event details...</p>
        </div>
      </div>
    );
  }

  const isFree = event.ticketTiers?.every((tier) => tier.isFree || tier.price === 0);
  const minPrice = event.ticketTiers?.reduce((minimum, tier) => Math.min(minimum, tier.price), Infinity) || 0;
  const isPublished = event.status === 'published';
  const canApplyForSponsorship = Boolean(event.sponsorPackages?.length);
  const canBook = Boolean(
    isPublished &&
    user &&
    selectedTier &&
    (!isSelectedTierSoldOut || waitlistOfferActive)
  );

  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-[36px] border border-ink/10 bg-white/80 shadow-bloom">
        {event.coverImageUrl && (
          <div className="relative h-64 overflow-hidden md:h-80">
            <img
              src={event.coverImageUrl}
              alt={event.title}
              className="h-full w-full object-cover"
              onError={(imageEvent) => {
                imageEvent.currentTarget.parentElement.style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <div className="mb-3 flex flex-wrap gap-2">
                {(event.categories || []).map((category) => (
                  <span
                    key={category}
                    className="rounded-full border border-white/20 bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur"
                  >
                    {category}
                  </span>
                ))}
              </div>
              <h1 className="font-display text-4xl text-white md:text-5xl">{event.title}</h1>
            </div>
          </div>
        )}

        <div className="grid gap-10 p-6 md:grid-cols-[1.2fr,0.8fr] md:p-10">
          <div className="space-y-6">
            {!event.coverImageUrl && (
              <>
                <div className="flex flex-wrap gap-2">
                  {(event.categories || []).map((category) => (
                    <span key={category} className="rounded-full bg-reef/10 px-3 py-1 text-xs font-semibold text-reef">
                      {category}
                    </span>
                  ))}
                </div>
                <h1 className="max-w-3xl font-display text-4xl text-ink md:text-6xl">{event.title}</h1>
              </>
            )}

            <p className="max-w-2xl text-base text-ink/74 md:text-lg">{event.summary}</p>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[24px] bg-sand p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Starts</p>
                <p className="mt-2 font-semibold text-ink">{formatDate(event.startsAt)}</p>
              </div>
              <div className="rounded-[24px] bg-sand p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Format</p>
                <p className="mt-2 font-semibold capitalize text-ink">{event.type}</p>
              </div>
              <div className="rounded-[24px] bg-sand p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Audience</p>
                <p className="mt-2 font-semibold text-ink">{event.attendeesCount || 0} joined</p>
              </div>
            </div>

            {event.city && (
              <div className="flex items-center gap-2 text-sm text-ink/60">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                {[event.venueName, event.city, event.country].filter(Boolean).join(', ')}
              </div>
            )}

            <p className="text-base leading-7 text-ink/80">{event.description}</p>

            {event.tags?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {event.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-ink/10 bg-sand/70 px-3 py-1 text-xs text-ink/60">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {isPublished ? (
                <Link
                  to={`/events/${eventId}/live`}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 font-semibold text-sand"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-reef opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-reef" />
                  </span>
                  Enter live room
                </Link>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-sand px-5 py-3 text-sm text-ink/50">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  Event {event.status} - live room opens when published
                </div>
              )}

              <AddToCalendarButton event={event} />
              {organizerProfile?.canFollowOrganizer ? (
                <button
                  type="button"
                  onClick={handleFollowToggle}
                  disabled={followLoading}
                  className={`rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${organizerProfile.isFollowingOrganizer
                    ? 'border border-ink/10 bg-white text-ink'
                    : 'bg-reef text-white'
                    }`}
                >
                  {followLoading
                    ? 'Updating...'
                    : organizerProfile.isFollowingOrganizer
                      ? 'Following organizer'
                      : 'Follow organizer'}
                </button>
              ) : !user && organizerProfile ? (
                <Link
                  to="/auth"
                  className="rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-sand"
                >
                  Sign in to follow
                </Link>
              ) : null}
              {canApplyForSponsorship && (
                <Link
                  to={`/events/${eventId}/sponsor`}
                  className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
                >
                  Become a sponsor
                </Link>
              )}
              <ShareButton event={event} shareUrl={organizerShareUrl} />
            </div>
          </div>

          <div className="space-y-5 rounded-[28px] border border-ink/10 bg-sand/70 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl text-ink">Book tickets</h2>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-ink/45">From</p>
                <p className="font-display text-xl text-ink">
                  {isFree ? 'Free' : formatCurrency(minPrice, event.ticketTiers?.[0]?.currency)}
                </p>
              </div>
            </div>

            {!isPublished && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Bookings open once the organizer publishes this event.
              </div>
            )}

            {waitlistOfferActive && (
              <div className="rounded-2xl border border-reef/20 bg-reef/10 px-4 py-3 text-sm text-reef">
                Your waitlist spot is reserved until {formatDate(waitlistOffer.offerExpiresAt)}.
              </div>
            )}

            {activeReferralOffer && user?.id !== event.organizerId && (
              <div className="rounded-2xl border border-dusk/20 bg-dusk/10 px-4 py-3 text-sm text-dusk">
                {event.referralOffer.message}
              </div>
            )}

            {event.referralOffer?.status && event.referralOffer.status !== 'active' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {event.referralOffer.message}
              </div>
            )}

            {isSelectedTierSoldOut && !waitlistOfferActive && (
              <div className="rounded-2xl border border-ember/20 bg-ember/5 px-4 py-3 text-sm text-ember">
                {waitlistEntry
                  ? `You are already on the waitlist for ${selectedTier?.name}.`
                  : `${selectedTier?.name} is sold out right now.`}
              </div>
            )}

            <form onSubmit={handleBooking} className="space-y-4">
              {event.ticketTiers?.length > 1 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Select tier</p>
                  {event.ticketTiers.map((tier) => (
                    <label
                      key={tier.tierId}
                      className={`block cursor-pointer rounded-2xl border px-4 py-3 transition ${selectedTier?.tierId === tier.tierId
                        ? 'border-reef/40 bg-reef/5'
                        : 'border-ink/10 bg-white/60 hover:border-ink/20'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="tier"
                          value={tier.tierId}
                          checked={selectedTier?.tierId === tier.tierId}
                          onChange={() => setSelectedTierId(tier.tierId)}
                          className="accent-reef"
                          disabled={!isPublished}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-ink">{tier.name}</p>
                            <p className="flex-shrink-0 text-sm font-semibold text-ink">
                              {tier.isFree || tier.price === 0 ? 'Free' : formatCurrency(tier.price, tier.currency)}
                            </p>
                          </div>
                          {tier.perks?.length > 0 && (
                            <p className="mt-0.5 truncate text-xs text-ink/50">{tier.perks.join(' | ')}</p>
                          )}
                        </div>
                      </div>
                      <EventCapacityBar eventId={eventId} tierId={tier.tierId} totalQty={tier.quantity} />
                    </label>
                  ))}
                </div>
              )}

              {event.ticketTiers?.length === 1 && selectedTier && (
                <div className="space-y-1">
                  <div className="rounded-2xl border border-reef/15 bg-reef/5 px-4 py-3">
                    <p className="text-sm font-semibold text-ink">{selectedTier.name}</p>
                    {selectedTier.perks?.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {selectedTier.perks.map((perk) => (
                          <li key={perk} className="flex items-center gap-1.5 text-xs text-ink/60">
                            <svg className="h-3 w-3 flex-shrink-0 text-reef" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {perk}
                          </li>
                        ))}
                      </ul>
                    )}
                    <EventCapacityBar eventId={eventId} tierId={selectedTier.tierId} totalQty={selectedTier.quantity} />
                  </div>
                </div>
              )}

              <input
                value={attendee.name}
                onChange={(inputEvent) => setAttendee((value) => ({ ...value, name: inputEvent.target.value }))}
                placeholder="Attendee name"
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 disabled:opacity-50"
                required
                disabled={!isPublished || waitlistOfferActive}
              />
              <input
                type="email"
                value={attendee.email}
                onChange={(inputEvent) => setAttendee((value) => ({ ...value, email: inputEvent.target.value }))}
                placeholder="Attendee email"
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 disabled:opacity-50"
                required
                disabled={!isPublished || waitlistOfferActive}
              />

              <div>
                <label className="mb-1 block text-xs text-ink/50">Quantity (max 10)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={quantity}
                  onChange={(inputEvent) => setQuantity(Number(inputEvent.target.value))}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 disabled:opacity-50"
                  disabled={!isPublished || waitlistOfferActive}
                />
              </div>

              {selectedTier && quantity > 0 && !isFree && (
                <div className="space-y-2 rounded-2xl bg-sand px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-ink/60">Subtotal</p>
                    <p className="font-semibold text-ink">
                      {formatCurrency(selectedTier.price * quantity, selectedTier.currency)}
                    </p>
                  </div>
                  {activeReferralOffer && referralPreviewDiscount > 0 && (
                    <div className="flex items-center justify-between text-sm text-reef">
                      <p>Referral discount</p>
                      <p>-{formatCurrency(referralPreviewDiscount, selectedTier.currency)}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-ink/10 pt-2">
                    <p className="text-sm text-ink/60">Total</p>
                    <p className="font-semibold text-ink">
                      {formatCurrency(activeReferralOffer ? discountedTotal : selectedTier.price * quantity, selectedTier.currency)}
                    </p>
                  </div>
                </div>
              )}

              {status && (
                <p
                  className={`rounded-2xl px-4 py-3 text-sm ${status.tone === 'success' ? 'bg-reef/10 text-reef' : 'bg-ember/10 text-ember'
                    }`}
                >
                  {status.message}
                </p>
              )}

              <button
                type="submit"
                disabled={!canBook || booking}
                className="w-full rounded-2xl bg-ink px-5 py-3 font-semibold text-sand disabled:cursor-not-allowed disabled:opacity-60"
              >
                {booking
                  ? 'Processing...'
                  : waitlistOfferActive
                    ? 'Claim reserved spot'
                    : canBook
                      ? 'Reserve ticket'
                      : isSelectedTierSoldOut
                        ? 'Sold out'
                        : user
                          ? 'Not available'
                          : 'Sign in to book'}
              </button>

              {isSelectedTierSoldOut && !waitlistOfferActive && (
                <button
                  type="button"
                  onClick={handleJoinWaitlist}
                  disabled={!user || joiningWaitlist || Boolean(waitlistEntry)}
                  className="w-full rounded-2xl border border-reef/25 bg-white px-5 py-3 text-sm font-semibold text-reef disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {joiningWaitlist
                    ? 'Joining waitlist...'
                    : waitlistEntry
                      ? 'Already on waitlist'
                      : user
                        ? 'Join waitlist'
                        : 'Sign in to join waitlist'}
                </button>
              )}

              {!user && (
                <p className="text-center text-xs text-ink/45">
                  <Link to="/auth" className="text-reef hover:underline">Sign in</Link> or{' '}
                  <Link to="/auth" className="text-reef hover:underline">create an account</Link>{' '}
                  to book or join the waitlist.
                </p>
              )}
            </form>
          </div>
        </div>
      </section>

      {organizerProfile && (
        <section className="rounded-[32px] border border-ink/10 bg-white/75 p-6 shadow-bloom">
          <SectionHeader
            eyebrow="Organizer"
            title={organizerProfile.organizerProfile?.companyName || organizerProfile.displayName}
            description={organizerProfile.bio || 'Follow this organizer to hear about their next event drops.'}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/organizers/${event.organizerId}`}
                  className="rounded-full border border-ink/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-sand"
                >
                  View profile
                </Link>
                {organizerProfile.canFollowOrganizer ? (
                  <button
                    type="button"
                    onClick={handleFollowToggle}
                    disabled={followLoading}
                    className={`rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-60 ${organizerProfile.isFollowingOrganizer
                      ? 'border border-ink/10 bg-sand text-ink'
                      : 'bg-ink text-sand'
                      }`}
                  >
                    {followLoading
                      ? 'Updating...'
                      : organizerProfile.isFollowingOrganizer
                        ? 'Following'
                        : 'Follow organizer'}
                  </button>
                ) : !user && ['organizer', 'admin'].includes(organizerProfile.role) ? (
                  <Link
                    to="/auth"
                    className="rounded-full border border-ink/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-sand"
                  >
                    Sign in to follow
                  </Link>
                ) : null}
              </div>
            }
          />

          <div className="mt-6 grid gap-6 md:grid-cols-[auto,1fr]">
            <Link
              to={`/organizers/${event.organizerId}`}
              className="group inline-flex"
              aria-label={`View ${organizerProfile.displayName}'s profile`}
            >
              {organizerProfile.avatarUrl ? (
                <img
                  src={organizerProfile.avatarUrl}
                  alt={organizerProfile.displayName}
                  className="h-20 w-20 rounded-full object-cover transition group-hover:ring-2 group-hover:ring-reef/40"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-reef/40 to-dusk/40 font-display text-3xl text-ink transition group-hover:ring-2 group-hover:ring-reef/40">
                  {organizerProfile.displayName?.[0]?.toUpperCase() || 'O'}
                </div>
              )}
            </Link>

            <div className="space-y-4">
              <Link
                to={`/organizers/${event.organizerId}`}
                className="inline-block font-display text-xl text-ink hover:text-reef"
              >
                {organizerProfile.organizerProfile?.companyName || organizerProfile.displayName}
              </Link>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[24px] bg-sand p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Followers</p>
                  <p className="mt-2 font-semibold text-ink">{organizerProfile.followersCount || 0}</p>
                </div>
                <div className="rounded-[24px] bg-sand p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Role</p>
                  <p className="mt-2 font-semibold capitalize text-ink">{organizerProfile.role}</p>
                </div>
                <div className="rounded-[24px] bg-sand p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Location</p>
                  <p className="mt-2 font-semibold text-ink">{organizerProfile.location || 'Remote / not set'}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-sm text-ink/65">
                {organizerProfile.organizerProfile?.supportEmail && (
                  <a
                    href={`mailto:${organizerProfile.organizerProfile.supportEmail}`}
                    className="rounded-full border border-ink/10 bg-white px-4 py-2 hover:bg-sand"
                  >
                    {organizerProfile.organizerProfile.supportEmail}
                  </a>
                )}
                {organizerProfile.organizerProfile?.website && (
                  <a
                    href={organizerProfile.organizerProfile.website}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-ink/10 bg-white px-4 py-2 hover:bg-sand"
                  >
                    Visit website
                  </a>
                )}
              </div>

              {organizerStatus && (
                <p
                  className={`rounded-2xl px-4 py-3 text-sm ${organizerStatus.tone === 'success' ? 'bg-reef/10 text-reef' : 'bg-ember/10 text-ember'
                    }`}
                >
                  {organizerStatus.message}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <EventSponsorSection
        eventId={eventId}
        sponsors={event.sponsors || []}
        canApply={canApplyForSponsorship}
      />

      <section className="grid gap-8 lg:grid-cols-[1fr,1fr]">
        <div className="space-y-6 rounded-[32px] border border-ink/10 bg-white/75 p-6 shadow-bloom">
          <SectionHeader eyebrow="Agenda" title="Sessions" description="Structured programming for the event timeline." />
          {!event.sessions?.length && <p className="text-sm text-ink/50">No sessions scheduled yet.</p>}
          <div className="space-y-4">
            {(event.sessions || []).map((session, index) => (
              <div key={`${session.title}-${index}`} className="rounded-[24px] bg-sand p-4">
                <p className="text-sm font-semibold text-ink">{session.title}</p>
                {session.description && <p className="mt-1.5 text-sm text-ink/70">{session.description}</p>}
                <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.15em] text-ink/45">
                  <span>{formatDate(session.startsAt)}</span>
                  {session.roomLabel && <span>| {session.roomLabel}</span>}
                  {session.speakerNames?.length > 0 && <span>| {session.speakerNames.join(', ')}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6 rounded-[32px] border border-ink/10 bg-white/75 p-6 shadow-bloom">
          <SectionHeader eyebrow="Speakers" title="On stage" description="Hosts, moderators, and featured voices." />
          {!event.speakers?.length && <p className="text-sm text-ink/50">No speakers added yet.</p>}
          <div className="grid gap-4">
            {(event.speakers || []).map((speaker) => (
              <div key={speaker.name} className="flex gap-4 rounded-[24px] bg-sand p-4">
                {speaker.avatarUrl ? (
                  <img
                    src={speaker.avatarUrl}
                    alt={speaker.name}
                    className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
                    onError={(imageEvent) => {
                      imageEvent.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-reef/40 to-dusk/40 font-semibold text-ink">
                    {speaker.name[0]}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-ink">{speaker.name}</p>
                  <p className="text-sm text-ink/70">{[speaker.title, speaker.company].filter(Boolean).join(' | ')}</p>
                  {speaker.bio && <p className="mt-1.5 text-sm text-ink/60">{speaker.bio}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between rounded-[28px] border border-ink/8 bg-white/60 px-5 py-4 shadow-bloom">
        <p className="text-xs text-ink/40">
          Event ID: <code className="font-mono">{eventId}</code>
        </p>
        <button
          type="button"
          onClick={() => setShowReport(true)}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-ink/40 transition hover:bg-ember/5 hover:text-ember"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          Report this event
        </button>
      </div>

      {showReport && <EventReportModal eventId={eventId} onClose={() => setShowReport(false)} />}
    </div>
  );
};

export default EventDetailPage;
