import { useState, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { updateEvent, fetchOrganizerDashboard } from '../features/events/eventsSlice';
import { api } from '../lib/api';
import { normalizeEventTheme } from '../lib/eventTheme';
import ModalShell from './ModalShell';
import EventThemeFields from './EventThemeFields';

const toDatetimeLocal = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const EventEditModal = ({ event, onClose }) => {
  const dispatch = useDispatch();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef(null);

  const [form, setForm] = useState({
    title: event.title || '',
    summary: event.summary || '',
    description: event.description || '',
    type: event.type || 'online',
    visibility: event.visibility || 'public',
    startsAt: toDatetimeLocal(event.startsAt),
    endsAt: toDatetimeLocal(event.endsAt),
    venueName: event.venueName || '',
    city: event.city || '',
    country: event.country || '',
    coverImageUrl: event.coverImageUrl || '',
    organizerSignatureName: event.organizerSignatureName || '',
    category: (event.categories || [])[0] || '',
    tags: (event.tags || []).join(', '),
    streamUrl: event.streamUrl || '',
    pageTheme: normalizeEventTheme(event.pageTheme),
    allowsChat: event.allowsChat !== false,
    allowsQa: event.allowsQa !== false
  });

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/uploads/event-cover', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      update('coverImageUrl', res.data.data.url);
    } catch {
      setError('Cover image upload failed. Check your Cloudinary config.');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title,
        summary: form.summary,
        description: form.description,
        type: form.type,
        visibility: form.visibility,
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        venueName: form.venueName,
        city: form.city,
        country: form.country,
        streamUrl: form.streamUrl,
        organizerSignatureName: form.organizerSignatureName,
        categories: form.category ? [form.category] : event.categories,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        pageTheme: form.pageTheme,
        allowsChat: form.allowsChat,
        allowsQa: form.allowsQa
      };
      if (form.coverImageUrl) payload.coverImageUrl = form.coverImageUrl;

      await dispatch(updateEvent({ eventId: event._id, payload })).unwrap();
      await dispatch(fetchOrganizerDashboard());
      onClose();
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="event-edit-title"
      closeOnBackdrop={false}
      panelClassName="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[32px] border border-ink/10 bg-white shadow-bloom"
    >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-white px-6 py-4 rounded-t-[32px]">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-reef">Edit Event</p>
            <h2 id="event-edit-title" className="mt-1 font-display text-2xl text-ink">{event.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close event editor"
            className="rounded-full p-2 text-ink/50 hover:bg-sand/80 hover:text-ink"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5 p-6">
          {/* Cover image */}
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-ink/45 mb-2">Cover Image</p>
            <div
              className="relative overflow-hidden rounded-[20px] border-2 border-dashed border-ink/15 bg-sand/50 cursor-pointer"
              onClick={() => coverInputRef.current?.click()}
            >
              {form.coverImageUrl ? (
                <img src={form.coverImageUrl} alt="Cover" className="h-40 w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <svg className="h-8 w-8 text-ink/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm text-ink/45">Click to upload cover image</p>
                </div>
              )}
              {uploadingCover && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                  <p className="text-sm text-reef font-medium">Uploading...</p>
                </div>
              )}
              {form.coverImageUrl && (
                <div className="absolute inset-0 flex items-center justify-center bg-ink/30 opacity-0 hover:opacity-100 transition">
                  <p className="text-sm text-white font-medium">Change cover</p>
                </div>
              )}
            </div>
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
          </div>

          <div className="grid gap-4">
            <div>
              <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Title</label>
              <input
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                required
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Summary</label>
              <input
                value={form.summary}
                onChange={(e) => update('summary', e.target.value)}
                className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                required
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                rows={4}
                className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                required
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Format</label>
                <select
                  value={form.type}
                  onChange={(e) => update('type', e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 focus:border-reef"
                >
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Visibility</label>
                <select
                  value={form.visibility}
                  onChange={(e) => update('visibility', e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 focus:border-reef"
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Starts At</label>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => update('startsAt', e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 focus:border-reef"
                  required
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Ends At</label>
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => update('endsAt', e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 focus:border-reef"
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Venue / Stream</label>
                <input
                  value={form.venueName}
                  onChange={(e) => update('venueName', e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.22em] text-ink/45">City</label>
                <input
                  value={form.city}
                  onChange={(e) => update('city', e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Country</label>
                <input
                  value={form.country}
                  onChange={(e) => update('country', e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Category</label>
                <input
                  value={form.category}
                  onChange={(e) => update('category', e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Tags (comma separated)</label>
                <input
                  value={form.tags}
                  onChange={(e) => update('tags', e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                />
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Stream URL (for online events)</label>
              <input
                value={form.streamUrl}
                onChange={(e) => update('streamUrl', e.target.value)}
                placeholder="https://..."
                className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Certificate signature name</label>
              <input
                value={form.organizerSignatureName}
                onChange={(e) => update('organizerSignatureName', e.target.value)}
                placeholder="Shown on attendance certificates"
                className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
              />
            </div>

            <EventThemeFields
              value={form.pageTheme}
              onChange={(pageTheme) => update('pageTheme', pageTheme)}
            />

            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.allowsChat}
                  onChange={(e) => update('allowsChat', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-ink">Allow chat</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.allowsQa}
                  onChange={(e) => update('allowsQa', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-ink">Allow Q&A</span>
              </label>
            </div>
          </div>

          {error && (
            <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-ink/10 bg-sand px-5 py-3 font-semibold text-ink hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-2xl bg-ink px-5 py-3 font-semibold text-sand disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
    </ModalShell>
  );
};

export default EventEditModal;
