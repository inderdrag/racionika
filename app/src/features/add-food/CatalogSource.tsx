import { catalogSourceUrl, type CatalogSource as Source } from '../../core/catalog/types';
export function CatalogSource({ source }: { source: Source }) {
  return (
    <details className="catalog-source">
      <summary>
        {source.provider === 'usda' ? 'Источник: USDA' : 'Источник: Open Food Facts'}
      </summary>
      <p>{source.description}</p>
      <p className="subtle">
        {source.release} · ID {source.id}
      </p>
      <a href={catalogSourceUrl(source)} target="_blank" rel="noopener noreferrer">
        Открыть источник ↗
      </a>
    </details>
  );
}
