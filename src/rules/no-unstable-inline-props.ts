import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { AnalyzerServices, getCrossFileAnalyzer } from '../analysis/cross-file-analyzer';
import { createRule } from '../utils/create-rule';

interface RuleOptions {
  ignoreProps?: string[];
  checkFunctions?: boolean;
  checkObjects?: boolean;
  checkSpreads?: boolean;
  relaxForNonMemoized?: boolean;
}

type Options = [RuleOptions];

type MessageIds =
  | 'inlineFunctionProp'
  | 'inlineObjectProp'
  | 'unstableIdentifierFunctionProp'
  | 'unstableIdentifierObjectProp'
  | 'spreadCreatesUnstableProps';

type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

type UnstableKind = 'function' | 'object';

const DEFAULT_OPTIONS: RuleOptions = {
  ignoreProps: [],
  checkFunctions: true,
  checkObjects: true,
  checkSpreads: true,
  relaxForNonMemoized: true
};

const HOOK_NAMES = ['useCallback', 'useMemo'];

const componentDetectionCache = new WeakMap<FunctionNode, boolean>();
const componentTsNodeCache = new WeakMap<FunctionNode, ts.Node | null>();
const expressionKindCache = new WeakMap<TSESTree.Node, UnstableKind | null>();
const symbolKindCache = new WeakMap<ts.Symbol, UnstableKind | null>();

