import tseslint from 'typescript-eslint'
import missingcodec from './eslintt/index.js'
import plugin from './dist/index.js'

export default [
  ...missingcodec(),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      sourceType: 'module',
      parser: tseslint.parser,
    },
    plugins: {
      noa: plugin,
    },
    rules: {
      'ts/consistent-type-definitions': 'off',
      'style/type-annotation-spacing': 'off',
      'style/key-spacing'               : ['warn', {
        beforeColon : true,
        afterColon  : true,
        mode        : 'minimum',
      }],
      'noa/consistent-type-definitions': 'warn',
      'noa/type-annotation-spacing': 'warn',
      'noa/vertical-alignment': 'warn',
    },
  },
]
