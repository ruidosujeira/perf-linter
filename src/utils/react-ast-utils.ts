import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

export type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

export function isFunctionNode(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

export function getFunctionName(node: FunctionNode): string | null {
  if (node.type === AST_NODE_TYPES.FunctionDeclaration && node.id) {
    return node.id.name;
  }

  if ('id' in node && node.id && node.id.type === AST_NODE_TYPES.Identifier) {
    return node.id.name;
  }

  let current: TSESTree.Node | undefined = node.parent ?? undefined;
  while (current) {
    if (current.type === AST_NODE_TYPES.VariableDeclarator && current.id.type === AST_NODE_TYPES.Identifier) {
      return current.id.name;
    }

    if (current.type === AST_NODE_TYPES.Property && current.key.type === AST_NODE_TYPES.Identifier) {
      return current.key.name;
    }

    current = current.parent ?? undefined;
  }

  return null;
}

export function isComponentName(name: string | null): boolean {
  return !!name && /^[A-Z]/.test(name);
}

export function returnsJSX(node: FunctionNode): boolean {
  if (node.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    const body = node.body;
    if (body.type === AST_NODE_TYPES.JSXElement || body.type === AST_NODE_TYPES.JSXFragment) {
      return true;
    }
  }

  const body = node.body;
  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    return false;
  }

  return body.body.some(statement => {
    if (statement.type !== AST_NODE_TYPES.ReturnStatement || !statement.argument) {
      return false;
    }

    const argument = statement.argument;
    return argument.type === AST_NODE_TYPES.JSXElement || argument.type === AST_NODE_TYPES.JSXFragment;
  });
}

export function unwrapExpression(expression: TSESTree.Expression): TSESTree.Expression {
  let current: TSESTree.Expression = expression;
  let changed = true;

  while (changed) {
    changed = false;

    if (current.type === AST_NODE_TYPES.TSAsExpression || current.type === AST_NODE_TYPES.TSTypeAssertion) {
      current = current.expression;
      changed = true;
      continue;
    }

    if (current.type === AST_NODE_TYPES.TSNonNullExpression || current.type === AST_NODE_TYPES.ChainExpression) {
      current = current.expression;
      changed = true;
      continue;
    }

    // Parenthesized expressions are represented as their inner node in ESTree output, so nothing to unwrap.
  }

  return current;
}

export function isInlineFunction(
  expression: TSESTree.Expression
): expression is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression {
  const unwrapped = unwrapExpression(expression);
  return (
    unwrapped.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    unwrapped.type === AST_NODE_TYPES.FunctionExpression
  );
}

export function isInlineObject(expression: TSESTree.Expression): boolean {
  const unwrapped = unwrapExpression(expression);
  return (
    unwrapped.type === AST_NODE_TYPES.ObjectExpression ||
    unwrapped.type === AST_NODE_TYPES.ArrayExpression
  );
}

export function isUseEffectCallee(node: TSESTree.Expression | TSESTree.Super): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name === 'useEffect';
  }

  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return (
      !node.computed &&
      node.property.type === AST_NODE_TYPES.Identifier &&
      node.property.name === 'useEffect'
    );
  }

  if (node.type === AST_NODE_TYPES.ChainExpression) {
    return isUseEffectCallee(node.expression);
  }

  return false;
}

export function isMemoHook(node: TSESTree.CallExpression): boolean {
  if (node.callee.type === AST_NODE_TYPES.Identifier) {
    return node.callee.name === 'useMemo' || node.callee.name === 'useCallback';
  }

  if (node.callee.type === AST_NODE_TYPES.MemberExpression && !node.callee.computed) {
    return (
      node.callee.property.type === AST_NODE_TYPES.Identifier &&
      (node.callee.property.name === 'useMemo' || node.callee.property.name === 'useCallback')
    );
  }

  if (node.callee.type === AST_NODE_TYPES.ChainExpression) {
    return isMemoHook({ ...node, callee: node.callee.expression } as TSESTree.CallExpression);
  }

  return false;
}
