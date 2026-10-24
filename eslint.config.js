import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'app/android/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  { files: ['**/*.cjs'], languageOptions: { globals: { module: 'readonly' } } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['app/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: hooks.configs.recommended.rules,
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly' },
    },
  },
);