function isFunctionNode(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

function getFunctionName(node: FunctionNode): string | null {
  if ('id' in node && node.id && node.id.type === AST_NODE_TYPES.Identifier) {
    return node.id.name;
  }

  const parent = node.parent;
  if (parent && parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier) {
    return parent.id.name;
  }

  return null;
}

function isComponentName(name: string | null): boolean {
  return !!name && /^[A-Z]/.test(name);
}

function returnsJSX(node: FunctionNode): boolean {
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

function unwrapExpression(expression: TSESTree.Expression): TSESTree.Expression {
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

    // no-op: parenthesized expressions are represented as their inner node in ESTree output
  }

  return current;
}

function isInlineFunction(expression: TSESTree.Expression): expression is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression {
  const unwrapped = unwrapExpression(expression);
  return (
    unwrapped.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    unwrapped.type === AST_NODE_TYPES.FunctionExpression
  );
}

function isInlineObject(expression: TSESTree.Expression): boolean {
  const unwrapped = unwrapExpression(expression);
  return (
    unwrapped.type === AST_NODE_TYPES.ObjectExpression ||
    unwrapped.type === AST_NODE_TYPES.ArrayExpression
  );
}

function isCustomComponent(opening: TSESTree.JSXOpeningElement): boolean {
  const { name } = opening;
  if (name.type === AST_NODE_TYPES.JSXIdentifier) {
    return /^[A-Z]/.test(name.name);
  }

  return name.type === AST_NODE_TYPES.JSXMemberExpression;
}

function createIgnoreSet(options: RuleOptions): Set<string> {
  return new Set((options.ignoreProps ?? []).map(prop => prop));
}

function isCallExpressionOfNames(expression: ts.LeftHandSideExpression, names: readonly string[]): boolean {
  if (ts.isIdentifier(expression)) {
    return names.includes(expression.text);
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return names.includes(expression.name.text);
  }

  return false;
}

function unwrapTypeScriptExpression(expression: ts.Expression): ts.Expression | null {
  if (
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return expression.expression;
  }

  return null;
}

function stripTypeScriptWrappers(expression: ts.Expression): ts.Expression {
  let current = expression;
  let next = unwrapTypeScriptExpression(current);

  while (next) {
    current = next;
    next = unwrapTypeScriptExpression(current);
  }

  return current;
}

function resolveSymbol(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  if (symbol.flags & ts.SymbolFlags.Alias) {
    try {
      return checker.getAliasedSymbol(symbol);
    } catch {
      return symbol;
    }
  }

  return symbol;
}

function isDeclarationWithinComponent(declaration: ts.Node, component: ts.Node): boolean {
  const componentFile = component.getSourceFile();
  const declarationFile = declaration.getSourceFile();
  if (componentFile !== declarationFile) {
    return false;
  }

  const componentStart = component.getStart(componentFile, false);
  const componentEnd = component.getEnd();
  const declarationStart = declaration.getStart(componentFile, false);
  const declarationEnd = declaration.getEnd();

  return declarationStart >= componentStart && declarationEnd <= componentEnd;
}

function getComponentTsNode(node: FunctionNode, services: AnalyzerServices | null): ts.Node | null {
  if (!services) {
    return null;
  }

  if (componentTsNodeCache.has(node)) {
    return componentTsNodeCache.get(node) ?? null;
  }

  const tsNode = services.getTypeScriptNode(node);
  componentTsNodeCache.set(node, tsNode ?? null);
  return tsNode ?? null;
}

function getSymbolForFunction(node: FunctionNode, services: AnalyzerServices | null): ts.Symbol | null {
  if (!services) {
    return null;
  }

  const checker = services.analyzer.getTypeChecker();
  const tsNode = services.getTypeScriptNode(node);

  if (tsNode) {
    if (ts.isFunctionLike(tsNode) && tsNode.name) {
      const namedSymbol = checker.getSymbolAtLocation(tsNode.name);
      if (namedSymbol) {
        return resolveSymbol(namedSymbol, checker);
      }
    }

    const directSymbol = checker.getSymbolAtLocation(tsNode);
    if (directSymbol) {
      return resolveSymbol(directSymbol, checker);
    }
  }

  const parent = node.parent;
  if (parent && parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier) {
    const tsIdentifier = services.getTypeScriptNode(parent.id);
    if (tsIdentifier) {
      const symbol = checker.getSymbolAtLocation(tsIdentifier);
      if (symbol) {
        return resolveSymbol(symbol, checker);
      }
    }
  }

  return null;
}

function isComponentFunction(node: FunctionNode, services: AnalyzerServices | null): boolean {
  if (componentDetectionCache.has(node)) {
    return componentDetectionCache.get(node) ?? false;
  }

  const name = getFunctionName(node);
  if (isComponentName(name) || returnsJSX(node)) {
    componentDetectionCache.set(node, true);
    return true;
  }

  const symbol = getSymbolForFunction(node, services);
  if (symbol) {
    const metadata = services?.analyzer.getSymbolMetadata(symbol);
    if (metadata?.isComponent) {
      componentDetectionCache.set(node, true);
      return true;
    }
  }

  componentDetectionCache.set(node, false);
  return false;
}

function findEnclosingComponent(node: TSESTree.Node, services: AnalyzerServices | null): FunctionNode | null {
  let current: TSESTree.Node | undefined = node.parent ?? undefined;

  while (current) {
    if (isFunctionNode(current) && isComponentFunction(current, services)) {
      return current;
    }
    current = current.parent ?? undefined;
  }

  return null;
}

function evaluateInitializerKind(
  initializer: ts.Expression | undefined,
  componentTs: ts.Node,
  services: AnalyzerServices,
  visitedSymbols: Set<ts.Symbol>
): UnstableKind | null {
  if (!initializer) {
    return null;
  }

  const checker = services.analyzer.getTypeChecker();
  const stripped = stripTypeScriptWrappers(initializer);

  if (ts.isArrowFunction(stripped) || ts.isFunctionExpression(stripped)) {
    return 'function';
  }

  if (ts.isObjectLiteralExpression(stripped) || ts.isArrayLiteralExpression(stripped)) {
    return 'object';
  }

  if (ts.isNewExpression(stripped)) {
    return 'object';
  }

  if (ts.isCallExpression(stripped)) {
    if (isCallExpressionOfNames(stripped.expression, HOOK_NAMES)) {
      return null;
    }
    const signature = checker.getResolvedSignature(stripped);
    if (signature) {
      const returnType = checker.getReturnTypeOfSignature(signature);
      if (checker.getSignaturesOfType(returnType, ts.SignatureKind.Call).length > 0) {
        return 'function';
      }
    }
    return null;
  }

  if (ts.isConditionalExpression(stripped)) {
    const whenTrue = evaluateInitializerKind(stripped.whenTrue, componentTs, services, visitedSymbols);
    const whenFalse = evaluateInitializerKind(stripped.whenFalse, componentTs, services, visitedSymbols);
    if (whenTrue && whenTrue === whenFalse) {
      return whenTrue;
    }
    return whenTrue ?? whenFalse;
  }

  if (ts.isBinaryExpression(stripped)) {
    const operator = stripped.operatorToken.kind;
    if (
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.AmpersandAmpersandToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken
    ) {
      const right = evaluateInitializerKind(stripped.right, componentTs, services, visitedSymbols);
      if (right) {
        return right;
      }
      return evaluateInitializerKind(stripped.left, componentTs, services, visitedSymbols);
    }
  }

  if (ts.isIdentifier(stripped)) {
    const symbol = checker.getSymbolAtLocation(stripped);
    if (!symbol) {
      return null;
    }
    return evaluateSymbolKind(resolveSymbol(symbol, checker), componentTs, services, visitedSymbols);
  }

  if (ts.isPropertyAccessExpression(stripped)) {
    const symbol = checker.getSymbolAtLocation(stripped);
    if (!symbol) {
      return null;
    }
    return evaluateSymbolKind(resolveSymbol(symbol, checker), componentTs, services, visitedSymbols);
  }

  return null;
}

function getBindingElementName(binding: ts.BindingElement): string | null {
  if (binding.propertyName && ts.isIdentifier(binding.propertyName)) {
    return binding.propertyName.text;
  }

  if (ts.isIdentifier(binding.name)) {
    return binding.name.text;
  }

  return null;
}

function evaluateBindingElementKind(
  binding: ts.BindingElement,
  componentTs: ts.Node,
  services: AnalyzerServices,
  visitedSymbols: Set<ts.Symbol>
): UnstableKind | null {
  const checker = services.analyzer.getTypeChecker();
  const pattern = binding.parent;

  if (!ts.isObjectBindingPattern(pattern) && !ts.isArrayBindingPattern(pattern)) {
    return null;
  }

  const declarationParent = pattern.parent;
  if (!ts.isVariableDeclaration(declarationParent)) {
    return null;
  }

  const initializer = declarationParent.initializer;
  if (!initializer) {
    return null;
  }

  const strippedInitializer = stripTypeScriptWrappers(initializer);

  if (ts.isIdentifier(strippedInitializer)) {
    const symbol = checker.getSymbolAtLocation(strippedInitializer);
    if (!symbol) {
      return null;
    }
    return evaluateSymbolKind(resolveSymbol(symbol, checker), componentTs, services, visitedSymbols);
  }

  if (ts.isObjectLiteralExpression(strippedInitializer)) {
    const propertyName = getBindingElementName(binding);
    if (!propertyName) {
      return 'object';
    }

    for (const property of strippedInitializer.properties) {
      if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === propertyName) {
        return evaluateInitializerKind(property.initializer, componentTs, services, visitedSymbols);
      }

      if (ts.isShorthandPropertyAssignment(property) && property.name.text === propertyName) {
        const shorthandSymbol = checker.getSymbolAtLocation(property.name);
        if (shorthandSymbol) {
          return evaluateSymbolKind(resolveSymbol(shorthandSymbol, checker), componentTs, services, visitedSymbols);
        }
      }
    }

    return 'object';
  }

  if (ts.isArrayLiteralExpression(strippedInitializer)) {
    return 'object';
  }

  return evaluateInitializerKind(strippedInitializer, componentTs, services, visitedSymbols);
}

