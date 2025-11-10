import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';

type Options = [];
type MessageIds = 'nestedLoop' | 'recursiveCall';

type LoopNode =
  | TSESTree.ForStatement
  | TSESTree.ForInStatement
  | TSESTree.ForOfStatement
  | TSESTree.WhileStatement
  | TSESTree.DoWhileStatement;

type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

const ITERATOR_METHODS = new Set([
  'forEach',
  'map',
  'filter',
  'reduce',
  'flatMap',
  'some',
  'every'
]);

const SMALL_BOUND = 10;

function getNumericValue(node: TSESTree.Expression | null | undefined): number | null {
  if (!node) {
    return null;
  }

  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'number') {
    return node.value;
  }

  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    const value = getNumericValue(node.argument as TSESTree.Expression);
    if (value === null) {
      return null;
    }

    if (node.operator === '-') {
      return -value;
    }

    if (node.operator === '+') {
      return value;
    }
  }

  return null;
}

function isSimpleIdentifier(node: TSESTree.Expression, name: string): boolean {
  return node.type === AST_NODE_TYPES.Identifier && node.name === name;
}

function getStepValue(
  update: TSESTree.Expression | null | undefined,
  loopVar: string
): number | null {
  if (!update) {
    return null;
  }

  if (update.type === AST_NODE_TYPES.UpdateExpression) {
    if (!isSimpleIdentifier(update.argument, loopVar)) {
      return null;
    }

    if (update.operator === '++') {
      return 1;
    }

    if (update.operator === '--') {
      return -1;
    }

    return null;
  }

  if (update.type === AST_NODE_TYPES.AssignmentExpression) {
    if (
      update.left.type !== AST_NODE_TYPES.Identifier ||
      update.left.name !== loopVar
    ) {
      return null;
    }

    if (update.operator === '+=') {
      const value = getNumericValue(update.right);
      return value === null ? null : value;
    }

    if (update.operator === '-=') {
      const value = getNumericValue(update.right);
      return value === null ? null : -value;
    }
  }

  return null;
}

function isSmallForLoop(node: TSESTree.ForStatement): boolean {
  if (!node.init || node.init.type !== AST_NODE_TYPES.VariableDeclaration) {
    return false;
  }

  const [declarator] = node.init.declarations;
  if (!declarator || declarator.id.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }

  const loopVar = declarator.id.name;
  const startValue = declarator.init ? getNumericValue(declarator.init) : null;
  if (startValue === null) {
    return false;
  }

  if (!node.test || node.test.type !== AST_NODE_TYPES.BinaryExpression) {
    return false;
  }

  if (node.test.left.type !== AST_NODE_TYPES.Identifier || node.test.left.name !== loopVar) {
    return false;
  }

  const limitValue = getNumericValue(node.test.right);
  if (limitValue === null) {
    return false;
  }

  const stepValue = getStepValue(node.update, loopVar);
  if (stepValue === null || stepValue === 0) {
    return false;
  }

  const stepMagnitude = Math.abs(stepValue);
  const { operator } = node.test;

  if (operator === '<' || operator === '<=') {
    if (stepValue <= 0) {
      return false;
    }

    const diff = limitValue - startValue;
    if (diff <= 0) {
      return true;
    }

    const inclusiveOffset = operator === '<=' ? 1 : 0;
    const iterations = Math.ceil(diff / stepMagnitude) + inclusiveOffset;
    return iterations <= SMALL_BOUND;
  }

  if (operator === '>' || operator === '>=') {
    if (stepValue >= 0) {
      return false;
    }

    const diff = startValue - limitValue;
    if (diff <= 0) {
      return true;
    }

    const inclusiveOffset = operator === '>=' ? 1 : 0;
    const iterations = Math.ceil(diff / stepMagnitude) + inclusiveOffset;
    return iterations <= SMALL_BOUND;
  }

  return false;
}

function isSmallArrayExpression(node: TSESTree.ArrayExpression): boolean {
  if (node.elements.length === 0) {
    return true;
  }

  let count = 0;
  for (const element of node.elements) {
    if (!element) {
      count += 1;
      continue;
    }

    if (element.type === AST_NODE_TYPES.SpreadElement) {
      return false;
    }

    count += 1;
    if (count > SMALL_BOUND) {
      return false;
    }
  }

  return count <= SMALL_BOUND;
}

function isSmallIterable(node: TSESTree.Expression): boolean {
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return isSmallArrayExpression(node);
  }

  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value.length <= SMALL_BOUND;
  }

  return false;
}

function isSmallLoop(node: LoopNode): boolean {
  if (node.type === AST_NODE_TYPES.ForStatement) {
    return isSmallForLoop(node);
  }

  if (node.type === AST_NODE_TYPES.ForOfStatement || node.type === AST_NODE_TYPES.ForInStatement) {
    return node.right ? isSmallIterable(node.right) : false;
  }

  return false;
}

function unwrapCallee(
  callee: TSESTree.LeftHandSideExpression
): TSESTree.Expression | TSESTree.PrivateIdentifier {
  if (callee.type === AST_NODE_TYPES.ChainExpression) {
    return callee.expression;
  }

  return callee;
}

