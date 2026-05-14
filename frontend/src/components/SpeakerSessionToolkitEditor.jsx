import { formatDate } from '../lib/formatters';

const RESOURCE_TYPE_OPTIONS = [
  'resource',
  'deck',
  'brief',
  'worksheet',
  'slides',
  'doc',
  'video',
  'link'
];

const createDraftId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const createEmptyChecklistItem = () => ({
  itemId: createDraftId('chk'),
  label: '',
  completed: false
});

const createEmptyResource = (type = 'resource') => ({
  resourceId: createDraftId('res'),
  label: '',
  url: '',
  type
});

const ChecklistEditor = ({ title, items = [], onChange, readOnly = false }) => {
  const updateItem = (index, key, value) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)));
  };

  return (
    <div className="space-y-3 rounded-2xl border border-ink/10 bg-white/85 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onChange([...(items || []), createEmptyChecklistItem()])}
            className="rounded-full border border-ink/10 bg-sand px-3 py-1.5 text-xs font-semibold text-ink/60 hover:border-reef/20 hover:text-reef"
          >
            Add item
          </button>
        )}
      </div>

      {items.length === 0 && (
        <p className="text-sm text-ink/45">
          {readOnly ? 'No checklist items yet.' : 'Add the rehearsal steps speakers should clear before stage time.'}
        </p>
      )}

      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item.itemId || `${title}-${index}`} className="flex items-center gap-3 rounded-2xl bg-sand/70 px-3 py-3">
            <input
              type="checkbox"
              checked={Boolean(item.completed)}
              disabled={readOnly}
              onChange={(eventInput) => updateItem(index, 'completed', eventInput.target.checked)}
              className="h-4 w-4 rounded border-ink/20 text-reef focus:ring-reef"
            />
            {readOnly ? (
              <p className={`flex-1 text-sm ${item.completed ? 'text-ink/80 line-through' : 'text-ink/65'}`}>
                {item.label || 'Untitled step'}
              </p>
            ) : (
              <input
                value={item.label || ''}
                onChange={(eventInput) => updateItem(index, 'label', eventInput.target.value)}
                placeholder="Checklist item"
                className="flex-1 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-reef"
              />
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                className="rounded-full border border-ember/20 bg-ember/5 px-2.5 py-1 text-[11px] font-semibold text-ember hover:bg-ember/10"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const ResourceListEditor = ({
  title,
  items = [],
  onChange,
  readOnly = false,
  emptyMessage = 'No links added yet.'
}) => {
  const updateItem = (index, key, value) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)));
  };

  return (
    <div className="space-y-3 rounded-2xl border border-ink/10 bg-white/85 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onChange([...(items || []), createEmptyResource()])}
            className="rounded-full border border-ink/10 bg-sand px-3 py-1.5 text-xs font-semibold text-ink/60 hover:border-reef/20 hover:text-reef"
          >
            Add link
          </button>
        )}
      </div>

      {items.length === 0 && (
        <p className="text-sm text-ink/45">{emptyMessage}</p>
      )}

      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={item.resourceId || `${title}-${index}`} className="space-y-3 rounded-2xl bg-sand/70 px-3 py-3">
            {readOnly ? (
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-reef hover:underline"
                >
                  {item.label || item.url}
                </a>
                <span className="rounded-full border border-ink/10 bg-white px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-ink/45">
                  {item.type || 'resource'}
                </span>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-[1fr,1.2fr,0.75fr]">
                  <input
                    value={item.label || ''}
                    onChange={(eventInput) => updateItem(index, 'label', eventInput.target.value)}
                    placeholder="Label"
                    className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-reef"
                  />
                  <input
                    value={item.url || ''}
                    onChange={(eventInput) => updateItem(index, 'url', eventInput.target.value)}
                    placeholder="https://..."
                    className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-reef"
                  />
                  <select
                    value={item.type || 'resource'}
                    onChange={(eventInput) => updateItem(index, 'type', eventInput.target.value)}
                    className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-reef"
                  >
                    {RESOURCE_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                    className="rounded-full border border-ember/20 bg-ember/5 px-2.5 py-1 text-[11px] font-semibold text-ember hover:bg-ember/10"
                  >
                    Remove
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const SpeakerSessionToolkitEditor = ({
  session,
  onChange,
  onSave,
  saving = false,
  readOnly = false
}) => {
  const updateField = (key, value) => onChange({ ...session, [key]: value });

  return (
    <div className="space-y-4 rounded-[28px] border border-ink/10 bg-sand/55 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-display text-2xl text-ink">{session.title}</p>
          <p className="mt-1 text-sm text-ink/55">
            {[session.roomLabel, session.startsAt ? formatDate(session.startsAt) : '']
              .filter(Boolean)
              .join(' · ')}
          </p>
          {session.speakerNames?.length > 0 && (
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink/40">
              {session.speakerNames.join(' · ')}
            </p>
          )}
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onSave(session)}
            disabled={saving}
            className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-sand disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save session'}
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-ink/10 bg-white/85 p-4">
          <p className="text-sm font-semibold text-ink">Deck link</p>
          {readOnly ? (
            session.deckUrl ? (
              <a href={session.deckUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-reef hover:underline">
                Open deck
              </a>
            ) : (
              <p className="text-sm text-ink/45">No deck link added yet.</p>
            )
          ) : (
            <input
              value={session.deckUrl || ''}
              onChange={(eventInput) => updateField('deckUrl', eventInput.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-ink/10 bg-sand px-3 py-2 text-sm outline-none focus:border-reef"
            />
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-ink/10 bg-white/85 p-4">
          <p className="text-sm font-semibold text-ink">Speaker prep notes</p>
          {readOnly ? (
            <p className="text-sm leading-6 text-ink/62">
              {session.speakerPrepNotes || 'No prep notes added yet.'}
            </p>
          ) : (
            <textarea
              value={session.speakerPrepNotes || ''}
              onChange={(eventInput) => updateField('speakerPrepNotes', eventInput.target.value)}
              rows={4}
              placeholder="Notes for intros, timing, AV, or talk flow..."
              className="w-full rounded-xl border border-ink/10 bg-sand px-3 py-3 text-sm outline-none focus:border-reef"
            />
          )}
        </div>
      </div>

      <ChecklistEditor
        title="Rehearsal checklist"
        items={session.rehearsalChecklist || []}
        onChange={(nextChecklist) => updateField('rehearsalChecklist', nextChecklist)}
        readOnly={readOnly}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <ResourceListEditor
          title="Working resources"
          items={session.resourceLinks || []}
          onChange={(nextResources) => updateField('resourceLinks', nextResources)}
          readOnly={readOnly}
          emptyMessage="Add talk briefs, worksheets, or reference links for the stage team."
        />
        <ResourceListEditor
          title="Post-session resources"
          items={session.postSessionResources || []}
          onChange={(nextResources) => updateField('postSessionResources', nextResources)}
          readOnly={readOnly}
          emptyMessage="Share slides, worksheets, or follow-up links attendees can open after the talk."
        />
      </div>
    </div>
  );
};

export default SpeakerSessionToolkitEditor;
