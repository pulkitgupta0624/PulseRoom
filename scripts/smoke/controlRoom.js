const crypto = require('crypto');
const path = require('path');
const { createRequire } = require('module');

const frontendRequire = createRequire(path.resolve(__dirname, '../../frontend/package.json'));
const { io } = frontendRequire('socket.io-client');

const BASE_URL = String(process.env.PULSEROOM_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const FRONTEND_URL = String(process.env.PULSEROOM_FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
const PASSWORD = process.env.PULSEROOM_SMOKE_PASSWORD || 'SmokeRoom!234';
const STEP_TIMEOUT_MS = Math.max(Number(process.env.PULSEROOM_SMOKE_TIMEOUT_MS || 20000), 5000);
const ATTENDEE_RISK_DOMAIN = process.env.PULSEROOM_SMOKE_RISK_DOMAIN || 'mailinator.com';

const capitalize = (value = '') => String(value).charAt(0).toUpperCase() + String(value).slice(1);

const parseJsonSafely = (text) => {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return {
      raw: text
    };
  }
};

const getCookieHeader = (response) => {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  }

  const rawCookie = response.headers.get('set-cookie');
  if (!rawCookie) {
    return '';
  }

  return rawCookie
    .split(/,(?=[^;,\s]+=)/)
    .map((entry) => entry.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
};

const buildErrorMessage = ({ method, route, status, payload }) => {
  const payloadMessage =
    payload?.message ||
    payload?.error ||
    payload?.raw ||
    JSON.stringify(payload || {});

  return `${method} ${route} failed with ${status}: ${payloadMessage}`;
};

const requestJson = async (
  route,
  {
    method = 'GET',
    token = '',
    cookie = '',
    body,
    allowFailure = false
  } = {}
) => {
  const headers = {
    Accept: 'application/json'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (cookie) {
    headers.Cookie = cookie;
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const payload = parseJsonSafely(text);

  if (!response.ok && !allowFailure) {
    throw new Error(
      buildErrorMessage({
        method,
        route,
        status: response.status,
        payload
      })
    );
  }

  return {
    ok: response.ok,
    status: response.status,
    body: payload,
    data: payload?.data ?? null,
    cookieHeader: getCookieHeader(response)
  };
};

const waitForSocketConnect = (socket) =>
  new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for socket connection'));
    }, STEP_TIMEOUT_MS);

    const handleConnect = () => {
      cleanup();
      resolve();
    };

    const handleError = (error) => {
      cleanup();
      reject(new Error(`Socket connection failed: ${error?.message || 'unknown error'}`));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleError);
    };

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleError);
  });

