import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const ReplayAccessButton = ({ booking }) => {
  const [available, setAvailable] = useState(false);
  const hasStarted = new Date(booking.eventSnapshot?.startsAt || 0).getTime() <= Date.now();

  useEffect(() => {
    let active = true;

    const loadReplayAccess = async () => {
      if (booking.status !== 'confirmed' || !hasStarted) {
        return;
      }

      try {
        await api.get(`/api/live/${booking.eventId}/replay`);
        if (active) {
          setAvailable(true);
        }
      } catch {
        if (active) {
          setAvailable(false);
        }
      }
    };

    void loadReplayAccess();

    return () => {
      active = false;
    };
  }, [booking.eventId, booking.status, hasStarted]);

  if (!available) {
    return null;
  }

  return (
    <Link
      to={`/events/${booking.eventId}/live?replay=1`}
      className="rounded-full border border-dusk/25 bg-dusk/5 px-4 py-2 text-sm font-semibold text-dusk hover:bg-dusk/10"
    >
      Watch replay
    </Link>
  );
};

export default ReplayAccessButton;
