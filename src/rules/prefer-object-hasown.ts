import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';

type Options = [];
type MessageIds = 'preferObjectHasOwn';

const HASOWN_STATIC_METHODS = new Set(['hasOwnProperty']);

function getNodeText(sourceCode: TSESLint.SourceCode, node: TSESTree.Node): string {
  return sourceCode.getText(node);
}

function isHasOwnPropertyAccessor(
  node: TSESTree.Expression | TSESTree.PrivateIdentifier
): node is TSESTree.MemberExpression {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    HASOWN_STATIC_METHODS.has(node.property.name)
  );
}

function isObjectStaticHasOwnProperty(node: TSESTree.Expression | TSESTree.PrivateIdentifier): boolean {
  if (node.type !== AST_NODE_TYPES.MemberExpression || node.computed) {
    return false;
  }

  if (node.property.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }

  if (!HASOWN_STATIC_METHODS.has(node.property.name)) {
    return false;
  }

  const object = node.object;
  if (object.type === AST_NODE_TYPES.Identifier && object.name === 'Object') {
    return true;
  }

  if (
    object.type === AST_NODE_TYPES.MemberExpression &&
    !object.computed &&
    object.object.type === AST_NODE_TYPES.Identifier &&
    object.object.name === 'Object' &&
    object.property.type === AST_NODE_TYPES.Identifier &&
    object.property.name === 'prototype'
  ) {
    return true;
  }

  return false;
}

export default createRule<Options, MessageIds>({
  name: 'prefer-object-hasown',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer Object.hasOwn over legacy hasOwnProperty patterns to avoid prototype pitfalls and improve performance.',
      recommended: 'recommended'
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferObjectHasOwn:
        'Use Object.hasOwn({{objectText}}, {{propertyText}}) instead of {{original}} for faster, safer property checks.'
    }
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    const sourceCode = context.getSourceCode();

    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (node.arguments.length === 0) {
          return;
        }

        if (node.callee.type === AST_NODE_TYPES.MemberExpression && !node.callee.computed) {
          const callee = node.callee;

          if (
            callee.property.type === AST_NODE_TYPES.Identifier &&
            callee.property.name === 'call' &&
            isHasOwnPropertyAccessor(callee.object)
          ) {
            const [targetArg, propertyArg] = node.arguments;
            if (!targetArg || !propertyArg) {
              return;
            }

            context.report({
              node,
              messageId: 'preferObjectHasOwn',
              data: {
                objectText: getNodeText(sourceCode, targetArg),
                propertyText: getNodeText(sourceCode, propertyArg),
                original: getNodeText(sourceCode, node)
              },
              fix: fixer =>
                fixer.replaceText(
                  node,
                  `Object.hasOwn(${getNodeText(sourceCode, targetArg)}, ${getNodeText(
                    sourceCode,
                    propertyArg
                  )})`
                )
            });
            return;
          }

          if (isObjectStaticHasOwnProperty(callee)) {
            const [targetArg, propertyArg] = node.arguments;
            if (!targetArg || !propertyArg) {
              return;
            }

            context.report({
              node,
              messageId: 'preferObjectHasOwn',
              data: {
                objectText: getNodeText(sourceCode, targetArg),
                propertyText: getNodeText(sourceCode, propertyArg),
                original: getNodeText(sourceCode, node)
              },
              fix: fixer =>
                fixer.replaceText(
                  node,
                  `Object.hasOwn(${getNodeText(sourceCode, targetArg)}, ${getNodeText(
                    sourceCode,
                    propertyArg
                  )})`
                )
            });
            return;
          }

          if (
            callee.property.type === AST_NODE_TYPES.Identifier &&
            callee.property.name === 'hasOwnProperty'
          ) {
            const [propertyArg] = node.arguments;
            if (!propertyArg) {
              return;
            }

            const objectText = getNodeText(sourceCode, callee.object);
            context.report({
              node,
              messageId: 'preferObjectHasOwn',
              data: {
                objectText,
                propertyText: getNodeText(sourceCode, propertyArg),
                original: getNodeText(sourceCode, node)
              },
              fix: fixer =>
                fixer.replaceText(
                  node,
                  `Object.hasOwn(${objectText}, ${getNodeText(sourceCode, propertyArg)})`
                )
            });
          }
        }
      }
    };
  }
});