const waitForSocketEvent = (socket, eventName, predicate = () => true) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for socket event "${eventName}"`));
    }, STEP_TIMEOUT_MS);

    const handleEvent = (payload) => {
      try {
        if (!predicate(payload)) {
          return;
        }

        cleanup();
        resolve(payload);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    const handleError = (error) => {
      cleanup();
      reject(new Error(`Socket error while waiting for "${eventName}": ${error?.message || error}`));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off(eventName, handleEvent);
      socket.off('connect_error', handleError);
    };

    socket.on(eventName, handleEvent);
    socket.on('connect_error', handleError);
  });

const buildIdentity = ({ role, tag, riskyEmail = false }) => ({
  name: `Smoke ${capitalize(role)} ${tag}`,
  email: riskyEmail
    ? `${role}.${tag}@${ATTENDEE_RISK_DOMAIN}`
    : `${role}.${tag}@example.com`
});

const registerUser = async ({ role, tag, riskyEmail = false }) => {
  const identity = buildIdentity({
    role,
    tag,
    riskyEmail
  });
  const response = await requestJson('/api/auth/register', {
    method: 'POST',
    body: {
      ...identity,
      role,
      password: PASSWORD
    }
  });

  return {
    id: response.data.user.id,
    role,
    name: identity.name,
    email: identity.email,
    accessToken: response.data.accessToken,
    cookie: response.cookieHeader
  };
};

const rotateRefreshSession = async (session) => {
  const response = await requestJson('/api/auth/refresh', {
    method: 'POST',
    cookie: session.cookie,
    body: {}
  });

  return {
    accessToken: response.data.accessToken,
    cookie: response.cookieHeader || session.cookie,
    user: response.data.user
  };
};

const loadCurrentUser = async (token) => {
  const response = await requestJson('/api/auth/me', {
    token
  });

  return response.data;
};

const createEvent = async ({ organizer, moderator, tag }) => {
  const startsAt = new Date(Date.now() + 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 90 * 60 * 1000);
  const tierId = `general-${tag}`;

  const response = await requestJson('/api/events', {
    method: 'POST',
    token: organizer.accessToken,
    body: {
      title: `Control Room Smoke ${tag}`,
      summary: 'Cross-service smoke drill for the live event control room.',
      description:
        'This temporary event validates auth recovery, live safety sockets, chat moderation, and booking risk handling across the local PulseRoom stack.',
      coverImageUrl: '',
      type: 'online',
      visibility: 'public',
      timezone: 'Asia/Calcutta',
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      venueName: '',
      venueAddress: '',
      city: 'Kolkata',
      country: 'India',
      streamUrl: 'https://example.com/live',
      categories: ['Operations'],
      tags: ['smoke', 'safety'],
      teamMembers: [
        {
          email: moderator.email,
          name: moderator.name,
          role: 'moderator',
          notes: 'Smoke drill collaborator'
        }
      ],
      ticketTiers: [
        {
          tierId,
          name: 'General Admission',
          description: 'Smoke-test ticket tier',
          price: 0,
          currency: 'INR',
          quantity: 50,
          isFree: true,
          perks: ['Smoke access']
        }
      ],
      acceptedCurrencies: ['INR'],
      featured: false,
      allowsChat: true,
      allowsQa: true
    }
  });

  return {
    event: response.data,
    tierId
  };
};

const publishEvent = async ({ organizer, eventId }) => {
  await requestJson(`/api/events/${eventId}/status`, {
    method: 'POST',
    token: organizer.accessToken,
    body: {
      status: 'published'
    }
  });
};

const connectOrganizerSafetyFeed = async ({ organizer, eventId, socketErrors }) => {
  const socket = io(BASE_URL, {
    path: '/socket/admin',
    transports: ['websocket'],
    reconnection: false,
    auth: {
      token: organizer.accessToken
    }
  });

  socket.on('admin:error', (payload) => {
    socketErrors.push(payload);
  });

  await waitForSocketConnect(socket);
  const joinedEvent = waitForSocketEvent(
    socket,
    'admin:event-joined',
    (payload) => String(payload?.eventId || '') === String(eventId)
  );
  socket.emit('admin:join-event', { eventId });
  await joinedEvent;

  return socket;
};

const main = async () => {
  const runTag = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const socketErrors = [];
  let socket;

  try {
    console.log(`Running control-room smoke against ${BASE_URL}`);
    await requestJson('/health');

    const organizer = await registerUser({
      role: 'organizer',
      tag: runTag
    });
    const moderator = await registerUser({
      role: 'moderator',
      tag: runTag
    });
    const attendee = await registerUser({
      role: 'attendee',
      tag: runTag,
      riskyEmail: true
    });

    const rotatedOrganizerSession = await rotateRefreshSession(organizer);
    const replayedRefresh = await requestJson('/api/auth/refresh', {
      method: 'POST',
      cookie: organizer.cookie,
      body: {},
      allowFailure: true
    });

    if (replayedRefresh.status !== 401) {
      throw new Error(`Expected replayed refresh token to fail, received ${replayedRefresh.status}`);
    }

    organizer.accessToken = rotatedOrganizerSession.accessToken;
    organizer.cookie = rotatedOrganizerSession.cookie;

    const currentOrganizer = await loadCurrentUser(organizer.accessToken);
    if (String(currentOrganizer.id || '') !== String(organizer.id)) {
      throw new Error('Refreshed organizer session resolved to the wrong user');
    }

    const {
      event,
      tierId
    } = await createEvent({
      organizer,
      moderator,
      tag: runTag
    });
    const eventId = String(event._id || event.id || '');
    if (!eventId) {
      throw new Error('Event creation did not return an event id');
    }

    await publishEvent({
      organizer,
      eventId
    });

    socket = await connectOrganizerSafetyFeed({
      organizer,
      eventId,
      socketErrors
    });

    const chatIncidentPromise = waitForSocketEvent(
      socket,
      'event:safety-incident',
      (payload) =>
        String(payload?.eventId || '') === eventId && payload?.incidentType === 'chat_message'
    );
    const chatMessageResponse = await requestJson(`/api/chat/event/${eventId}/messages`, {
      method: 'POST',
      token: attendee.accessToken,
      body: {
        body: 'WHATSAPP ME FOR GUARANTEED RETURNS https://pulse.example/a https://pulse.example/b'
      }
    });
    const chatIncident = await chatIncidentPromise;

    if (chatMessageResponse.data?.safety?.moderationStatus !== 'hidden') {
      throw new Error('Expected suspicious chat message to be auto-hidden');
    }

    const bookingIncidentPromise = waitForSocketEvent(
      socket,
      'event:safety-incident',
      (payload) =>
        String(payload?.eventId || '') === eventId && payload?.incidentType === 'booking'
    );
    const bookingResponse = await requestJson('/api/bookings/checkout', {
      method: 'POST',
      token: attendee.accessToken,
      body: {
        eventId,
        tierId,
        quantity: 5,
        attendee: {
          name: attendee.name,
          email: attendee.email
        }
      }
    });
    const bookingIncident = await bookingIncidentPromise;

    if (bookingResponse.data?.booking?.status !== 'confirmed') {
      throw new Error('Expected free smoke booking to confirm immediately');
    }

    const incidentUpdatePromise = waitForSocketEvent(
      socket,
      'event:safety-incident-updated',
      (payload) =>
        String(payload?.incidentId || '') === String(chatIncident.incidentId || '') &&
        payload?.status === 'resolved'
    );
    const resolvedIncidentResponse = await requestJson(
      `/api/admin/incidents/${chatIncident.incidentId}`,
      {
        method: 'PATCH',
        token: moderator.accessToken,
        body: {
          status: 'resolved',
          resolutionNotes: 'Resolved during automated control-room smoke.'
        }
      }
    );
    const resolvedIncident = await incidentUpdatePromise;

    const liveUrl = event.liveUrl || `${FRONTEND_URL}/events/${eventId}/live`;

    console.log(
      JSON.stringify(
        {
          baseUrl: BASE_URL,
          frontendUrl: FRONTEND_URL,
          liveUrl,
          authRefresh: {
            organizerRefreshRotated: true,
            replayedRefreshRejected: true,
            refreshedOrganizerId: currentOrganizer.id
          },
          organizer: {
            id: organizer.id,
            email: organizer.email
          },
          moderator: {
            id: moderator.id,
            email: moderator.email
          },
          attendee: {
            id: attendee.id,
            email: attendee.email
          },
          event: {
            id: eventId,
            title: event.title,
            status: 'published'
          },
          chatIncident: {
            incidentId: chatIncident.incidentId,
            severity: chatIncident.severity,
            category: chatIncident.category,
            status: chatIncident.status,
            autoActions: chatIncident.autoActions
          },
          bookingIncident: {
            incidentId: bookingIncident.incidentId,
            severity: bookingIncident.severity,
            category: bookingIncident.category,
            status: bookingIncident.status,
            autoActions: bookingIncident.autoActions
          },
          resolvedIncident: {
            incidentId: resolvedIncident.incidentId,
            status: resolvedIncident.status,
            resolvedBy: resolvedIncident.resolvedBy,
            responseStatus: resolvedIncidentResponse.data.status
          },
          booking: {
            id: bookingResponse.data.booking.id,
            status: bookingResponse.data.booking.status,
            quantity: bookingResponse.data.booking.quantity
          },
          socketErrors
        },
        null,
        2
      )
    );
  } finally {
    socket?.disconnect();
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