function evaluateDeclarationKind(
  declaration: ts.Declaration,
  componentTs: ts.Node,
  services: AnalyzerServices,
  visitedSymbols: Set<ts.Symbol>
): UnstableKind | null {
  if (ts.isFunctionLike(declaration)) {
    return 'function';
  }

  if (ts.isVariableDeclaration(declaration)) {
    return evaluateInitializerKind(declaration.initializer, componentTs, services, visitedSymbols);
  }

  if (ts.isBindingElement(declaration)) {
    return evaluateBindingElementKind(declaration, componentTs, services, visitedSymbols);
  }

  if (ts.isParameter(declaration)) {
    return null;
  }

  return null;
}

function evaluateSymbolKind(
  symbol: ts.Symbol,
  componentTs: ts.Node,
  services: AnalyzerServices,
  visitedSymbols: Set<ts.Symbol>
): UnstableKind | null {
  if (symbolKindCache.has(symbol)) {
    return symbolKindCache.get(symbol) ?? null;
  }

  if (visitedSymbols.has(symbol)) {
    return null;
  }
  visitedSymbols.add(symbol);

  let result: UnstableKind | null = null;

  const declarations = symbol.declarations ?? [];
  for (const declaration of declarations) {
    if (!declaration) {
      continue;
    }

    if (!isDeclarationWithinComponent(declaration, componentTs)) {
      result = null;
      break;
    }

    const evaluated = evaluateDeclarationKind(declaration, componentTs, services, visitedSymbols);
    if (evaluated === 'function') {
      result = 'function';
      break;
    }

    if (evaluated === 'object' && result === null) {
      result = 'object';
    }
  }

  symbolKindCache.set(symbol, result);
  visitedSymbols.delete(symbol);
  return result;
}

