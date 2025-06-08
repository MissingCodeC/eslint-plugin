import type { Rule } from 'eslint'
import { TSESTree, ESLintUtils } from '@typescript-eslint/utils';
import type { RuleContext, RuleFixer } from '@typescript-eslint/utils/ts-eslint';

// import { getConsecutive, isMethod, nodeGroupInfo } from 'src/utils';

/* TYPES */
type Context = Readonly<RuleContext<MessageIds, Options>>
type MessageIds = 'misalignedKeys' | 'misalignedTypes' | 'misalignedValues';
type Options = [{
  alignTypeDefinitions?  : boolean;
  alignFunctionParams?   : boolean;
  alignClassProperties?  : boolean;
  alignObjectProperties? : boolean;
}]

type TypedNode = TSESTree.Node & { key?: TSESTree.Identifier, typeAnnotation: TSESTree.TSTypeAnnotation }
type InitializedNode = TSESTree.Node & { value: NonNullable<TSESTree.Node> }

type AlignmentOptions = {
  messageId     : MessageIds
  desiredColumn : number,
  targetRange   : [number, number],
  padding       : number,
  delimiter?    : string
}

type NodeGroupInfo = {
  startingColumn   : number,
  idDesiredCol     : number,
  typeDesiredCol   : number,
  valueDesiredCol  : number,
  keywordLengths   : number[],
  idLengths        : number[],
  typeLengths      : number[],
  maxKeywordLength : number,
  maxIdLength      : number,
  maxTypeLength    : number,
}

/* UTILITY FUNCTIONS */
// Get consecutive nodes
const defaultGrouping = (curr: TSESTree.Node, prev: TSESTree.Node): boolean => {
  if(curr.type === prev.type)
    return true
  return false
}

