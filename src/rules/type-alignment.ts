import type { Rule } from 'eslint'
import { TSESTree, ESLintUtils } from '@typescript-eslint/utils';
import type { RuleContext, RuleFixer } from '@typescript-eslint/utils/ts-eslint';

// import { getConsecutive, isMethod, nodeGroupInfo } from 'src/utils';

/* TYPES */
type Context = Readonly<RuleContext<MessageIds, Options>>
type MessageIds = 'misalignedKeys' | 'misalignedTypes' | 'misalignedValues';
type Options = [{
  alignTypeDefinitions? : boolean;
  alignFunctionParams?  : boolean;
  alignClassProperties? : boolean;
}]

type TypedNode = TSESTree.Node & { key?: TSESTree.Identifier, typeAnnotation: TSESTree.TSTypeAnnotation }
type InitializedNode = TSESTree.Node & { value: NonNullable<TSESTree.Node> }
type TypedAndInitializedNode = TypedNode & InitializedNode

type AlignmentOptions = {
  messageId     : MessageIds
  desiredColumn : number,
  targetRange   : [number, number],
  padding       : number,
  isValue?      : boolean
}

type NodeGroupInfo = {
  startingColumn    : number,
  keyDesiredCol     : number,
  typeDesiredCol    : number,
  valueDesiredCol   : number,
  accessorLengths   : number[],
  keyLengths        : number[],
  typeLengths       : number[],
  maxAccessorLength : number,
  maxKeyLength      : number,
  maxTypeLength     : number,
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
export function isMethod(node: TSESTree.Node): boolean {
  if(
    node.type === 'TSPropertySignature' &&
    node.typeAnnotation &&
    node.typeAnnotation.typeAnnotation.type === 'TSFunctionType'
  )
    return true
  if(
    node.type === 'PropertyDefinition' &&
    (node.value?.type === 'FunctionExpression' || node.value?.type === 'ArrowFunctionExpression')
  )
    return true
  return false
}

// Get node group length informations
export function nodeGroupInfo(context: Context, nodes: TSESTree.Node[]): NodeGroupInfo {
  let accessorLengths : number[] = [],
      keyLengths      : number[] = [],
      typeLengths     : number[] = []

  let startingColumn = nodes[0].loc.start.column
  let keyDesiredCol = 0, typeDesiredCol = 0, valueDesiredCol = 0
  let maxAccessorLength = 0, maxKeyLength = 0, maxTypeLength = 0

  nodes.forEach((node, i) => {
    let nodeContent = context.sourceCode.getText(node)
    let accessor = '', key = '', type = ''

    if(node.loc.start.column < startingColumn)
      startingColumn = node.loc.start.column

    if(node.type === 'TSParameterProperty'){
      accessor = nodeContent.slice(0, node.parameter.range[0] - node.range[0]).trim()
      node = node.parameter;
      nodeContent = context.sourceCode.getText(node)
    }

    if(node.type === 'PropertyDefinition'){
      accessor = nodeContent.slice(0, node.key.range[0] - node.range[0]).trim()
      key = (node.key as TSESTree.Identifier).name
      
      if(node.typeAnnotation)
        type = nodeContent.slice(node.typeAnnotation.range[0] - node.range[0], node.typeAnnotation.range[1] - node.range[0]).trim()
      else type = ''
    }

    if(node.type === 'Identifier' || node.type === 'RestElement' || node.type === 'TSPropertySignature'){
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

    accessorLengths.push(accessor.length)
    if(accessor.length > maxAccessorLength)
      maxAccessorLength = accessor.length
    
    keyLengths.push(key.length)
    if(key.length > maxKeyLength)
      maxKeyLength = key.length
    
    typeLengths.push(type.length)
    if(type.length > maxTypeLength)
      maxTypeLength = type.length
  })

  keyDesiredCol = maxAccessorLength === 0 ? startingColumn : startingColumn + maxAccessorLength + 1
  typeDesiredCol = maxKeyLength === 0 ? keyDesiredCol : keyDesiredCol + maxKeyLength + 1
  valueDesiredCol = maxTypeLength === 0 ? typeDesiredCol : typeDesiredCol + maxTypeLength + 1

  return { 
    startingColumn,
    keyDesiredCol,
    typeDesiredCol,
    valueDesiredCol,
    accessorLengths,
    keyLengths,
    typeLengths,
    maxAccessorLength,
    maxKeyLength,
    maxTypeLength,
  }
}

// Move node to the desired column
function alignItem(context: Context, node: TSESTree.Node, options: AlignmentOptions): void {
  const target = options.isValue ? context.sourceCode.getTokenBefore(node) : node
  const startingColumn = target!.loc.start.column

  if(startingColumn !== options.desiredColumn){
    context.report({
      node: node,
      messageId: options.messageId,
      fix(fixer: RuleFixer){
        return fixer.replaceTextRange(options.targetRange, ' '.repeat(options.padding))
      }
    })
  }
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
          alignClassProperties: { type: 'boolean' }
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
        alignClassProperties: true
      }
  ],
  create(context, [options]){

    function alignTypeDefinitions(nodes : TSESTree.Node[]){
      const properties = nodes.filter(node => node.type === 'TSPropertySignature' && 'typeAnnotation' in node && !isMethod(node))
      const propGroups = getConsecutive(properties) as TypedNode[][];

      for(const group of propGroups) {
        if(group.length === 1) continue;
        const groupInfo = nodeGroupInfo(context, group)

        group.forEach((node, i) => {
          alignItem(context, node.typeAnnotation, {
            messageId: 'misalignedTypes',
            desiredColumn: groupInfo.typeDesiredCol,
            targetRange: [node.key!.range[1], node.typeAnnotation.range[0]],
            padding: groupInfo.maxKeyLength - groupInfo.keyLengths[i] + 1
          })
        })
      }
    }

    function alignFunctionParams(nodes : TSESTree.Node[]) {
      const paramGroups = getConsecutive(nodes, () => true);
      for (const group of paramGroups) {
        const groupInfo = nodeGroupInfo(context, group)
        group.forEach((node, i) => {

          let keyPadding = 0
          let keyRange: TSESTree.Range = [node.range[0] - node.loc.start.column + groupInfo.startingColumn, node.range[0]]
          let keyDesiredCol = groupInfo.startingColumn

          let typePadding = groupInfo.maxAccessorLength -
                            groupInfo.accessorLengths[i] +
                            groupInfo.maxKeyLength -
                            groupInfo.keyLengths[i] + 2

          if(node.type === 'TSParameterProperty'){
            keyRange = [node.range[0] + groupInfo.accessorLengths[i], node.parameter.range[0]]
            keyDesiredCol = groupInfo.keyDesiredCol
            keyPadding = groupInfo.maxAccessorLength - groupInfo.accessorLengths[i] + 1
            node = node.parameter

            typePadding = groupInfo.maxKeyLength - groupInfo.keyLengths[i] + 1
          }

          let valuePadding = typePadding

          alignItem(context, node, {
            messageId: 'misalignedKeys',
            desiredColumn: keyDesiredCol,
            targetRange: keyRange,
            padding: keyPadding
          })

          const typeNode = node.type === 'AssignmentPattern' && 'typeAnnotation' in node.left
            ? node.left.typeAnnotation 
            : 'typeAnnotation' in node
              ? node.typeAnnotation
              : null

          if(typeNode){
            valuePadding = groupInfo.maxTypeLength - groupInfo.typeLengths[i] + 1
            alignItem(context, typeNode, {
              messageId: 'misalignedTypes',
              desiredColumn: groupInfo.typeDesiredCol,
              targetRange: [node.range[0] + groupInfo.keyLengths[i], typeNode.range[0]],
              padding: typePadding
            })
          }

          if(node.type === 'AssignmentPattern'){
            const valueLoc = node.left.typeAnnotation ? groupInfo.valueDesiredCol : groupInfo.typeDesiredCol
            const startIndex = node.left.range[1]
            const endIndex = context.sourceCode.getTokenBefore(node.right)!.range[0]

            alignItem(context, node.right, {
              messageId: 'misalignedTypes',
              desiredColumn: valueLoc,
              targetRange: [startIndex, endIndex],
              padding: valuePadding,
              isValue: true
            })
          }
        })
      }
    }

    function alignClassProperties(nodes : TSESTree.Node[]) {
      //Aligning All Property Keys
      const properties = nodes.filter(node => node.type === 'PropertyDefinition' && !isMethod(node))
      let propGroups = getConsecutive(properties, () => true) as TSESTree.PropertyDefinition[][];

      for(const group of propGroups){
        const groupInfo = nodeGroupInfo(context, group)
        group.forEach((node,i) => {
          let keyPadding = groupInfo.maxAccessorLength - groupInfo.accessorLengths[i] + 1
          let typePadding = groupInfo.maxKeyLength - groupInfo.keyLengths[i] + 1
          let keyRange: TSESTree.Range = [node.range[0] + groupInfo.accessorLengths[i], node.key.range[0]]
          let keyDesiredCol = groupInfo.keyDesiredCol
          if(groupInfo.accessorLengths[i] === 0){
            keyRange = [node.key.range[0] - node.loc.start.column + groupInfo.startingColumn, node.key.range[0]]
            keyDesiredCol = groupInfo.startingColumn
            typePadding += keyPadding
            keyPadding = 0
          }
          let valuePadding = typePadding

          alignItem(context, node.key, {
            messageId: 'misalignedKeys',
            desiredColumn: keyDesiredCol,
            targetRange: keyRange,
            padding: keyPadding
          })
 
          if(node.typeAnnotation){
            valuePadding = groupInfo.maxTypeLength - groupInfo.typeLengths[i] + 1
            alignItem(context, node.typeAnnotation, {
              messageId: 'misalignedTypes',
              desiredColumn: groupInfo.typeDesiredCol,
              targetRange: [node.key.range[1], node.typeAnnotation.range[0]],
              padding: typePadding
            })
          }

          if(node.value !== null) {
            const valueLoc = node.typeAnnotation ? groupInfo.valueDesiredCol : groupInfo.typeDesiredCol
            const startIndex = node.typeAnnotation ? node.typeAnnotation.range[1] : node.key.range[1]
            const endIndex = context.sourceCode.getTokenBefore(node.value)!.range[0]

            alignItem(context, node.value, {
              messageId: 'misalignedValues',
              desiredColumn: valueLoc,
              targetRange: [startIndex, endIndex],
              padding: valuePadding,
              isValue: true
            })
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

      TSFunctionType(node) {
        if (options.alignFunctionParams) {
          alignFunctionParams(node.params)
        }
      },

      ClassBody(node){
        if (options.alignClassProperties) {
          alignClassProperties(node.body)
        }
      }
    }
  }
}) as unknown as Rule.RuleModule

export default typeAlignment