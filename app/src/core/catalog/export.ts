import { catalog } from './index';
import manifest from '../../../../scripts/catalog/ru-manifest.json';
/** Includes only the redistributed reference partition, never profile or diary data. */
export function exportOpenFoodFactsCatalog() {
  return JSON.stringify(
    {
      format: 'racionika-openfoodfacts-ru-v1',
      attribution: 'Contains data from Open Food Facts, available under the Open Database License.',
      license: 'https://opendatacommons.org/licenses/odbl/1-0/',
      contentsLicense: 'https://opendatacommons.org/licenses/dbcl/1-0/',
      source: manifest.source,
      products: catalog.filter((p) => p.source.provider === 'off'),
    },
    null,
    2,
  );
}