function evaluateExpressionKind(
  expression: TSESTree.Expression,
  component: FunctionNode,
  services: AnalyzerServices | null,
  sourceCode: TSESLint.SourceCode,
  visitedSymbols: Set<ts.Symbol>
): UnstableKind | null {
  const cached = expressionKindCache.get(expression);
  if (cached !== undefined) {
    return cached;
  }

  const unwrapped = unwrapExpression(expression);

  if (isInlineFunction(unwrapped)) {
    expressionKindCache.set(expression, 'function');
    return 'function';
  }

  if (isInlineObject(unwrapped)) {
    expressionKindCache.set(expression, 'object');
    return 'object';
  }

  let result: UnstableKind | null = null;
  const fallbackResult = evaluateExpressionKindFallback(unwrapped, component, sourceCode, new Set());

  if (services) {
    const componentTs = getComponentTsNode(component, services);
    if (componentTs) {
      const checker = services.analyzer.getTypeChecker();
      const tsNode = services.getTypeScriptNode(unwrapped);

      if (tsNode) {
        let symbol = checker.getSymbolAtLocation(tsNode);
        if (!symbol && ts.isPropertyAccessExpression(tsNode)) {
          symbol = checker.getSymbolAtLocation(tsNode.name);
        }

        if (symbol) {
          const resolved = resolveSymbol(symbol, checker);
          result = evaluateSymbolKind(resolved, componentTs, services, visitedSymbols);
        }
      }
    }
  }

  if (result === 'object' && fallbackResult === 'function') {
    result = 'function';
  } else if (!result) {
    result = fallbackResult;
  }

  expressionKindCache.set(expression, result);
  return result;
}

function resolveVariable(identifier: TSESTree.Identifier, sourceCode: TSESLint.SourceCode): TSESLint.Scope.Variable | null {
  const scopeManager = sourceCode.scopeManager;
  if (!scopeManager) {
    return null;
  }

  let scope: TSESLint.Scope.Scope | null = sourceCode.getScope
    ? sourceCode.getScope(identifier)
    : null;

  if (!scope) {
    scope = scopeManager.acquire(identifier) ?? scopeManager.globalScope ?? null;
  }

  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) {
      return variable;
    }
    scope = scope.upper ?? null;
  }

  return null;
}

function isNodeWithinComponentRange(node: TSESTree.Node, component: FunctionNode): boolean {
  const componentRange = component.range;
  const nodeRange = node.range;
  if (!componentRange || !nodeRange) {
    return false;
  }

  return nodeRange[0] >= componentRange[0] && nodeRange[1] <= componentRange[1];
}

function isHookCallFallback(callee: TSESTree.LeftHandSideExpression): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return HOOK_NAMES.includes(callee.name);
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return HOOK_NAMES.includes(callee.property.name);
  }

  return false;
}

function resolveDeclarator(node: TSESTree.Node): TSESTree.VariableDeclarator | null {
  if (node.type === AST_NODE_TYPES.VariableDeclarator) {
    return node;
  }

  if (node.parent && node.parent.type === AST_NODE_TYPES.VariableDeclarator) {
    return node.parent;
  }

  if (node.parent && node.parent.parent && node.parent.parent.type === AST_NODE_TYPES.VariableDeclarator) {
    return node.parent.parent;
  }

  return null;
}

