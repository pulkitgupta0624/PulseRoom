const STAR_IDS = [1, 2, 3, 4, 5];

const StarRatingInput = ({ value, onChange, size = 'md', label = 'Star rating' }) => {
  const iconClassName = size === 'lg' ? 'h-8 w-8' : 'h-6 w-6';

  return (
    <div aria-label={label} className="flex items-center gap-1">
      {STAR_IDS.map((rating) => {
        const active = rating <= value;
        return (
          <button
            key={rating}
            type="button"
            onClick={() => onChange(rating)}
            aria-label={`${rating} star${rating === 1 ? '' : 's'}`}
            className={`rounded-full p-1 transition focus:outline-none focus:ring-2 focus:ring-reef/40 ${
              active ? 'text-amber-500' : 'text-ink/20 hover:text-amber-400'
            }`}
          >
            <svg className={iconClassName} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.148 3.53a1 1 0 00.95.69h3.708c.969 0 1.371 1.24.588 1.81l-3 2.18a1 1 0 00-.364 1.118l1.146 3.53c.3.922-.755 1.688-1.54 1.118l-3-2.18a1 1 0 00-1.176 0l-3 2.18c-.784.57-1.838-.196-1.539-1.118l1.145-3.53a1 1 0 00-.363-1.118l-3-2.18c-.784-.57-.38-1.81.588-1.81h3.708a1 1 0 00.95-.69l1.147-3.53z" />
            </svg>
          </button>
        );
      })}
    </div>
  );
};

export default StarRatingInput;
