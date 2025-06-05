import { TSESTree } from '@typescript-eslint/utils';

// Get consecutive nodes
export function getConsecutive(nodes: TSESTree.Node[]): TSESTree.Node[][] {
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
    else if (currentNode.loc.start.line === previousNode.loc.end.line + 1) currentGroup.push(currentNode);
    else {
      groups.push(currentGroup)
      currentGroup = [currentNode];
    }
  }

  groups.push(currentGroup)
  return groups;
}