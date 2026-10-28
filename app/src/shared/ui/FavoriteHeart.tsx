import { useState } from 'react';
import type { FoodEntry, FavoriteDish } from '../../core/db';
import { favoriteKey, toggleFavorite } from '../../core/favorites';
export function FavoriteHeart({
  entry,
  favorites,
  disabled = false,
}: {
  entry: FoodEntry;
  favorites: FavoriteDish[];
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const liked = favorites.some((f) => favoriteKey(f.entry) === favoriteKey(entry));
  return (
    <span className="favorite-control">
      <button
        type="button"
        className="favorite-heart"
        aria-label={`${liked ? 'Убрать из избранного' : 'Добавить в избранное'}: ${entry.name}`}
        aria-pressed={liked}
        disabled={disabled || busy || !Number.isFinite(entry.grams) || entry.grams < 1}
        title={liked ? 'Убрать из избранного' : 'В избранное'}
        onClick={(event) => {
          event.stopPropagation();
          setBusy(true);
          setError('');
          void toggleFavorite(entry)
            .catch(() => setError('Не удалось изменить избранное.'))
            .finally(() => setBusy(false));
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.8"
          fill={liked ? 'currentColor' : 'none'}
          aria-hidden="true"
        >
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
        </svg>
      </button>
      {error && (
        <small role="alert" className="favorite-error">
          {error}
        </small>
      )}
    </span>
  );
}
