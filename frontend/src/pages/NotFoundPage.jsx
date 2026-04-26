import { Link } from 'react-router-dom';

const NotFoundPage = () => (
  <div className="mx-auto max-w-2xl rounded-[32px] border border-ink/10 bg-white/80 p-8 text-center shadow-bloom">
    <p className="text-xs uppercase tracking-[0.3em] text-reef">404</p>
    <h1 className="mt-4 font-display text-4xl text-ink">This room is off the schedule.</h1>
    <p className="mt-4 text-ink/70">The page you were looking for does not exist or has moved.</p>
    <Link to="/" className="mt-6 inline-flex rounded-full bg-ink px-5 py-3 font-semibold text-sand">
      Return home
    </Link>
  </div>
);

export default NotFoundPage;
