import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils'
import { createRule } from '../utils'

type MessageIds = 'misalignedTypes' | 'misalignedValues'

type AlignmentTarget = TSESTree.TypeElement | TSESTree.ObjectLiteralElement

type AlignmentInfo = {
  keyLength     : number
  currentSpaces : number
  reportTarget  : TSESTree.Node
  replaceRange  : TSESTree.Range
}
type GroupAlignmentInfo = {
  maxKeyLength : number
  nodesData    : AlignmentInfo[]
}

export default createRule({
  name : 'vertical-alignment',
  meta : {
    type : 'layout',
    docs : {
      description : 'Enforces vertical alignment of type annotations and object properties',
    },
    fixable : 'whitespace',
    schema  : [],
    messages : {
      misalignedValues : 'Object values should be aligned.',
      misalignedTypes  : 'Type annotations should be aligned.',
    },
  },
  defaultOptions : [],
  create(context) {
    function getConsecutive<T extends TSESTree.Node>(nodes : T[]) : T[][] {
      if (nodes.length === 0) return []

      const groups : T[][] = []
      let currentGroup : T[] = []

      for (const [i, node] of nodes.entries()) {
        if (i === 0) {
          currentGroup.push(node)
          continue
        }

        /**
        * check if current node is in the same line as the previous node
        * if it is, don't add it to the current group and just skip it
        */
        if (nodes[i - 1]?.loc.end.line === node.loc.start.line) continue

        /**
        * check if the node spans multilple lines
        * if it does the consecutive nodes streak gets broken
        */
        if (node.loc.start.line !== node.loc.end.line) {
          if (currentGroup.length > 1)
            groups.push(currentGroup)
          currentGroup = []
          continue
        }

        /**
        * check if current node is positioned exactly under previous node
        * if it doesn't push the current group
        */
        if (nodes[i - 1]?.loc.end.line !== node.loc.start.line - 1) {
          if (currentGroup.length > 1)
            groups.push(currentGroup)
          currentGroup = [node]
        }

        currentGroup.push(node)
      }
      groups.push(currentGroup)

      return groups
    }

    function getNodeAlignmentInfo(node : TSESTree.Node, target : TSESTree.Node) : AlignmentInfo {
      const colonToken = context.sourceCode.getTokenBefore(target, token => token.value === ':')!
      const tokenBefore = context.sourceCode.getTokenBefore(colonToken)!

      return {
        keyLength     : tokenBefore.range[1] - node.range[0],
        currentSpaces : colonToken.range[0] - tokenBefore.range[1],
        reportTarget  : target,
        replaceRange  : [tokenBefore.range[1], colonToken.range[0]],
      }
    }

    function getGroupAlignmentInfo(group : AlignmentTarget[]) : GroupAlignmentInfo {
      let maxKeyLength = 0
      const nodesData : AlignmentInfo[] = []

      for (const node of group) {
        let target
            
        if (node.type === AST_NODE_TYPES.TSPropertySignature && 'typeAnnotation' in node && node.typeAnnotation)
          target = node.typeAnnotation.typeAnnotation
        else if (node.type === AST_NODE_TYPES.Property && !node.shorthand)
          target = node.value
        else continue

        const nodeData = getNodeAlignmentInfo(node, target)

        nodesData.push(nodeData)
            
        if (nodeData.keyLength > maxKeyLength)
          maxKeyLength = nodeData.keyLength
      }

      return {
        maxKeyLength,
        nodesData,
      }
    }

    function alignNodeGroups(groups : AlignmentTarget[][], messageId : MessageIds) : void {
      for (const group of groups) {
        const groupInfo = getGroupAlignmentInfo(group)

        for (const data of groupInfo.nodesData) {
          const spacesNeeded = groupInfo.maxKeyLength - data.keyLength + 1

          if (data.currentSpaces !== spacesNeeded) {
            context.report({
              node : data.reportTarget,
              messageId,
              fix(fixer) {
                return fixer.replaceTextRange(
                  data.replaceRange,
                  ' '.repeat(spacesNeeded),
                )
              },
            })
          }
        }
      }
    }

    return {
      TSInterfaceBody(node) {
        const properties = node.body.filter(node => node.type === AST_NODE_TYPES.TSPropertySignature)
        const consecutiveNodes = getConsecutive(properties)

        alignNodeGroups(consecutiveNodes, 'misalignedTypes')
      },

      TSTypeLiteral(node) {
        const properties = node.members.filter(node => node.type === AST_NODE_TYPES.TSPropertySignature)
        const consecutiveNodes = getConsecutive(properties)

        alignNodeGroups(consecutiveNodes, 'misalignedTypes')
      },

      ObjectExpression(node) {
        const consecutiveNodes = getConsecutive(node.properties)

        alignNodeGroups(consecutiveNodes, 'misalignedValues')
      },
    }
  },
})
