import type { Rule } from 'eslint'
import { TSESTree, ESLintUtils } from '@typescript-eslint/utils';
import { RuleContext, SourceCode } from '@typescript-eslint/utils/ts-eslint';

// import { getConsecutive, isMethod, nodeGroupInfo } from 'src/utils';

/* TYPES */
type Options = [{
  alignTypeDefinitions? : boolean;
  alignFunctionParams?  : boolean;
}]

type MessageIds = 'misalignedKeys' | 'misalignedTypes' | 'misalignedValues';

type Context = Readonly<RuleContext<MessageIds, Options>>

/* UTILITY FUNCTIONS */
export type NodeGroupInfo = {
  accessorLengths   : number[],
  maxAccessorLength : number,
  keyLengths        : number[],
  maxKeyLength      : number,
  typeLengths       : number[],
  maxTypeLength     : number
}

/* UTILITY FUNCTIONS */
// Get consecutive nodes
const defaultGrouping = (curr: TSESTree.Node, prev: TSESTree.Node): boolean => {
  if(curr.type === prev.type)
    return true
  return false
}

export function getConsecutive(
  nodes: TSESTree.Node[],
  grouping: (current: TSESTree.Node, previous: TSESTree.Node) => boolean = defaultGrouping
): TSESTree.Node[][] {
  if(nodes.length === 0 || nodes.length === 1) return [];

  const groups: TSESTree.Node[][] = [];
  let currentGroup: TSESTree.Node[] = [];

  for(let i = 0; i < nodes.length; i++) {
    const currentNode = nodes[i];

    if(currentNode.loc.start.line !== currentNode.loc.end.line){ // Multiline Check
      if(currentGroup.length){
        groups.push(currentGroup)
        currentGroup = []
      }
      continue
    }

    if(i === 0) {
      currentGroup.push(currentNode)
      continue
    }
    
    const previousNode = nodes[i - 1];
    if(currentNode.loc.start.line === previousNode.loc.end.line) continue; // Overlapping Nodes

    if(!grouping(currentNode, previousNode) || currentNode.loc.start.line !== previousNode.loc.end.line + 1) {
      groups.push(currentGroup)
      currentGroup = [currentNode];
      continue;
    }
    currentGroup.push(currentNode);
  }

  groups.push(currentGroup)
  return groups;
}

// Check if PropertySignature is defining a function
export function isMethod(node: TSESTree.TSPropertySignature): boolean {
  if(!node.typeAnnotation)
    return false
  if(node.typeAnnotation.typeAnnotation.type === 'TSFunctionType')
    return true
  return false
}

// Get node group length informations
export function nodeGroupInfo(context: Context, nodes: TSESTree.Node[]): NodeGroupInfo {
  let accessorLengths   : number[]      = [],
      maxAccessorLength : number        = 0,
      keyLengths        : number[]      = [],
      maxKeyLength      : number        = 0,
      typeLengths       : number[]      = [],
      maxTypeLength     : number        = 0

  nodes.forEach((node, i) => {
    let nodeContent = context.sourceCode.getText(node)

    if(node.type === 'TSParameterProperty'){
      const accessor = nodeContent.slice(0, node.parameter.range[0] - node.range[0]).trim()
      accessorLengths.push(accessor.length)
      if(accessor.length > maxAccessorLength)
        maxAccessorLength = accessor.length
      node = node.parameter;
      nodeContent = context.sourceCode.getText(node)
    }

    let key = '', type = ''
    if(node.type === 'Identifier' || node.type === 'RestElement'){
      if(node.typeAnnotation)
        key = nodeContent.slice(0, node.typeAnnotation.range[0] - node.range[0]).trim()
      else key = nodeContent.slice(0, node.range[1] - node.range[0]).trim()
    }
    if(node.type === 'AssignmentPattern'){
      if(node.left.typeAnnotation){
        key = nodeContent.slice(0, node.left.typeAnnotation.range[0] - node.left.range[0]).trim()
        type = nodeContent.slice(node.left.typeAnnotation.range[0] - node.left.range[0], node.left.typeAnnotation.range[1] - node.left.range[0]).trim()
      } else {
        key = nodeContent.slice(0, node.left.range[1] - node.left.range[0]).trim()
        type = ''
      }
    }

    keyLengths.push(key.length)
    if(key.length > maxKeyLength)
        maxKeyLength = key.length

    typeLengths.push(type.length)
    if(type.length > maxTypeLength)
        maxTypeLength = type.length
    
  })

  return { accessorLengths, maxAccessorLength, keyLengths, maxKeyLength, typeLengths, maxTypeLength }
}

