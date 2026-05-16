import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

const ProtectedRoute = ({ children, roles = [] }) => {
  const location = useLocation();
  const { user, sessionChecked } = useSelector((state) => state.auth);

  if (!sessionChecked) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 py-16">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-reef border-t-transparent" />
          <p className="text-sm text-ink/55">Restoring your PulseRoom session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/auth"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }

  if (roles.length && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