function findObjectPatternPropertyName(pattern: TSESTree.ObjectPattern, target: TSESTree.Identifier): string | null {
  for (const property of pattern.properties) {
    if (property.type !== AST_NODE_TYPES.Property) {
      continue;
    }

    const value = property.value;

    if (value === target) {
      if (property.key.type === AST_NODE_TYPES.Identifier) {
        return property.key.name;
      }
      return null;
    }

    if (value.type === AST_NODE_TYPES.Identifier && value.name === target.name) {
      if (property.key.type === AST_NODE_TYPES.Identifier) {
        return property.key.name;
      }
      return null;
    }

    if (
      value.type === AST_NODE_TYPES.AssignmentPattern &&
      value.left.type === AST_NODE_TYPES.Identifier &&
      value.left.name === target.name &&
      property.key.type === AST_NODE_TYPES.Identifier
    ) {
      return property.key.name;
    }
  }

  return null;
}

function findObjectLiteralPropertyValue(
  expression: TSESTree.ObjectExpression,
  propertyName: string
): TSESTree.Expression | null {
  for (const property of expression.properties) {
    if (property.type !== AST_NODE_TYPES.Property || property.computed) {
      continue;
    }

    if (property.key.type !== AST_NODE_TYPES.Identifier || property.key.name !== propertyName) {
      continue;
    }

    const value = property.value;
    if (value.type === AST_NODE_TYPES.AssignmentPattern) {
      return value.right as TSESTree.Expression;
    }

    return value as TSESTree.Expression;
  }

  return null;
}

function evaluateObjectPatternBindingFallback(
  pattern: TSESTree.ObjectPattern,
  target: TSESTree.Identifier,
  initializer: TSESTree.Expression,
  component: FunctionNode,
  sourceCode: TSESLint.SourceCode,
  visitedVariables: Set<TSESLint.Scope.Variable>
): UnstableKind | null {
  const propertyName = findObjectPatternPropertyName(pattern, target);
  if (!propertyName) {
    return null;
  }

  const unwrappedInit = unwrapExpression(initializer);

  if (unwrappedInit.type === AST_NODE_TYPES.ObjectExpression) {
    const propertyValue = findObjectLiteralPropertyValue(unwrappedInit, propertyName);
    if (!propertyValue) {
      return 'object';
    }
    return evaluateExpressionKindFallback(propertyValue, component, sourceCode, visitedVariables);
  }

  return evaluateExpressionKindFallback(unwrappedInit, component, sourceCode, visitedVariables);
}

function evaluateVariableDefinitionKindFallback(
  definition: TSESLint.Scope.Definition,
  component: FunctionNode,
  sourceCode: TSESLint.SourceCode,
  visitedVariables: Set<TSESLint.Scope.Variable>
): UnstableKind | null {
  const declarator = resolveDeclarator(definition.node);
  if (!declarator || !declarator.init) {
    return null;
  }

  const init = unwrapExpression(declarator.init);

  if (isInlineFunction(init)) {
    return 'function';
  }

  if (
    init.type === AST_NODE_TYPES.CallExpression &&
    isHookCallFallback(init.callee as TSESTree.LeftHandSideExpression)
  ) {
    return null;
  }

  if (
    declarator.id.type === AST_NODE_TYPES.ObjectPattern &&
    definition.node.type === AST_NODE_TYPES.Identifier
  ) {
    const bindingKind = evaluateObjectPatternBindingFallback(
      declarator.id,
      definition.node,
      declarator.init,
      component,
      sourceCode,
      visitedVariables
    );
    if (bindingKind) {
      return bindingKind;
    }
  }

  if (isInlineObject(init)) {
    return 'object';
  }

  return evaluateExpressionKindFallback(init, component, sourceCode, visitedVariables);
}

