import tseslint from 'typescript-eslint';
import missingcodec from './dist/index.js';

export default tseslint.config(
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      sourceType: 'module',
      parser: tseslint.parser
    },
    plugins: {
      'noa': missingcodec
    },
    rules: {
      'noa/type-alignment': 'warn'
    }
  }
);