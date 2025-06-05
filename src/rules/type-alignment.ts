import type { Rule } from 'eslint'
import { TSESTree, ESLintUtils } from '@typescript-eslint/utils';
import { getConsecutive } from 'src/utils';

const createRule = ESLintUtils.RuleCreator(
  name => `https://github.com/missingcodec/eslint-plugin/blob/main/docs/${name}.md`
);

type FuncParamTypes = TSESTree.Identifier | TSESTree.AssignmentPattern | TSESTree.RestElement | TSESTree.BindingName

type Options = [{
  alignInterfaces?     : boolean;
  alignTypeAliases?    : boolean;
  alignFunctionParams? : boolean;
  // alignClassProperties?: boolean,
  // alignVariableDeclarations?: boolean;
}]

type MessageIds = 'misalignedTypes' | 'misalignedValues';

const typeAlignment = createRule<Options, MessageIds>({
  name: 'type-alignment',
  meta: {
    type: 'layout',
    docs: {
      description: 'Type annotations should be aligned vertically'
    },
    fixable: 'whitespace',
    schema: [
      {
        type: 'object',
        properties: {
          alignInterfaces: { type: 'boolean' },
          alignTypeAliases: { type: 'boolean' },
          alignFunctionParams: { type: 'boolean' },
          // alignClassProperties: { type: 'boolean' },
          // alignVariableDeclarations: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      'misalignedTypes': 'Type annotations must be aligned.',
      'misalignedValues': 'Default value declarations must be aligned.'
    },
  },
  defaultOptions: [
      {
        alignInterfaces: true,
        alignTypeAliases: true,
        alignFunctionParams: true,
        // alignClassProperties: true,
        // alignVariableDeclarations: true,
      }
  ],
  create(context, [options]){

    function alignTypeDefinitions(nodes : TSESTree.Node[]){
      const properties = nodes.filter(node => node.type === 'TSPropertySignature')
      const propGroups = getConsecutive(properties) as TSESTree.TSPropertySignature[][];

      for(const group of propGroups) {
        if(group.length === 1) continue;

        const lengths = group.map(node => {
          if(node.typeAnnotation){
            const endRange = node.typeAnnotation.range[0] - node.typeAnnotation.range[1] - 1;
            const nodeContent = context.sourceCode.getText(node, 0, endRange).trim();
            return nodeContent.length;
          }
          return node.range[1] - node.range[0]
        })
        const maxLength = Math.max(...lengths)

        group.forEach((node, i) => {
          if(!node.typeAnnotation) return;
          
          const expectedSpacing = maxLength - lengths[i] + 1
          const colonToken = context.sourceCode.getTokenBefore(node.typeAnnotation!)
          const actualSpacing = node.typeAnnotation.range[0] - (node.range[0] + lengths[i])

          if(actualSpacing !== expectedSpacing){
            context.report({
              node: node.typeAnnotation,
              messageId: 'misalignedTypes',
              fix(fixer){
                const newSpacing = ' '.repeat(expectedSpacing);
                return fixer.replaceTextRange(
                  [node.range[0] + lengths[i], node.typeAnnotation!.range[0]],
                  newSpacing
                )
              }
            })
          }
        })
      }
    }

    function alignFunctionParams(nodes : TSESTree.Node[]) {
      const paramGroups = getConsecutive(nodes);

      for(const group of paramGroups){
        if(group.length === 1) continue;

        const keyLengths = group.map(node => {
          if (node.type === 'Identifier')
            return node.name.length
          else if (node.type === 'AssignmentPattern' && node.left.type === 'Identifier')
            return node.left.name.length
          else if (node.type === 'RestElement' && node.argument.type === 'Identifier')
            return node.argument.name.length + 3
          // else if (node.type === 'TSParameterProperty' && node.parameter.type === 'Identifier')
          else
            return 0;
        })

        const typeLengths = group.map(node => {
          if (node.type === 'AssignmentPattern' && node.left.type === 'Identifier' && node.left.typeAnnotation)
            return node.left.typeAnnotation.typeAnnotation.range[1] - node.left.typeAnnotation.typeAnnotation.range[0]
          else 
            return 0;
        })

        const maxKeyLength = Math.max(...keyLengths);
        const maxTypeLength = Math.max(...typeLengths);

        group.forEach((node, i) => {
          if(!keyLengths[i]) return;

          let typeAnnotation: TSESTree.TSTypeAnnotation
          let keySpacing: number
          let typeSpacing: number = 0

          if(node.type === 'Identifier' || node.type === 'RestElement') {
            if(!node.typeAnnotation) return;
            typeAnnotation = node.typeAnnotation!
          }
          if(node.type === 'AssignmentPattern') {
            if(!node.left.typeAnnotation) return;
            typeAnnotation = node.left.typeAnnotation!
            typeSpacing = node.right.range[0] - typeAnnotation.range[1] - 2
          }
          
          keySpacing = typeAnnotation!.range[0] - node.range[0] - keyLengths[i]
          const expectedKeySpacing = maxKeyLength - keyLengths[i] + 1
          const expectedTypeSpacing = maxTypeLength - typeLengths[i] + 1

          if(keySpacing !== expectedKeySpacing){
            context.report({
              node: typeAnnotation!,
              messageId: 'misalignedTypes',
              fix(fixer){
                const newSpacing = ' '.repeat(expectedKeySpacing);
                const colonToken = context.sourceCode.getTokenBefore(typeAnnotation!)
                return fixer.replaceTextRange(
                  [colonToken!.range[1], typeAnnotation!.range[0]],
                  newSpacing
                )
              }
            })
          }

          if(node.type === 'AssignmentPattern' && typeSpacing !== expectedTypeSpacing){
            context.report({
              node: typeAnnotation!,
              messageId: 'misalignedValues',
              fix(fixer){
                const newSpacing = ' '.repeat(expectedTypeSpacing);
                const equalToken = context.sourceCode.getTokenAfter(typeAnnotation!)
                return fixer.replaceTextRange(
                  [typeAnnotation!.range[1], equalToken!.range[0]],
                  newSpacing
                )
              }
            })
          }
        })
      }
    }

    

    return {
      TSInterfaceBody(node) {
        if (options.alignInterfaces) {
          alignTypeDefinitions(node.body)
        }
      },

      TSTypeLiteral(node) {
        if (options.alignTypeAliases) {
          alignTypeDefinitions(node.members)
        }
      },

      FunctionDeclaration(node) {
        if (options.alignFunctionParams) {
          alignFunctionParams(node.params)
        }
      },

      FunctionExpression(node) {
        if (options.alignFunctionParams) {
          alignFunctionParams(node.params)
        }
      },

      ArrowFunctionExpression(node) {
        if (options.alignFunctionParams) {
          alignFunctionParams(node.params)
        }
      },

      // ClassBody(node) {
      //   if (options.alignClassProperties){
      //     alignClassProperties(node.body)
      //   }
      // }
    }
  }
}) as any as Rule.RuleModule

export default typeAlignment