/* RULE DEFINITION */
const createRule = ESLintUtils.RuleCreator(
  name => `https://github.com/missingcodec/eslint-plugin/blob/main/docs/${name}.md`
);

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
          alignTypeDefinitions: { type: 'boolean' },
          alignFunctionParams: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      'misalignedKeys': 'Parameter keys must be aligned.',
      'misalignedTypes': 'Type annotations must be aligned.',
      'misalignedValues': 'Default value declarations must be aligned.'
    },
  },
  defaultOptions: [
      {
        alignTypeDefinitions: true,
        alignFunctionParams: true,
      }
  ],
  create(context, [options]){

    function alignTypeDefinitions(nodes : TSESTree.Node[]){
      const properties = nodes.filter(node => node.type === 'TSPropertySignature' && !isMethod(node))
      const propGroups = getConsecutive(properties) as TSESTree.TSPropertySignature[][];

      for(const group of propGroups) {
        if(group.length === 1) continue;

        const lengths = group.map(node => {
          if(node.typeAnnotation){
            const endRange = node.typeAnnotation.range[0] - node.typeAnnotation.range[1];
            const nodeContent = context.sourceCode.getText(node, 0, endRange).trim();
            return nodeContent.length;
          }
          return node.range[1] - node.range[0]
        })
        const maxLength = Math.max(...lengths)

        group.forEach((node, i) => {
          if(!node.typeAnnotation) return;
          
          const expectedSpacing = maxLength - lengths[i] + 1
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
      const grouping = (curr: TSESTree.Node, prev: TSESTree.Node): boolean => {
        if(curr.type === 'RestElement' && prev.type !== 'TSParameterProperty' || curr.type === prev.type)
          return true
        return false
      }
      const paramGroups = getConsecutive(nodes, grouping);

      for (const group of paramGroups) {
        if (group.length === 1) continue;

        const groupInfo = nodeGroupInfo(context, group)
        group.forEach((node, i) => {
          if(node.type === 'TSParameterProperty'){
            const expectedAccessorSpacing = groupInfo.maxAccessorLength - groupInfo.accessorLengths[i] + 1
            const actualAccessorSpacing = node.parameter.range[0] - node.range[0] - groupInfo.accessorLengths[i]
            
            if(actualAccessorSpacing !== expectedAccessorSpacing){
              const newSpacing = ' '.repeat(expectedAccessorSpacing);
              const replaceRange = [node.range[0] + groupInfo.accessorLengths[i], node.parameter.range[0]] as readonly [number, number]
              context.report({
                node: node,
                messageId: 'misalignedKeys',
                fix(fixer){
                  return fixer.replaceTextRange(replaceRange, newSpacing)
                }
              })
            }
            node = node.parameter
          }

          if(node.type === 'Identifier' || node.type === 'RestElement'){
            if(!node.typeAnnotation) return;
            const expectedKeySpacing = groupInfo.maxKeyLength - groupInfo.keyLengths[i] + 1
            const actualKeySpacing = node.typeAnnotation.range[0] - node.range[0] - groupInfo.keyLengths[i]

            if(actualKeySpacing !== expectedKeySpacing){
              const newSpacing = ' '.repeat(expectedKeySpacing);
              const replaceRange = [node.range[0] + groupInfo.keyLengths[i], node.typeAnnotation.range[0]] as readonly [number, number]
              context.report({
                node: node,
                messageId: 'misalignedTypes',
                fix(fixer){
                  return fixer.replaceTextRange(replaceRange, newSpacing)
                }
              })
            }
          }

          else if(node.type === 'AssignmentPattern'){
            if(node.left.typeAnnotation){
              const expectedKeySpacing = groupInfo.maxKeyLength - groupInfo.keyLengths[i] + 1
              const actualKeySpacing = node.left.typeAnnotation.range[0] - node.range[0] - groupInfo.keyLengths[i]

              if(actualKeySpacing !== expectedKeySpacing){
                const newSpacing = ' '.repeat(expectedKeySpacing);
                const replaceRange = [node.range[0] + groupInfo.keyLengths[i], node.left.typeAnnotation.range[0]] as readonly [number, number]
                context.report({
                  node: node,
                  messageId: 'misalignedTypes',
                  fix(fixer){
                    return fixer.replaceTextRange(replaceRange, newSpacing)
                  }
                })
              }
            }

            const expectedTypeSpacing = groupInfo.maxTypeLength - groupInfo.typeLengths[i] + 1
            const equalToken = context.sourceCode.getTokenBefore(node.right)
            const actualTypeSpacing = equalToken!.range[0] - node.left.range[1]

            if(actualTypeSpacing !== expectedTypeSpacing){
              const newSpacing = ' '.repeat(expectedTypeSpacing);
              const replaceRange = [node.left.range[1], equalToken!.range[0]] as readonly [number, number]
              context.report({
                node: node,
                messageId: 'misalignedTypes',
                fix(fixer){
                  return fixer.replaceTextRange(replaceRange, newSpacing)
                }
              })
            }
          }
        })
      }
    }

    return {
      TSInterfaceBody(node) {
        if (options.alignTypeDefinitions) {
          alignTypeDefinitions(node.body)
        }
      },

      TSTypeLiteral(node) {
        if (options.alignTypeDefinitions) {
          alignTypeDefinitions(node.members)
        }
      },

      TSMethodSignature(node) {
        if (options.alignTypeDefinitions) {
          alignFunctionParams(node.params)
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
    }
  }
}) as any as Rule.RuleModule

export default typeAlignment