export function getConsecutive(
  nodes    : TSESTree.Node[],
  grouping : (current: TSESTree.Node, previous: TSESTree.Node) => boolean = defaultGrouping
): TSESTree.Node[][] {
  if(nodes.length === 0 || nodes.length === 1) return [];

  const groups: TSESTree.Node[][] = [];
  let currentGroup: TSESTree.Node[] = [];

  for(let i           = 0; i < nodes.length; i++) {
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
    (node.type === 'TSPropertySignature' || node.type === 'Identifier') &&
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

function isInControlFlow(node: TSESTree.Node): boolean {
  const controlFlowTypes = [
    'IfStatement',
    'ForStatement', 
    'ForInStatement',
    'ForOfStatement',
    'WhileStatement',
    'DoWhileStatement',
    'SwitchStatement',
    'TryStatement',
    'CatchClause'
  ];
  if(node.parent)
    return controlFlowTypes.includes(node.parent.type);
  return false
}

// Get node group length informations
export function nodeGroupInfo(context: Context, nodes: TSESTree.Node[]): NodeGroupInfo {
  let keywordLengths : number[] = [],
      idLengths      : number[] = [],
      typeLengths    : number[] = []

  let startingColumn = nodes[0].loc.start.column
  let idDesiredCol = 0, typeDesiredCol = 0, valueDesiredCol = 0
  let maxKeywordLength = 0, maxIdLength = 0, maxTypeLength = 0

  for(let node of nodes){
    let nodeContent = context.sourceCode.getText(node)
    let keyword = '', id = '', type = ''

    if(node.loc.start.column < startingColumn)
      startingColumn = node.loc.start.column

    if(node.type === 'TSParameterProperty'){
      keyword = nodeContent.slice(0, node.parameter.range[0] - node.range[0]).trim()
      node = node.parameter;
      nodeContent = context.sourceCode.getText(node)
    }

    if(node.type === 'Identifier' || node.type === 'RestElement' || node.type === 'TSPropertySignature'){
      if(node.typeAnnotation)
        id = nodeContent.slice(0, node.typeAnnotation.range[0] - node.range[0]).trim()
      else id = nodeContent.slice(0, node.range[1] - node.range[0]).trim()
    }

    if(node.type === 'AssignmentPattern'){
      if(node.left.typeAnnotation){
        id = nodeContent.slice(0, node.left.typeAnnotation.range[0] - node.left.range[0]).trim()
        type = nodeContent.slice(node.left.typeAnnotation.range[0] - node.left.range[0], node.left.typeAnnotation.range[1] - node.left.range[0]).trim()
      } else id = nodeContent.slice(0, node.left.range[1] - node.left.range[0]).trim()
    }

    if(node.type === 'PropertyDefinition'){
      keyword = nodeContent.slice(0, node.key.range[0] - node.range[0]).trim()
      id = (node.key as TSESTree.Identifier).name
      
      if(node.typeAnnotation)
        type = nodeContent.slice(node.typeAnnotation.range[0] - node.range[0], node.typeAnnotation.range[1] - node.range[0]).trim()
    }

    if(node.type === 'Property') {
      id = nodeContent.slice(0, node.key.range[1] - node.key.range[0]).trim()
      if(node.computed) id = `[${ id }]`
    }

    // ONLY MEANT TO PROCCESS SINGLE VARIABLE DECLARATIONS
    if(node.type === 'VariableDeclaration'){
      keyword = nodeContent.slice(0, node.declarations[0].range[0] - node.range[0]).trim()
      id = (node.declarations[0].id as TSESTree.Identifier).name
      if(node.declarations[0].id.typeAnnotation){
        type = nodeContent.slice(
          node.declarations[0].id.typeAnnotation.range[0] - node.range[0],
          node.declarations[0].id.typeAnnotation.range[1] - node.range[0]
        ).trim()
      }
    }

    // MEANT TO PROCCESS VARIABLES WITH MULTIPLE DECLARATIONS
    if(node.type === 'VariableDeclarator'){
      const parent = context.sourceCode.getText(node.parent)
      keyword = parent.slice(0, node.parent.declarations[0].range[0] - node.parent.range[0]).trim()
      id = (node.id as TSESTree.Identifier).name
      if(node.id.typeAnnotation){
        type = nodeContent.slice(
          node.id.typeAnnotation.range[0] - node.range[0],
          node.id.typeAnnotation.range[1] - node.range[0]
        ).trim()
      }
    }

    keywordLengths.push(keyword.length)
    if(keyword.length > maxKeywordLength)
      maxKeywordLength = keyword.length
    
    idLengths.push(id.length)
    if(id.length > maxIdLength)
      maxIdLength = id.length
    
    typeLengths.push(type.length)
    if(type.length > maxTypeLength)
      maxTypeLength = type.length
  }

  idDesiredCol = maxKeywordLength === 0 ? startingColumn : startingColumn + maxKeywordLength + 1
  typeDesiredCol = maxIdLength === 0 ? idDesiredCol : idDesiredCol + maxIdLength + 1
  valueDesiredCol = maxTypeLength === 0 ? typeDesiredCol : typeDesiredCol + maxTypeLength + 1

  return { 
    startingColumn,
    idDesiredCol,
    typeDesiredCol,
    valueDesiredCol,
    keywordLengths,
    idLengths,
    typeLengths,
    maxKeywordLength,
    maxIdLength,
    maxTypeLength,
  }
}

// Move node to the desired column
function alignItem(context: Context, node: TSESTree.Node, options: AlignmentOptions): void {
  let   padding       = options.delimiter ? ' '.repeat(options.padding) + options.delimiter : ' '.repeat(options.padding)
  const desiredColumn = options.delimiter ? options.desiredColumn + options.delimiter.length : options.desiredColumn
  if(node.loc.start.column !== desiredColumn){
    context.report({
      node      : node,
      messageId : options.messageId,
      fix(fixer: RuleFixer){
        return fixer.replaceTextRange(options.targetRange, padding)
      }
    })
  }
}

/* RULE DEFINITION */
const createRule = ESLintUtils.RuleCreator(
  name => `https://github.com/missingcodec/eslint-plugin/blob/main/docs/${name}.md`
);

const typeAlignment = createRule<Options, MessageIds>({
  name : 'type-alignment',
  meta: {
    type : 'layout',
    docs : {
      description: 'Type annotations should be aligned vertically'
    },
    fixable : 'whitespace',
    schema : [
      {
        type : 'object',
        properties : {
          alignTypeDefinitions  : { type: 'boolean' },
          alignFunctionParams   : { type: 'boolean' },
          alignClassProperties  : { type: 'boolean' },
          alignObjectProperties : { type: 'boolean' },
        },
        additionalProperties : false,
      },
    ],
    messages: {
      'misalignedKeys'   : 'Parameter keys must be aligned.',
      'misalignedTypes'  : 'Type annotations must be aligned.',
      'misalignedValues' : 'Default value declarations must be aligned.'
    },
  },
  defaultOptions: [
      {
        alignTypeDefinitions  : true,
        alignFunctionParams   : true,
        alignClassProperties  : true,
        alignObjectProperties : true
      }
  ],
  create(context, [options]){

    function alignTypeDefinitions(nodes : TSESTree.Node[]){
      const properties = nodes.filter(node => node.type === 'TSPropertySignature' && 'typeAnnotation' in node && !isMethod(node))
      const propGroups = getConsecutive(properties) as TypedNode[][];

      for(const group of propGroups) {
        if(!group.length || group.length === 1) continue;
        const groupInfo = nodeGroupInfo(context, group)

        group.forEach((node, i) => {
          alignItem(context, node.typeAnnotation, {
            messageId     : 'misalignedTypes',
            desiredColumn : groupInfo.typeDesiredCol,
            targetRange   : [node.key!.range[1], node.typeAnnotation.range[0]],
            padding       : groupInfo.maxIdLength - groupInfo.idLengths[i] + 1
          })
        })
      }
    }

    function alignFunctionParams(nodes : TSESTree.Node[]) {
      nodes = nodes.filter(node => !isMethod(node))
      const paramGroups = getConsecutive(nodes, () => true);
      for (const group of paramGroups) {
        if(!group.length || group.length === 1) continue;
        const groupInfo = nodeGroupInfo(context, group)
        group.forEach((node, i) => {

          let idPadding = 0
          let idRange: TSESTree.Range = [node.range[0] - node.loc.start.column + groupInfo.startingColumn, node.range[0]]
          let idDesiredCol = groupInfo.startingColumn

          let typePadding = groupInfo.maxKeywordLength === 0
            ? groupInfo.maxIdLength - groupInfo.idLengths[i] + 1
            : groupInfo.maxKeywordLength - groupInfo.maxIdLength - groupInfo.idLengths[i] + 2

          if(node.type === 'TSParameterProperty'){
            idRange = [node.range[0] + groupInfo.keywordLengths[i], node.parameter.range[0]]
            idDesiredCol = groupInfo.idDesiredCol
            idPadding = groupInfo.maxKeywordLength - groupInfo.keywordLengths[i] + 1
            node = node.parameter
            typePadding = groupInfo.maxIdLength - groupInfo.idLengths[i] + 1
          }

          let valuePadding = typePadding

          alignItem(context, node, {
            messageId     : 'misalignedKeys',
            desiredColumn : idDesiredCol,
            targetRange   : idRange,
            padding       : idPadding
          })

          const typeNode = node.type === 'AssignmentPattern' && 'typeAnnotation' in node.left
            ? node.left.typeAnnotation 
            : 'typeAnnotation' in node
              ? node.typeAnnotation
              : null

          if(typeNode){
            valuePadding = groupInfo.maxTypeLength - groupInfo.typeLengths[i] + 1
            alignItem(context, typeNode, {
              messageId     : 'misalignedTypes',
              desiredColumn : groupInfo.typeDesiredCol,
              targetRange   : [node.range[0] + groupInfo.idLengths[i], typeNode.range[0]],
              padding       : typePadding
            })
          }

          if(node.type === 'AssignmentPattern'){
            const valueLoc = node.left.typeAnnotation ? groupInfo.valueDesiredCol : groupInfo.typeDesiredCol
            alignItem(context, node.right, {
              messageId     : 'misalignedTypes',
              desiredColumn : valueLoc,
              targetRange   : [node.left.range[1], node.right.range[0]],
              padding       : valuePadding,
              delimiter     : '= '
            })
          }
        })
      }
    }

    function alignClassProperties(nodes : TSESTree.Node[]) {
      //Aligning All Property Keys
      const properties = nodes.filter(node => node.type === 'PropertyDefinition' && !isMethod(node))
      let   propGroups = getConsecutive(properties, () => true) as TSESTree.PropertyDefinition[][];

      for(const group of propGroups){
        if(!group.length || group.length === 1) continue;
        const groupInfo = nodeGroupInfo(context, group)
        group.forEach((node,i) => {
          let idPadding   = groupInfo.maxKeywordLength - groupInfo.keywordLengths[i] + 1
          let typePadding = groupInfo.maxIdLength - groupInfo.idLengths[i] + 1
          let idRange: TSESTree.Range = [node.range[0] + groupInfo.keywordLengths[i], node.key.range[0]]
          let idDesiredCol = groupInfo.idDesiredCol
          if(groupInfo.keywordLengths[i] === 0){
            idRange = [node.key.range[0] - node.loc.start.column + groupInfo.startingColumn, node.key.range[0]]
            idDesiredCol = groupInfo.startingColumn
            typePadding += idPadding
            idPadding = 0
          }

          alignItem(context, node.key, {
            messageId     : 'misalignedKeys',
            desiredColumn : idDesiredCol,
            targetRange   : idRange,
            padding       : idPadding
          })

          let valueLoc     = groupInfo.typeDesiredCol
          let valueIndex   = node.key.range[1]
          let valuePadding = typePadding

          if(node.typeAnnotation){
            valueLoc = groupInfo.valueDesiredCol
            valueIndex = node.typeAnnotation.range[1]
            valuePadding = groupInfo.maxTypeLength - groupInfo.typeLengths[i] + 1

            alignItem(context, node.typeAnnotation, {
              messageId     : 'misalignedTypes',
              desiredColumn : groupInfo.typeDesiredCol,
              targetRange   : [node.key.range[1], node.typeAnnotation.range[0]],
              padding       : typePadding
            })
          }

          if(node.value !== null) {
            alignItem(context, node.value, {
              messageId     : 'misalignedValues',
              desiredColumn : valueLoc,
              targetRange   : [valueIndex, node.value.range[0]],
              padding       : valuePadding,
              delimiter     : '= '
            })
          }
        })
      }
    }

    function alignObjectProperties(nodes: TSESTree.Node[]) {
      const properties = nodes.filter(node => node.type === 'Property' && node.method === false && node.value.type !== 'ArrowFunctionExpression' && node.shorthand === false)
      const propGroups = getConsecutive(properties, () => true) as TSESTree.Property[][]
      for(const group of propGroups){
        if(!group.length || group.length === 1) continue;
        const groupInfo = nodeGroupInfo(context, group)
        group.forEach((node, i) => {
          alignItem(context, node.value, {
            messageId     : 'misalignedValues',
            desiredColumn : groupInfo.valueDesiredCol,
            targetRange   : [node.range[0] + groupInfo.idLengths[i], node.value.range[0]],
            padding       : groupInfo.maxIdLength - groupInfo.idLengths[i] + 1,
            delimiter     : ': '
          })
        })
      }
    }

    function alignVariables(nodes: TSESTree.VariableDeclaration[]) {
      const single = nodes.filter(node => node.declarations.length === 1)
      let   groups = getConsecutive(single, () => true) as TSESTree.VariableDeclaration[][]
      
      for(const group of groups) {
        if(!group.length || group.length === 1) continue;
        const groupInfo = nodeGroupInfo(context, group)
        group.forEach((node, i) => {
          alignItem(context, node.declarations[0].id, {
            messageId     : 'misalignedKeys',
            desiredColumn : groupInfo.idDesiredCol,
            targetRange   : [node.range[0] + groupInfo.keywordLengths[i], node.declarations[0].range[0]],
            padding       : groupInfo.maxKeywordLength - groupInfo.keywordLengths[i] + 1,
          })

          let valueDesiredCol = groupInfo.typeDesiredCol
          let valuePadding    = groupInfo.maxIdLength - groupInfo.idLengths[i] + 1

          if(node.declarations[0].id.typeAnnotation){
            valueDesiredCol = groupInfo.valueDesiredCol
            valuePadding = groupInfo.maxTypeLength - groupInfo.typeLengths[i] + 1
            alignItem(context, node.declarations[0].id.typeAnnotation, {
              messageId     : 'misalignedTypes',
              desiredColumn : groupInfo.typeDesiredCol,
              targetRange   : [node.declarations[0].id.range[0] + groupInfo.idLengths[i], node.declarations[0].id.typeAnnotation.range[0]],
              padding       : groupInfo.maxIdLength - groupInfo.idLengths[i] + 1,
            })
          }

          if(node.declarations[0].init !== null){
            alignItem(context, node.declarations[0].init, {
              messageId     : 'misalignedTypes',
              desiredColumn : groupInfo.valueDesiredCol,
              targetRange   : [node.declarations[0].id.range[1], node.declarations[0].init.range[0]],
              padding       : valuePadding,
              delimiter     : '= '
            })
          }
        })
      }
    }

    const vars: TSESTree.VariableDeclaration[] = []

    // ALIGN ASSIGNMENT EXPRESSIONS
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

      TSMethodSignature(node) {
        if (options.alignFunctionParams) {
          alignFunctionParams(node.params)
        }
      },

      TSFunctionType(node) {
        if (options.alignFunctionParams) {
          alignFunctionParams(node.params)
        }
      },

      TSConstructSignatureDeclaration(node) {
        if (options.alignFunctionParams) {
          alignFunctionParams(node.params)
        }
      },

      ClassBody(node){
        if (options.alignClassProperties) {
          alignClassProperties(node.body)
        }
      },

      ObjectExpression(node){
        if (options.alignObjectProperties) {
          alignObjectProperties(node.properties)
        }
      },

      VariableDeclaration(node){
        if (options.alignObjectProperties) {
          if(
            !isInControlFlow(node) &&
            !node.declarations.some(decl => decl.id.type === 'ArrayPattern' || decl.id.type === 'ObjectPattern' || (decl.init !== null && (decl.init.type === 'ArrayExpression' || decl.init.type === 'ObjectExpression')))
          )
          vars.push(node)
        }
      },

      "Program:exit"(_){
        if (options.alignObjectProperties) {
          alignVariables(vars)
        }
      }
    }
  }
}) as unknown as Rule.RuleModule

export default typeAlignment