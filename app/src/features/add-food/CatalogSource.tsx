import reviewed from '../../core/catalog/usda.json';
import { catalogSourceUrl, type CatalogSource as Source } from '../../core/catalog/types';
const reviewedIds = new Set(reviewed.map((p) => p.source.id));
export function CatalogSource({ source }: { source: Source }) {
  return (
    <details className="catalog-source">
      <summary>
        {source.provider === 'usda' ? 'Источник: USDA' : 'Источник: Open Food Facts'}
      </summary>
      <p>{source.description}</p>
      {source.provider === 'usda' && !reviewedIds.has(source.id) && (
        <p className="subtle">Название переведено автоматически. Сверяйте оригинал.</p>
      )}
      <p className="subtle">
        {source.release} · ID {source.id}
      </p>
      <a href={catalogSourceUrl(source)} target="_blank" rel="noopener noreferrer">
        Открыть источник ↗
      </a>
    </details>
  );
}
