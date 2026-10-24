import type { Tab } from '../../core/navigation';
const paths: Record<Tab | 'plus' | 'drop' | 'arrow' | 'leaf', string> = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  diary: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5',
  coach: 'M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0ZM8 10h8M8 14h5',
  progress: 'M4 3v17h17M7 15l4-5 4 3 6-8',
  settings: 'M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  plus: 'M12 4v16M4 12h16',
  drop: 'M12 2S4 11 4 15a8 8 0 0 0 16 0c0-4-8-13-8-13Z',
  arrow: 'm9 5 7 7-7 7',
  leaf: 'M5 19C1 10 10 3 21 3c0 11-7 20-16 16Zm0 0L16 8',
};
export function Icon({ name, size = 24 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
