export async function compressPhoto(source: string, maxDimension: number): Promise<string> {
  // Перерисовка в canvas: в выходном JPEG нет исходных EXIF/геометок.
  const image = new Image();
  image.src = source;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight)
    throw new Error('Не удалось открыть фото. Используйте JPEG, PNG или WebP.');
  const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не удалось обработать фото.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let data = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
  if (data.length * 0.75 > 1572864) data = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
  if (data.length * 0.75 > 1572864)
    throw new Error('Фото слишком большое. Выберите меньший размер.');
  return data;
}
export async function hashAnalysis(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
