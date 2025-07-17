import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils'

export const createRule = ESLintUtils.RuleCreator(
  name => `https://github.com/missingcodec/eslint-plugin/blob/main/docs/${ name }.md`,
)
