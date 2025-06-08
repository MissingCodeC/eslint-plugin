import type { ESLint } from 'eslint'
import typeAlignment from './rules/type-alignment'

const plugin = {
  meta: {
    name    : '@missingcodec/eslint-plugin',
    version : '1.0.0',
  },
  rules: {
    'type-alignment': typeAlignment,
  }
} satisfies ESLint.Plugin

export default plugin