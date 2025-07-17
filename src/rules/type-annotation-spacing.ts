import { createRule } from '../utils'

export default createRule({
  name : 'type-annotation-spacing',
  meta: {
    type : 'layout',
    docs : {
      description : 'Enforces the use of 1 space after the type annotation colon and a minimum of 1 space before that.',
    },
    fixable : 'whitespace',
    schema  : [],
    messages: {
      expectedSpaceBefore   : 'Expected a space before the `{{ type }}`.',
      unexpectedSpaceBefore : 'Unexpected space before the `{{ type }}`.',
      expectedSpaceAfter    : 'Expected a space after the `{{ type }}`.',
      unexpectedSpaceAfter  : 'Unexpected space after the `{{ type }}`.',
    },
  },
  defaultOptions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            : [],
  create(context) {
    return {
      TSTypeAnnotation(node) {
        /**
        * punctuator token before the actual type annotation
        * it's value is either `:` or `=>`
        */
        const punctuatorToken = context.sourceCode.getTokenBefore(
          node.typeAnnotation,
          token => token.value === ':' || token.value === '=>',
        )!

        /**
        * the token that comes before the punctuator
        * could be the node's id or something like the optional operator `?`
        */
        const beforeToken = context.sourceCode.getTokenBefore(punctuatorToken, {
          includeComments : true,
        })!

        const punctuator = punctuatorToken.value
        const spacesBefore = punctuatorToken.range[0] - beforeToken.range[1]
        const spacesAfter = node.typeAnnotation.range[0] - punctuatorToken.range[1]

        if (punctuatorToken.value === ':' && spacesBefore === 0) {
          context.report({
            node      : punctuatorToken,
            messageId : 'expectedSpaceBefore',
            data      : { type : punctuator },
            fix(fixer) {
              return fixer.replaceTextRange([
                beforeToken.range[1],
                punctuatorToken.range[0],
              ], ' ')
            },
          })
        }

        if (punctuatorToken.value === '=>' && spacesBefore !== 1) {
          context.report({
            node      : punctuatorToken,
            messageId : spacesBefore === 0 ? 'expectedSpaceBefore' : 'unexpectedSpaceBefore',
            data      : { type : punctuator },
            fix(fixer) {
              return fixer.replaceTextRange([
                beforeToken.range[1],
                punctuatorToken.range[0],
              ], ' ')
            },
          })
        }

        if (spacesAfter !== 1) {
          context.report({
            node      : punctuatorToken,
            messageId : spacesAfter === 0 ? 'expectedSpaceAfter' : 'unexpectedSpaceAfter',
            data      : { type : punctuator },
            fix(fixer) {
              return fixer.replaceTextRange([
                punctuatorToken.range[1],
                node.typeAnnotation.range[0],
              ], ' ')
            },
          })
        }
      },
    }
  },
})