function getIteratorTarget(node: TSESTree.CallExpression):
  | { method: string; target: TSESTree.Expression }
  | null {
  const callee = unwrapCallee(node.callee);

  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return null;
  }

  if (callee.property.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const method = callee.property.name;
  if (!ITERATOR_METHODS.has(method)) {
    return null;
  }

  const objectExpression = callee.object;
  if (objectExpression.type === AST_NODE_TYPES.ChainExpression) {
    return null;
  }

  return { method, target: objectExpression };
}

function getFunctionName(node: FunctionNode): string | null {
  if (node.type === AST_NODE_TYPES.FunctionDeclaration && node.id) {
    return node.id.name;
  }

  if ('id' in node && node.id && node.id.type === AST_NODE_TYPES.Identifier) {
    return node.id.name;
  }

  const parent = node.parent;
  if (!parent) {
    return null;
  }

  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier) {
    return parent.id.name;
  }

  if (parent.type === AST_NODE_TYPES.Property && parent.key.type === AST_NODE_TYPES.Identifier) {
    return parent.key.name;
  }

  if (
    parent.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.left.type === AST_NODE_TYPES.Identifier
  ) {
    return parent.left.name;
  }

  if (
    parent.type === AST_NODE_TYPES.ExportDefaultDeclaration ||
    parent.type === AST_NODE_TYPES.ExportNamedDeclaration
  ) {
    const declaration = parent.declaration;
    if (declaration && declaration !== node && declaration.type === AST_NODE_TYPES.Identifier) {
      return declaration.name;
    }
  }

  return null;
}

export default createRule<Options, MessageIds>({
  name: 'no-quadratic-complexity',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Detects nested loops/iterators or self-recursive calls that are likely to cause quadratic or worse complexity.',
      recommended: 'recommended'
    },
    schema: [],
    messages: {
      nestedLoop:
        'Potential quadratic iteration detected. Refactor to avoid nested loops or iterators on large collections.',
      recursiveCall:
        'Recursive call to "{{name}}" may lead to non-linear complexity. Ensure recursion depth is bounded or refactor iteratively.'
    }
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    type LoopFrame = { node: TSESTree.Node; safe: boolean };
    const loopStack: LoopFrame[] = [];
    let nonTrivialLoopDepth = 0;
    const iteratorCalls = new WeakSet<TSESTree.CallExpression>();

    const functionStack: Array<{ node: FunctionNode; name: string | null }> = [];

    function enterLoopContext(node: TSESTree.Node, safe: boolean): void {
      if (!safe && nonTrivialLoopDepth > 0) {
        context.report({ node, messageId: 'nestedLoop' });
      }

      loopStack.push({ node, safe });
      if (!safe) {
        nonTrivialLoopDepth += 1;
      }
    }

    function exitLoopContext(_expected: TSESTree.Node): void {
      const frame = loopStack.pop();
      if (!frame) {
        return;
      }

      if (!frame.safe) {
        nonTrivialLoopDepth -= 1;
      }
    }

    function handleLoop(node: LoopNode): void {
      const safe = isSmallLoop(node);
      enterLoopContext(node, safe);
    }

    function handleIteratorCall(node: TSESTree.CallExpression): void {
      const iteratorInfo = getIteratorTarget(node);
      if (!iteratorInfo) {
        return;
      }

      const safe = isSmallIterable(iteratorInfo.target);
      enterLoopContext(node, safe);
      iteratorCalls.add(node);
    }

    function handleRecursion(node: TSESTree.CallExpression): void {
      if (functionStack.length === 0) {
        return;
      }

      const current = functionStack[functionStack.length - 1];
      if (!current.name) {
        return;
      }

      const callee = unwrapCallee(node.callee);
      if (callee.type !== AST_NODE_TYPES.Identifier) {
        return;
      }

      if (callee.name === current.name) {
        context.report({
          node,
          messageId: 'recursiveCall',
          data: { name: callee.name }
        });
      }
    }

    function enterFunction(node: FunctionNode): void {
      functionStack.push({ node, name: getFunctionName(node) });
    }

    function exitFunction(): void {
      functionStack.pop();
    }

    return {
      ForStatement: handleLoop,
      'ForStatement:exit'(node: TSESTree.ForStatement) {
        exitLoopContext(node);
      },
      ForInStatement: handleLoop,
      'ForInStatement:exit'(node: TSESTree.ForInStatement) {
        exitLoopContext(node);
      },
      ForOfStatement: handleLoop,
      'ForOfStatement:exit'(node: TSESTree.ForOfStatement) {
        exitLoopContext(node);
      },
      WhileStatement: handleLoop,
      'WhileStatement:exit'(node: TSESTree.WhileStatement) {
        exitLoopContext(node);
      },
      DoWhileStatement: handleLoop,
      'DoWhileStatement:exit'(node: TSESTree.DoWhileStatement) {
        exitLoopContext(node);
      },
      CallExpression(node: TSESTree.CallExpression) {
        handleRecursion(node);
        handleIteratorCall(node);
      },
      'CallExpression:exit'(node: TSESTree.CallExpression) {
        if (iteratorCalls.has(node)) {
          exitLoopContext(node);
        }
      },
      FunctionDeclaration: enterFunction,
      'FunctionDeclaration:exit': exitFunction,
      FunctionExpression: enterFunction,
      'FunctionExpression:exit': exitFunction,
      ArrowFunctionExpression: enterFunction,
      'ArrowFunctionExpression:exit': exitFunction
    };
  }
});
