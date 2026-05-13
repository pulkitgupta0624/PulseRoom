import { useMemo, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { formatCurrency } from '../lib/formatters';
import ModalShell from './ModalShell';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

const StripeCheckoutForm = ({ session, onClose, onComplete }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (formEvent) => {
    formEvent.preventDefault();

    if (!stripe || !elements || submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.set(session.returnParamKey || 'paymentBookingId', session.resourceId || session.bookingId);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: returnUrl.toString()
      }
    });

    if (error) {
      setErrorMessage(error.message || 'Unable to confirm this Stripe test payment.');
      setSubmitting(false);
      return;
    }

    if (!paymentIntent?.id) {
      setErrorMessage('Stripe did not return a payment confirmation.');
      setSubmitting(false);
      return;
    }

    try {
      await onComplete(paymentIntent.id);
    } catch (completionError) {
      setErrorMessage(
        completionError?.response?.data?.message ||
          completionError?.message ||
          'Payment was submitted, but the booking could not be finalized yet.'
      );
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-[28px] border border-ink/10 bg-sand/70 px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-reef">Stripe test mode</p>
            <h2 id="stripe-checkout-title" className="mt-1 font-display text-2xl text-ink">
              {session.checkoutTitle || 'Complete payment'}
            </h2>
            <p className="mt-2 text-sm text-ink/60">
              {session.checkoutSubtitle || `${session.eventTitle}${session.tierName ? ` - ${session.tierName}` : ''}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close Stripe checkout"
            className="rounded-full p-2 text-ink/40 transition hover:bg-white hover:text-ink disabled:opacity-40"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3 rounded-2xl bg-white px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Amount due</p>
            <p className="mt-1 text-sm text-ink/60">
              {session.checkoutDescription || 'Stripe will confirm the booking after payment.'}
            </p>
          </div>
          <p className="text-lg font-semibold text-ink">
            {formatCurrency(session.amount, session.currency)}
          </p>
        </div>
      </div>

      <div className="rounded-[28px] border border-ink/10 bg-white px-4 py-4">
        <PaymentElement
          options={{
            layout: 'tabs'
          }}
        />
      </div>

      <div className="rounded-2xl border border-dusk/15 bg-dusk/5 px-4 py-3 text-xs text-ink/60">
        Use Stripe test card <span className="font-semibold text-ink">4242 4242 4242 4242</span>, any
        future expiry date, any 3-digit CVC, and any ZIP/postal code.
      </div>

      {errorMessage && (
        <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{errorMessage}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="flex-1 rounded-2xl border border-ink/10 bg-sand px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || !elements || submitting}
          className="flex-1 rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-sand transition disabled:opacity-60"
        >
          {submitting
            ? 'Confirming payment...'
            : `Pay ${formatCurrency(session.amount, session.currency)}`}
        </button>
      </div>
    </form>
  );
};

const StripeCheckoutModal = ({ session, onClose, onComplete }) => {
  const options = useMemo(
    () => ({
      clientSecret: session.clientSecret,
      locale: 'auto',
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#1c6e5a',
          colorText: '#182430',
          colorDanger: '#c65d32',
          colorBackground: '#ffffff',
          borderRadius: '18px'
        }
      }
    }),
    [session.clientSecret]
  );

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="stripe-checkout-title"
      closeOnBackdrop={false}
      panelClassName="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-[32px] border border-ink/10 bg-white p-6 shadow-bloom sm:max-h-[calc(100vh-3rem)]"
    >
      {stripePromise ? (
        <Elements key={session.clientSecret} stripe={stripePromise} options={options}>
          <StripeCheckoutForm session={session} onClose={onClose} onComplete={onComplete} />
        </Elements>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-ember">Stripe setup needed</p>
              <h2 id="stripe-checkout-title" className="mt-1 font-display text-2xl text-ink">
                Publishable key missing
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Stripe checkout"
              className="rounded-full p-2 text-ink/40 transition hover:bg-sand hover:text-ink"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">
            Add <code>VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...</code> to your local <code>.env</code>,
            restart the frontend, and then retry checkout.
          </p>
        </div>
      )}
    </ModalShell>
  );
};

export default StripeCheckoutModal;