function evaluateExpressionKindFallback(
  expression: TSESTree.Expression,
  component: FunctionNode,
  sourceCode: TSESLint.SourceCode,
  visitedVariables: Set<TSESLint.Scope.Variable>
): UnstableKind | null {
  const unwrapped = unwrapExpression(expression);

  if (isInlineFunction(unwrapped)) {
    return 'function';
  }

  if (isInlineObject(unwrapped)) {
    return 'object';
  }

  if (unwrapped.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const variable = resolveVariable(unwrapped, sourceCode);
  if (!variable) {
    return null;
  }

  if (visitedVariables.has(variable)) {
    return null;
  }
  visitedVariables.add(variable);

  let result: UnstableKind | null = null;

  for (const definition of variable.defs) {
    if (!isNodeWithinComponentRange(definition.node, component)) {
      result = null;
      break;
    }

    switch (definition.type) {
      case 'Parameter':
      case 'ImplicitGlobalVariable':
      case 'ImportBinding':
        result = null;
        break;
      case 'FunctionName':
        result = 'function';
        break;
      case 'Variable':
        result = evaluateVariableDefinitionKindFallback(definition, component, sourceCode, visitedVariables);
        break;
      default:
        break;
    }

    if (result !== null) {
      break;
    }
  }

  visitedVariables.delete(variable);
  return result;
}

interface SpreadIssue {
  node: TSESTree.Expression;
  kind: UnstableKind;
  propName: string | null;
}

function getStaticPropertyName(property: TSESTree.Property): string | null {
  if (property.computed) {
    return null;
  }

  if (property.key.type === AST_NODE_TYPES.Identifier) {
    return property.key.name;
  }

  if (
    property.key.type === AST_NODE_TYPES.Literal &&
    typeof property.key.value === 'string'
  ) {
    return property.key.value;
  }

  return null;
}

function collectObjectExpressionSpreadIssues(
  expression: TSESTree.ObjectExpression,
  component: FunctionNode,
  services: AnalyzerServices | null,
  sourceCode: TSESLint.SourceCode,
  checkFunctions: boolean,
  checkObjects: boolean
): SpreadIssue[] {
  const issues: SpreadIssue[] = [];

  for (const property of expression.properties) {
    if (property.type === AST_NODE_TYPES.Property) {
      if (property.kind !== 'init') {
        continue;
      }

      const value = property.value as TSESTree.Expression;
      const propName = getStaticPropertyName(property);
      const unwrapped = unwrapExpression(value);

      if (isInlineFunction(unwrapped)) {
        if (checkFunctions) {
          issues.push({ node: unwrapped, kind: 'function', propName });
        }
        continue;
      }

      if (isInlineObject(unwrapped)) {
        if (checkObjects) {
          issues.push({ node: unwrapped, kind: 'object', propName });
        }
        continue;
      }

      if (!checkFunctions && !checkObjects) {
        continue;
      }

      const kind = evaluateExpressionKind(value, component, services, sourceCode, new Set());
      if (kind === 'function') {
        if (checkFunctions) {
          issues.push({ node: value, kind, propName });
        }
        continue;
      }

      if (kind === 'object') {
        if (checkObjects) {
          issues.push({ node: value, kind, propName });
        }
        continue;
      }

      continue;
    }

    if (property.type === AST_NODE_TYPES.SpreadElement) {
      const argument = unwrapExpression(property.argument as TSESTree.Expression);

      if (argument.type === AST_NODE_TYPES.ObjectExpression) {
        issues.push(
          ...collectObjectExpressionSpreadIssues(
            argument,
            component,
            services,
            sourceCode,
            checkFunctions,
            checkObjects
          )
        );
        continue;
      }

      if (!checkObjects) {
        continue;
      }

      const kind = evaluateExpressionKind(argument, component, services, sourceCode, new Set());
      if (kind === 'object') {
        issues.push({ node: argument, kind, propName: null });
      }

      continue;
    }
  }

  return issues;
}

function reportInlineProp(
  context: TSESLint.RuleContext<MessageIds, Options>,
  node: TSESTree.Expression,
  propName: string,
  checkFunctions: boolean,
  checkObjects: boolean
): void {
  if (isInlineFunction(node)) {
    if (!checkFunctions) {
      return;
    }
    context.report({
      node,
      messageId: 'inlineFunctionProp',
      data: {
        propName
      }
    });
    return;
  }

  if (isInlineObject(node)) {
    if (!checkObjects) {
      return;
    }
    context.report({
      node,
      messageId: 'inlineObjectProp',
      data: {
        propName
      }
    });
  }
}

export default createRule<Options, MessageIds>({
  name: 'no-unstable-inline-props',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Detect inline functions or objects passed as React props without memoization and recommend wrapping them in useCallback/useMemo.',
      recommended: 'recommended'
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignoreProps: {
            type: 'array',
            items: {
              type: 'string'
            },
            uniqueItems: true
          },
          checkFunctions: {
            type: 'boolean'
          },
          checkObjects: {
            type: 'boolean'
          },
          checkSpreads: {
            type: 'boolean'
          },
          relaxForNonMemoized: {
            type: 'boolean'
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      inlineFunctionProp:
        'Inline function for prop "{{propName}}" recreates every render. Wrap it with useCallback or hoist it outside the component.',
      inlineObjectProp:
        'Inline object or array for prop "{{propName}}" recreates every render. Wrap it with useMemo or move it outside the component.',
      unstableIdentifierFunctionProp:
        'Prop "{{propName}}" receives function "{{identifier}}" defined inside this component without memoization. Wrap its declaration with useCallback or move it outside.',
      unstableIdentifierObjectProp:
        'Prop "{{propName}}" receives object "{{identifier}}" created inside this component without memoization. Wrap its declaration with useMemo or move it outside.',
      spreadCreatesUnstableProps:
        'Spread props expression "{{expression}}" creates new values on each render. Memoize it or hoist it outside the component before spreading.'
    }
  },
  defaultOptions: [DEFAULT_OPTIONS],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const ruleOptions: RuleOptions = {
      ...DEFAULT_OPTIONS,
      ...(context.options[0] ?? {})
    };

    const ignoreProps = createIgnoreSet(ruleOptions);
    const checkFunctions = ruleOptions.checkFunctions !== false;
    const checkObjects = ruleOptions.checkObjects !== false;
    const checkSpreads = ruleOptions.checkSpreads !== false;
  const relaxForNonMemoized = ruleOptions.relaxForNonMemoized !== false;

    const services = getCrossFileAnalyzer(context);
    type ComponentMetadata = ReturnType<AnalyzerServices['analyzer']['getSymbolMetadata']>;
    const componentMetadataCache = services ? new WeakMap<TSESTree.JSXOpeningElement, ComponentMetadata | null>() : null;

    const getComponentMetadata = (opening: TSESTree.JSXOpeningElement): ComponentMetadata | null => {
      if (!services) {
        return null;
      }

      if (componentMetadataCache && componentMetadataCache.has(opening)) {
        return componentMetadataCache.get(opening) ?? null;
      }

      try {
        const tsName = services.getTypeScriptNode(opening.name);
        if (!tsName) {
          if (componentMetadataCache) {
            componentMetadataCache.set(opening, null);
          }
          return null;
        }

        const checker = services.analyzer.getTypeChecker();
        const symbol = checker.getSymbolAtLocation(tsName);
        if (!symbol) {
          if (componentMetadataCache) {
            componentMetadataCache.set(opening, null);
          }
          return null;
        }

        const metadata = services.analyzer.getSymbolMetadata(resolveSymbol(symbol, checker));
        if (componentMetadataCache) {
          componentMetadataCache.set(opening, metadata ?? null);
        }
        return metadata ?? null;
      } catch {
        if (componentMetadataCache) {
          componentMetadataCache.set(opening, null);
        }
        return null;
      }
    };

    return {
      JSXAttribute(node: TSESTree.JSXAttribute) {
        if (node.name.type !== AST_NODE_TYPES.JSXIdentifier) {
          return;
        }

        const parent = node.parent;
        if (!parent || parent.type !== AST_NODE_TYPES.JSXOpeningElement) {
          return;
        }

        if (!isCustomComponent(parent)) {
          return;
        }

        const component = findEnclosingComponent(node, services);
        if (!component) {
          return;
        }

        const propName = node.name.name;
        if (ignoreProps.has(propName)) {
          return;
        }

        if (!node.value || node.value.type !== AST_NODE_TYPES.JSXExpressionContainer) {
          return;
        }

        const expression = node.value.expression;
        if (!expression || expression.type === AST_NODE_TYPES.JSXEmptyExpression) {
          return;
        }

        const unwrapped = unwrapExpression(expression);

        const metadata = getComponentMetadata(parent);
        const propMeta = metadata?.componentProps?.[propName] ?? null;

        // If analyzer metadata is available and user opted-in to relaxed mode, allow inline values
        // for non-memoized targets when the prop kind matches.
        if (
          relaxForNonMemoized &&
          metadata &&
          metadata.isMemoizedComponent === false &&
          propMeta &&
          ((propMeta.kind === 'function' && isInlineFunction(unwrapped)) ||
            (propMeta.kind === 'object' && isInlineObject(unwrapped)))
        ) {
          return;
        }

        if (isInlineFunction(unwrapped) || isInlineObject(unwrapped)) {
          reportInlineProp(context, unwrapped, propName, checkFunctions, checkObjects);
          return;
        }

        if (!checkFunctions && !checkObjects) {
          return;
        }

        let kind = evaluateExpressionKind(unwrapped, component, services, sourceCode, new Set());

        if (propMeta && (propMeta.kind === 'function' || propMeta.kind === 'object')) {
          if (!kind) {
            kind = propMeta.kind;
          } else if (kind !== propMeta.kind) {
            kind = propMeta.kind;
          }
        }
        if (!kind) {
          return;
        }

        if (kind === 'function' && !checkFunctions) {
          return;
        }

        if (kind === 'object' && !checkObjects) {
          return;
        }

        if (unwrapped.type === AST_NODE_TYPES.Identifier) {
          const fallbackKind = evaluateExpressionKindFallback(
            unwrapped,
            component,
            sourceCode,
            new Set()
          );

          if (fallbackKind === 'function' && kind !== 'function') {
            kind = 'function';
          }

          const messageId =
            kind === 'function' ? 'unstableIdentifierFunctionProp' : 'unstableIdentifierObjectProp';

          context.report({
            node: unwrapped,
            messageId,
            data: {
              propName,
              identifier: unwrapped.name
            }
          });
        }
      },
      JSXSpreadAttribute(node: TSESTree.JSXSpreadAttribute) {
        if (!checkSpreads) {
          return;
        }

        const parent = node.parent;
        if (!parent || parent.type !== AST_NODE_TYPES.JSXOpeningElement) {
          return;
        }

        if (!isCustomComponent(parent)) {
          return;
        }

        const component = findEnclosingComponent(node, services);
        if (!component) {
          return;
        }

        const rawArgument = node.argument as TSESTree.Expression;
        const expression = unwrapExpression(rawArgument);

        if (expression.type === AST_NODE_TYPES.ObjectExpression) {
          let issues = collectObjectExpressionSpreadIssues(
            expression,
            component,
            services,
            sourceCode,
            checkFunctions,
            checkObjects
          );

          if (issues.length === 0) {
            return;
          }

          if (relaxForNonMemoized) {
            const metadata = getComponentMetadata(parent);
            if (metadata && metadata.isMemoizedComponent === false && metadata.componentProps) {
              issues = issues.filter(issue => {
                if (!issue.propName) {
                  return true;
                }
                const propMeta = metadata.componentProps?.[issue.propName];
                if (!propMeta) {
                  return true;
                }
                return propMeta.kind !== issue.kind;
              });

              if (issues.length === 0) {
                return;
              }
            }
          }

          const reportNode = issues[0]?.node ?? expression;

          context.report({
            node: reportNode,
            messageId: 'spreadCreatesUnstableProps',
            data: {
              expression: sourceCode.getText(rawArgument)
            }
          });
          return;
        }

        const kind = evaluateExpressionKind(expression, component, services, sourceCode, new Set());
        if (kind !== 'object') {
          return;
        }

        if (relaxForNonMemoized) {
          const metadata = getComponentMetadata(parent);
          if (metadata && metadata.isMemoizedComponent === false && metadata.componentProps) {
            const hasObjectProp = Object.keys(metadata.componentProps).some(
              key => metadata.componentProps?.[key].kind === 'object'
            );
            if (hasObjectProp) {
              return;
            }
          }
        }

        const expressionText =
          expression.type === AST_NODE_TYPES.Identifier
            ? expression.name
            : sourceCode.getText(rawArgument);

        context.report({
          node: expression,
          messageId: 'spreadCreatesUnstableProps',
          data: {
            expression: expressionText
          }
        });
      }
    };
  }
});
