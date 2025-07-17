import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils'

import { createRule } from '../utils'

export default createRule({
  name : 'consistent-type-definitions',
  meta : {
    type : 'suggestion',
    docs : {
      description : 'Enforces the use TYPE instead of INTERFACE unless the type contains a method.',
    },
    fixable : 'code',
    schema  : [],
    messages : {
      useType      : 'use `Type` instead of `Interface`',
      useInterface : 'use `Interface` instead of `Type`',
    },
  },
  defaultOptions : [],
  create(context) {
    function containsMethod(nodes : TSESTree.Node[]) : boolean {
      return nodes.some(
        node => node.type === AST_NODE_TYPES.TSMethodSignature 
          || node.type === AST_NODE_TYPES.TSCallSignatureDeclaration 
          || node.type === AST_NODE_TYPES.TSConstructSignatureDeclaration,
      )
    }

    return {
      TSTypeAliasDeclaration(node) {
        if (
          node.typeAnnotation.type === AST_NODE_TYPES.TSTypeLiteral
          && containsMethod(node.typeAnnotation.members)
        ) {
          context.report({
            node      : node.id,
            messageId : 'useInterface',
            fix(fixer) {
              const typeToken = context.sourceCode.getTokenBefore(
                node.id,
                token => token.value === 'type',
              )!

              const equalToken = context.sourceCode.getTokenBefore(
                node.typeAnnotation,
                token => token.value === '=',
              )!

              const beforeEqualToken = context.sourceCode.getTokenBefore(equalToken, {
                includeComments : true,
              })!

              return [
                fixer.replaceText(typeToken, 'interface'),
                fixer.replaceTextRange([
                  beforeEqualToken.range[1],
                  node.typeAnnotation.range[0],
                ], ' '),
                fixer.removeRange([
                  node.typeAnnotation.range[1],
                  node.range[1],
                ]),
              ]
            },
          })
        }
      },
       
      TSInterfaceDeclaration(node) {
        if (!containsMethod(node.body.body)) {
          context.report({
            node      : node.id,
            messageId : 'useType',
            fix(fixer) {
              const interfaceToken = context.sourceCode.getTokenBefore(
                node.id,
                token => token.value === 'interface',
              )!

              const beforeBodyToken = context.sourceCode.getTokenBefore(node.body, {
                includeComments : true,
              })!

              return [
                fixer.replaceText(interfaceToken, 'type'),
                fixer.replaceTextRange([
                  beforeBodyToken.range[1],
                  node.body.range[0],
                ], ' = '),
                fixer.removeRange([
                  node.body.range[1],
                  node.range[1],
                ]),
              ]
            },
          })
        }
      },
    }
  },
})
