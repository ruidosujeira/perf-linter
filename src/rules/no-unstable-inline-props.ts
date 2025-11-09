import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { createRule } from '../utils/create-rule';

interface RuleOptions {
  ignoreProps?: string[];
  checkFunctions?: boolean;
  checkObjects?: boolean;
  checkSpreads?: boolean;
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

interface FunctionContext {
  node: FunctionNode | TSESTree.Program;
  isComponent: boolean;
  name: string | null;
  unstableVars: Map<string, UnstableKind>;
  stableVars: Set<string>;
}

interface TypeScriptUtils {
  checker: ts.TypeChecker;
  getTsNode(node: TSESTree.Node): ts.Node | null;
}

type BindingTarget =
  | TSESTree.Identifier
  | TSESTree.ObjectPattern
  | TSESTree.ArrayPattern
  | TSESTree.RestElement
  | TSESTree.AssignmentPattern;

const DEFAULT_OPTIONS: RuleOptions = {
  ignoreProps: [],
  checkFunctions: true,
  checkObjects: true,
  checkSpreads: true
};

const REACT_COMPONENT_TYPE_ALIASES = new Set([
  'FunctionComponent',
  'FC',
  'MemoExoticComponent',
  'ForwardRefExoticComponent',
  'ComponentType'
]);

function isComponentName(name: string | null): boolean {
  return !!name && /^[A-Z]/.test(name);
}

function getFunctionName(node: FunctionNode): string | null {
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

    if (current.type === AST_NODE_TYPES.AssignmentExpression && current.left.type === AST_NODE_TYPES.Identifier) {
      return current.left.name;
    }

    current = current.parent ?? undefined;
  }

  return null;
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
  }

  return current;
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

  for (const statement of body.body) {
    if (statement.type !== AST_NODE_TYPES.ReturnStatement || !statement.argument) {
      continue;
    }

    const argument = statement.argument;
    if (argument.type === AST_NODE_TYPES.JSXElement || argument.type === AST_NODE_TYPES.JSXFragment) {
      return true;
    }

  }

  return false;
}

function isReactComponentByType(node: FunctionNode, tsUtils: TypeScriptUtils): boolean {
  const tsNode = tsUtils.getTsNode(node);

  if (tsNode && ts.isFunctionLike(tsNode)) {
    const signature = tsUtils.checker.getSignatureFromDeclaration(tsNode as ts.SignatureDeclaration);
    if (signature) {
      const returnType = tsUtils.checker.getReturnTypeOfSignature(signature);
      if (returnsReactElementType(returnType, tsUtils)) {
        return true;
      }
    }
  }

  const parent = node.parent;
  if (
    parent &&
    parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    const idNode = tsUtils.getTsNode(parent.id);
    if (idNode) {
      const variableType = tsUtils.checker.getTypeAtLocation(idNode);
      if (isReactComponentType(variableType, tsUtils)) {
        return true;
      }
    }
  }

  return false;
}

function returnsReactElementType(
  type: ts.Type,
  tsUtils: TypeScriptUtils,
  seen: Set<ts.Type> = new Set()
): boolean {
  if (seen.has(type)) {
    return false;
  }
  seen.add(type);

  const textual = tsUtils.checker.typeToString(type);
    if (textual.includes('JSX.Element') || textual.includes('ReactElement')) {
    return true;
  }

  if (type.isUnion() || type.isIntersection()) {
    return type.types.some(candidate => returnsReactElementType(candidate, tsUtils, seen));
  }

  return false;
}

function isReactComponentType(
  type: ts.Type,
  tsUtils: TypeScriptUtils,
  seen: Set<ts.Type> = new Set()
): boolean {
  if (seen.has(type)) {
    return false;
  }
  seen.add(type);

  const alias = type.aliasSymbol?.escapedName;
  if (alias && REACT_COMPONENT_TYPE_ALIASES.has(String(alias))) {
    return true;
  }

  const symbolName = type.symbol?.escapedName;
  if (symbolName && REACT_COMPONENT_TYPE_ALIASES.has(String(symbolName))) {
    return true;
  }

  const textual = tsUtils.checker.typeToString(type);
  for (const aliasName of REACT_COMPONENT_TYPE_ALIASES) {
    if (textual.includes(aliasName)) {
      return true;
    }
  }

  if (type.isUnion() || type.isIntersection()) {
    return type.types.some(candidate => isReactComponentType(candidate, tsUtils, seen));
  }

  if ((type.getFlags() & ts.TypeFlags.Object) !== 0) {
    const objectType = type as ts.ObjectType;
    const objectFlags = objectType.objectFlags ?? 0;
    if (objectFlags & (ts.ObjectFlags.Interface | ts.ObjectFlags.Class | ts.ObjectFlags.Reference)) {
      const baseTypes = tsUtils.checker.getBaseTypes(objectType as ts.InterfaceType) ?? [];
      if (baseTypes.some(base => isReactComponentType(base, tsUtils, seen))) {
        return true;
      }
    }
  }

  return false;
}

function isMemoLikeCallee(callee: TSESTree.LeftHandSideExpression): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'memo' || callee.name === 'forwardRef';
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name === 'memo' || callee.property.name === 'forwardRef';
  }

  return false;
}

function isLikelyComponent(
  node: FunctionNode,
  name: string | null,
  tsUtils: TypeScriptUtils | null
): boolean {
  if (isComponentName(name)) {
    return true;
  }

  if (tsUtils && isReactComponentByType(node, tsUtils)) {
    return true;
  }

  if (!returnsJSX(node)) {
    return false;
  }

  let current: TSESTree.Node | undefined = node.parent ?? undefined;
  while (current) {
    if (current.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
      return true;
    }

    if (current.type === AST_NODE_TYPES.VariableDeclarator && current.id.type === AST_NODE_TYPES.Identifier) {
      if (isComponentName(current.id.name)) {
        return true;
      }

      if (tsUtils) {
        const idNode = tsUtils.getTsNode(current.id);
        if (idNode) {
          const type = tsUtils.checker.getTypeAtLocation(idNode);
          if (isReactComponentType(type, tsUtils)) {
            return true;
          }
        }
      }
    }

    if (current.type === AST_NODE_TYPES.AssignmentExpression && current.left.type === AST_NODE_TYPES.Identifier) {
      if (isComponentName(current.left.name)) {
        return true;
      }
    }

    if (
      current.type === AST_NODE_TYPES.CallExpression &&
      node.parent === current.arguments[0] &&
      isMemoLikeCallee(current.callee as TSESTree.LeftHandSideExpression)
    ) {
      return true;
    }

    current = current.parent ?? undefined;
  }

  return false;
}

function isHookCallee(
  callee: TSESTree.LeftHandSideExpression,
  names: readonly string[]
): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return names.includes(callee.name);
  }

  if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed && callee.property.type === AST_NODE_TYPES.Identifier) {
    return names.includes(callee.property.name);
  }

  return false;
}

function isCallExpressionOf(
  expression: TSESTree.Expression,
  names: readonly string[]
): expression is TSESTree.CallExpression {
  return (
    expression.type === AST_NODE_TYPES.CallExpression &&
    isHookCallee(expression.callee as TSESTree.LeftHandSideExpression, names)
  );
}

function isInlineFunction(expression: TSESTree.Expression): expression is TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression {
  return (
    expression.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    expression.type === AST_NODE_TYPES.FunctionExpression
  );
}

function isInlineObject(expression: TSESTree.Expression): boolean {
  return (
    expression.type === AST_NODE_TYPES.ObjectExpression ||
    expression.type === AST_NODE_TYPES.ArrayExpression
  );
}

function isCustomComponent(opening: TSESTree.JSXOpeningElement): boolean {
  const { name } = opening;
  if (name.type === AST_NODE_TYPES.JSXIdentifier) {
    return /^[A-Z]/.test(name.name);
  }

  if (name.type === AST_NODE_TYPES.JSXMemberExpression) {
    return true;
  }

  return false;
}

function createIgnoreSet(options: RuleOptions): Set<string> {
  return new Set((options.ignoreProps ?? []).map(prop => prop));
}

function getTypeScriptUtils(
  context: TSESLint.RuleContext<MessageIds, Options>,
  sourceCode: TSESLint.SourceCode
): TypeScriptUtils | null {
  const parserServicesCandidate =
    (sourceCode as unknown as { parserServices?: unknown }).parserServices ?? context.parserServices;

  if (
    !parserServicesCandidate ||
    typeof parserServicesCandidate !== 'object' ||
    parserServicesCandidate === null
  ) {
    return null;
  }

  const parserServices = parserServicesCandidate as {
    program?: ts.Program;
    esTreeNodeToTSNodeMap?: { get(node: TSESTree.Node): ts.Node | undefined };
  };

  if (!parserServices.program || !parserServices.esTreeNodeToTSNodeMap) {
    return null;
  }

  const nodeMap = parserServices.esTreeNodeToTSNodeMap;

  if (!nodeMap || typeof nodeMap.get !== 'function') {
    return null;
  }

  const checker = parserServices.program.getTypeChecker();

  return {
    checker,
    getTsNode(node: TSESTree.Node) {
      try {
        return nodeMap.get(node) ?? null;
      } catch {
        return null;
      }
    }
  };
}

function createFunctionContext(node: FunctionNode | TSESTree.Program, isComponent: boolean, name: string | null): FunctionContext {
  return {
    node,
    isComponent,
    name,
    unstableVars: new Map(),
    stableVars: new Set()
  };
}

function getNearestComponentContext(stack: FunctionContext[]): FunctionContext | undefined {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const context = stack[index];
    if (context.isComponent) {
      return context;
    }
  }

  return undefined;
}

function markFunctionParametersStable(node: FunctionNode, componentContext: FunctionContext): void {
  if (!('params' in node)) {
    return;
  }

  for (const param of node.params) {
    switch (param.type) {
      case AST_NODE_TYPES.Identifier:
        markBindingStable(param as BindingTarget, componentContext);
        break;
      case AST_NODE_TYPES.RestElement:
        if (param.argument.type === AST_NODE_TYPES.Identifier) {
          markBindingStable(param as BindingTarget, componentContext);
        }
        break;
      case AST_NODE_TYPES.ObjectPattern:
        for (const property of param.properties) {
          if (property.type !== AST_NODE_TYPES.Property) {
            continue;
          }

          const value = property.value;
          if (value.type === AST_NODE_TYPES.Identifier) {
            markBindingStable(value as BindingTarget, componentContext);
          }
        }
        break;
      default:
        break;
    }
  }
}

function forEachPatternIdentifier(
  pattern: BindingTarget,
  iterate: (identifier: TSESTree.Identifier) => void
): void {
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      iterate(pattern);
      return;
    case AST_NODE_TYPES.ObjectPattern:
      for (const property of pattern.properties) {
        if (property.type === AST_NODE_TYPES.Property) {
          forEachPatternIdentifier(property.value as BindingTarget, iterate);
        } else if (property.type === AST_NODE_TYPES.RestElement) {
          forEachPatternIdentifier(property.argument as BindingTarget, iterate);
        }
      }
      return;
    case AST_NODE_TYPES.ArrayPattern:
      for (const element of pattern.elements) {
        if (!element) {
          continue;
        }
        forEachPatternIdentifier(element as BindingTarget, iterate);
      }
      return;
    case AST_NODE_TYPES.AssignmentPattern:
      forEachPatternIdentifier(pattern.left, iterate);
      return;
    case AST_NODE_TYPES.RestElement:
      forEachPatternIdentifier(pattern.argument as BindingTarget, iterate);
      return;
    default:
      break;
  }
}

function resetBinding(target: BindingTarget, componentContext: FunctionContext): void {
  forEachPatternIdentifier(target, identifier => {
    componentContext.unstableVars.delete(identifier.name);
    componentContext.stableVars.delete(identifier.name);
  });
}

function markBindingStable(target: BindingTarget, componentContext: FunctionContext): void {
  forEachPatternIdentifier(target, identifier => {
    componentContext.unstableVars.delete(identifier.name);
    componentContext.stableVars.add(identifier.name);
  });
}

function markIdentifierUnstable(
  name: string,
  kind: UnstableKind,
  componentContext: FunctionContext
): void {
  componentContext.unstableVars.set(name, kind);
  componentContext.stableVars.delete(name);
}

function markPatternUnstable(
  target: BindingTarget,
  kind: UnstableKind,
  componentContext: FunctionContext
): void {
  forEachPatternIdentifier(target, identifier => markIdentifierUnstable(identifier.name, kind, componentContext));
}

function isStableIdentifier(name: string, componentContext: FunctionContext): boolean {
  return componentContext.stableVars.has(name) && !componentContext.unstableVars.has(name);
}

function isStableReference(
  expression: TSESTree.Expression,
  componentContext: FunctionContext
): boolean {
  if (expression.type === AST_NODE_TYPES.Identifier) {
    return isStableIdentifier(expression.name, componentContext);
  }

  if (
    expression.type === AST_NODE_TYPES.MemberExpression &&
    !expression.computed &&
    expression.object.type === AST_NODE_TYPES.Identifier
  ) {
    return isStableIdentifier(expression.object.name, componentContext);
  }

  return false;
}

function buildObjectPropertyMap(expression: TSESTree.ObjectExpression): Map<string, TSESTree.Expression> {
  const map = new Map<string, TSESTree.Expression>();
  for (const property of expression.properties) {
    if (
      property.type !== AST_NODE_TYPES.Property ||
      property.computed ||
      property.key.type !== AST_NODE_TYPES.Identifier
    ) {
      continue;
    }

    const value = property.value;
    if (value) {
      map.set(property.key.name, value as TSESTree.Expression);
    }
  }
  return map;
}

function getTypeOfExpression(
  expression: TSESTree.Expression,
  tsUtils: TypeScriptUtils
): ts.Type | null {
  const tsNode = tsUtils.getTsNode(expression);
  if (!tsNode) {
    return null;
  }

  return tsUtils.checker.getTypeAtLocation(tsNode);
}

function isFunctionLikeType(
  type: ts.Type,
  tsUtils: TypeScriptUtils,
  seen: Set<ts.Type> = new Set()
): boolean {
  if (seen.has(type)) {
    return false;
  }
  seen.add(type);

  if (tsUtils.checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0) {
    return true;
  }

  if (type.isUnion() || type.isIntersection()) {
    return type.types.some(candidate => isFunctionLikeType(candidate, tsUtils, seen));
  }

  return false;
}

function isArrayLikeType(
  type: ts.Type,
  tsUtils: TypeScriptUtils,
  seen: Set<ts.Type> = new Set()
): boolean {
  if (seen.has(type)) {
    return false;
  }
  seen.add(type);

  if (tsUtils.checker.isArrayType(type) || tsUtils.checker.isTupleType(type)) {
    return true;
  }

  if (type.isUnion() || type.isIntersection()) {
    return type.types.some(candidate => isArrayLikeType(candidate, tsUtils, seen));
  }

  const textual = tsUtils.checker.typeToString(type);
    return textual.includes('Array<') || textual.includes('ReadonlyArray<');
}

function isObjectLikeType(type: ts.Type, seen: Set<ts.Type> = new Set()): boolean {
  if (seen.has(type)) {
    return false;
  }
  seen.add(type);

  if (type.isUnion() || type.isIntersection()) {
    return type.types.some(candidate => isObjectLikeType(candidate, seen));
  }

  return (type.getFlags() & (ts.TypeFlags.Object | ts.TypeFlags.NonPrimitive)) !== 0;
}

function evaluateExpressionKind(
  expression: TSESTree.Expression,
  componentContext: FunctionContext,
  tsUtils: TypeScriptUtils | null
): UnstableKind | null {
  const target = unwrapExpression(expression);

  if (target.type === AST_NODE_TYPES.Identifier) {
    if (isStableIdentifier(target.name, componentContext)) {
      return null;
    }
  }

  if (isInlineFunction(target)) {
    return 'function';
  }

  if (isInlineObject(target)) {
    return 'object';
  }

  if (target.type === AST_NODE_TYPES.Identifier) {
    const referencedKind = componentContext.unstableVars.get(target.name);
    if (referencedKind) {
      return referencedKind;
    }
  }

  if (!tsUtils) {
    return null;
  }

  const type = getTypeOfExpression(target, tsUtils);
  if (!type) {
    return null;
  }

  if (isFunctionLikeType(type, tsUtils)) {
    return 'function';
  }

  if (isObjectLikeType(type)) {
    return 'object';
  }

  return null;
}

function processBindingTarget(
  target: BindingTarget,
  sourceExpression: TSESTree.Expression | null,
  componentContext: FunctionContext,
  tsUtils: TypeScriptUtils | null
): void {
  if (sourceExpression && isStableReference(sourceExpression, componentContext)) {
    markBindingStable(target, componentContext);
    return;
  }

  if (target.type === AST_NODE_TYPES.Identifier) {
    if (sourceExpression && sourceExpression.type === AST_NODE_TYPES.Identifier) {
      const referencedKind = componentContext.unstableVars.get(sourceExpression.name);
      if (referencedKind) {
        markIdentifierUnstable(target.name, referencedKind, componentContext);
        return;
      }
    }

    if (sourceExpression) {
      const kind = evaluateExpressionKind(sourceExpression, componentContext, tsUtils);
      if (kind) {
        markIdentifierUnstable(target.name, kind, componentContext);
        return;
      }
    }

    componentContext.unstableVars.delete(target.name);
    return;
  }

  if (target.type === AST_NODE_TYPES.AssignmentPattern) {
    processBindingTarget(target.left, sourceExpression, componentContext, tsUtils);
    if (target.left.type === AST_NODE_TYPES.Identifier) {
      const defaultKind = evaluateExpressionKind(target.right as TSESTree.Expression, componentContext, tsUtils);
      if (defaultKind) {
        markIdentifierUnstable(target.left.name, defaultKind, componentContext);
      }
    }
    return;
  }

  if (target.type === AST_NODE_TYPES.ObjectPattern) {
    resetBinding(target, componentContext);

    if (sourceExpression && sourceExpression.type === AST_NODE_TYPES.ObjectExpression) {
      handleObjectPatternDeclarator(target, sourceExpression, componentContext, tsUtils);
      return;
    }

    if (sourceExpression && sourceExpression.type === AST_NODE_TYPES.Identifier) {
      const referencedKind = componentContext.unstableVars.get(sourceExpression.name);
      if (referencedKind) {
        markPatternUnstable(target, referencedKind, componentContext);
      } else if (isStableIdentifier(sourceExpression.name, componentContext)) {
        markBindingStable(target, componentContext);
      }
      return;
    }

    if (sourceExpression && tsUtils) {
      const type = getTypeOfExpression(sourceExpression, tsUtils);
      if (type && isObjectLikeType(type)) {
        markPatternUnstable(target, 'object', componentContext);
      }
    }
    return;
  }

  if (target.type === AST_NODE_TYPES.ArrayPattern) {
    resetBinding(target, componentContext);

    if (sourceExpression && sourceExpression.type === AST_NODE_TYPES.ArrayExpression) {
      handleArrayPatternDeclarator(target, sourceExpression, componentContext, tsUtils);
      return;
    }

    if (sourceExpression && sourceExpression.type === AST_NODE_TYPES.Identifier) {
      const referencedKind = componentContext.unstableVars.get(sourceExpression.name);
      if (referencedKind) {
        markPatternUnstable(target, referencedKind, componentContext);
      } else if (isStableIdentifier(sourceExpression.name, componentContext)) {
        markBindingStable(target, componentContext);
      }
      return;
    }

    if (sourceExpression && tsUtils) {
      const type = getTypeOfExpression(sourceExpression, tsUtils);
      if (type && (isObjectLikeType(type) || isArrayLikeType(type, tsUtils))) {
        markPatternUnstable(target, 'object', componentContext);
      }
    }
    return;
  }

  if (target.type === AST_NODE_TYPES.RestElement) {
    processBindingTarget(target.argument as BindingTarget, sourceExpression, componentContext, tsUtils);
    if (target.argument.type === AST_NODE_TYPES.Identifier) {
      markIdentifierUnstable(target.argument.name, 'object', componentContext);
    }
  }
}

function handleObjectPatternDeclarator(
  pattern: TSESTree.ObjectPattern,
  init: TSESTree.Expression,
  componentContext: FunctionContext,
  tsUtils: TypeScriptUtils | null
): void {
  resetBinding(pattern as BindingTarget, componentContext);

  if (init.type === AST_NODE_TYPES.Identifier) {
    if (isStableIdentifier(init.name, componentContext)) {
      markBindingStable(pattern as BindingTarget, componentContext);
      return;
    }

    const kind = componentContext.unstableVars.get(init.name);
    if (kind) {
      markPatternUnstable(pattern as BindingTarget, kind, componentContext);
    }
    return;
  }

  if (init.type === AST_NODE_TYPES.ObjectExpression) {
    const propertyValues = buildObjectPropertyMap(init);

    for (const property of pattern.properties) {
      if (property.type === AST_NODE_TYPES.RestElement) {
        if (property.argument.type === AST_NODE_TYPES.Identifier) {
          markIdentifierUnstable(property.argument.name, 'object', componentContext);
        }
        continue;
      }

      if (property.type !== AST_NODE_TYPES.Property || property.key.type !== AST_NODE_TYPES.Identifier) {
        continue;
      }

      const source = propertyValues.get(property.key.name) ?? null;
      const bindingTarget = property.value as BindingTarget;
      processBindingTarget(bindingTarget, source, componentContext, tsUtils);
    }
    return;
  }

  if (tsUtils) {
    const type = getTypeOfExpression(init, tsUtils);
    if (type && isObjectLikeType(type)) {
      markPatternUnstable(pattern as BindingTarget, 'object', componentContext);
    }
  }
}

function handleArrayPatternDeclarator(
  pattern: TSESTree.ArrayPattern,
  init: TSESTree.Expression,
  componentContext: FunctionContext,
  tsUtils: TypeScriptUtils | null
): void {
  resetBinding(pattern as BindingTarget, componentContext);

  if (init.type === AST_NODE_TYPES.Identifier) {
    if (isStableIdentifier(init.name, componentContext)) {
      markBindingStable(pattern as BindingTarget, componentContext);
      return;
    }

    const kind = componentContext.unstableVars.get(init.name);
    if (kind) {
      markPatternUnstable(pattern as BindingTarget, kind, componentContext);
    }
    return;
  }

  if (init.type === AST_NODE_TYPES.ArrayExpression) {
    pattern.elements.forEach((element, index) => {
      if (!element) {
        return;
      }

      const source = init.elements[index];
      if (!source) {
        processBindingTarget(element as BindingTarget, null, componentContext, tsUtils);
        return;
      }

      if (source.type === AST_NODE_TYPES.SpreadElement) {
        processBindingTarget(element as BindingTarget, source.argument as TSESTree.Expression, componentContext, tsUtils);
        if (
          element.type === AST_NODE_TYPES.RestElement &&
          element.argument.type === AST_NODE_TYPES.Identifier
        ) {
          markIdentifierUnstable(element.argument.name, 'object', componentContext);
        }
        return;
      }

      processBindingTarget(element as BindingTarget, source as TSESTree.Expression, componentContext, tsUtils);
    });
    return;
  }

  if (tsUtils) {
    const type = getTypeOfExpression(init, tsUtils);
    if (type && (isObjectLikeType(type) || isArrayLikeType(type, tsUtils))) {
      markPatternUnstable(pattern as BindingTarget, 'object', componentContext);
    }
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
    const tsUtils = getTypeScriptUtils(context, sourceCode);
    const functionStack: FunctionContext[] = [];

    function enterFunction(node: FunctionNode): void {
      const existingComponent = getNearestComponentContext(functionStack);
      const name = getFunctionName(node);
      const componentLike = isLikelyComponent(node, name, tsUtils);

      const contextEntry = createFunctionContext(node, componentLike, name);
      functionStack.push(contextEntry);

      if (componentLike) {
        markFunctionParametersStable(node, contextEntry);
      }

      if (existingComponent && componentLike) {
        // Nested component; keep tracking separately without marking as unstable.
        return;
      }

      if (
        existingComponent &&
        node.type === AST_NODE_TYPES.FunctionDeclaration &&
        node.id &&
        !isComponentName(node.id.name)
      ) {
        markIdentifierUnstable(node.id.name, 'function', existingComponent);
      }
    }

    function exitFunction(): void {
      functionStack.pop();
    }

    function handleVariableDeclarator(node: TSESTree.VariableDeclarator): void {
      const componentContext = getNearestComponentContext(functionStack);
      if (!componentContext || !node.init) {
        return;
      }

      const bindingTarget = node.id as BindingTarget;
      resetBinding(bindingTarget, componentContext);

      const unwrapped = unwrapExpression(node.init as TSESTree.Expression);

      if (isCallExpressionOf(unwrapped, ['useCallback', 'useMemo'])) {
        markBindingStable(bindingTarget, componentContext);
        return;
      }

      if (isStableReference(unwrapped, componentContext)) {
        markBindingStable(bindingTarget, componentContext);
        return;
      }

      if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
        handleObjectPatternDeclarator(node.id, unwrapped, componentContext, tsUtils);
        return;
      }

      if (node.id.type === AST_NODE_TYPES.ArrayPattern) {
        handleArrayPatternDeclarator(node.id, unwrapped, componentContext, tsUtils);
        return;
      }

      if (node.id.type !== AST_NODE_TYPES.Identifier) {
        return;
      }

      if (unwrapped.type === AST_NODE_TYPES.Identifier) {
        const referencedKind = componentContext.unstableVars.get(unwrapped.name);
        if (referencedKind) {
          markIdentifierUnstable(node.id.name, referencedKind, componentContext);
          return;
        }

        if (isStableIdentifier(unwrapped.name, componentContext)) {
          markBindingStable(bindingTarget, componentContext);
          return;
        }
      }

      const kind = evaluateExpressionKind(unwrapped, componentContext, tsUtils);
      if (kind) {
        markIdentifierUnstable(node.id.name, kind, componentContext);
        return;
      }

      componentContext.unstableVars.delete(node.id.name);
    }

    function reportInline(expression: TSESTree.Expression, propName: string): void {
      if (isInlineFunction(expression)) {
        if (!checkFunctions) {
          return;
        }
        context.report({
          node: expression,
          messageId: 'inlineFunctionProp',
          data: {
            propName
          }
        });
        return;
      }

      if (isInlineObject(expression)) {
        if (!checkObjects) {
          return;
        }
        context.report({
          node: expression,
          messageId: 'inlineObjectProp',
          data: {
            propName
          }
        });
      }
    }

    function handleJSXAttribute(node: TSESTree.JSXAttribute): void {
      const componentContext = getNearestComponentContext(functionStack);
      if (!componentContext) {
        return;
      }

      const openingElement = node.parent;
      if (!openingElement || openingElement.type !== AST_NODE_TYPES.JSXOpeningElement) {
        return;
      }

      if (!isCustomComponent(openingElement)) {
        return;
      }

      if (node.name.type !== AST_NODE_TYPES.JSXIdentifier) {
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

      if (isInlineFunction(unwrapped) || isInlineObject(unwrapped)) {
        reportInline(unwrapped, propName);
        return;
      }

      if (unwrapped.type === AST_NODE_TYPES.Identifier) {
        const kind = componentContext.unstableVars.get(unwrapped.name);
        if (!kind) {
          return;
        }

        if (kind === 'function' && !checkFunctions) {
          return;
        }

        if (kind === 'object' && !checkObjects) {
          return;
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
    }

    function handleJSXSpreadAttribute(node: TSESTree.JSXSpreadAttribute): void {
      const componentContext = getNearestComponentContext(functionStack);
      if (!componentContext) {
        return;
      }

      const openingElement = node.parent;
      if (!openingElement || openingElement.type !== AST_NODE_TYPES.JSXOpeningElement) {
        return;
      }

      if (!isCustomComponent(openingElement)) {
        return;
      }

      if (!checkSpreads) {
        return;
      }

      const expression = unwrapExpression(node.argument as TSESTree.Expression);
      const sourceText = sourceCode.getText(node.argument as TSESTree.Expression);

      if (expression.type === AST_NODE_TYPES.Identifier) {
        const kind = componentContext.unstableVars.get(expression.name);
        if (kind === 'object') {
          context.report({
            node: expression,
            messageId: 'spreadCreatesUnstableProps',
            data: {
              expression: expression.name
            }
          });
        }
        return;
      }

      if (isInlineObject(expression)) {
        context.report({
          node: expression,
          messageId: 'spreadCreatesUnstableProps',
          data: {
            expression: sourceText
          }
        });
        return;
      }

      if (expression.type === AST_NODE_TYPES.CallExpression && isCallExpressionOf(expression, ['useMemo', 'useCallback'])) {
        return;
      }

      const kind = evaluateExpressionKind(expression, componentContext, tsUtils);
      if (kind === 'object') {
        context.report({
          node: expression,
          messageId: 'spreadCreatesUnstableProps',
          data: {
            expression: sourceText
          }
        });
      }
    }

    return {
      Program(node: TSESTree.Program) {
        functionStack.push(createFunctionContext(node, false, null));
      },
      'Program:exit'() {
        functionStack.pop();
      },
      FunctionDeclaration: enterFunction,
      'FunctionDeclaration:exit': exitFunction,
      FunctionExpression: enterFunction,
      'FunctionExpression:exit': exitFunction,
      ArrowFunctionExpression: enterFunction,
      'ArrowFunctionExpression:exit': exitFunction,
      VariableDeclarator: handleVariableDeclarator,
      JSXAttribute: handleJSXAttribute,
      JSXSpreadAttribute: handleJSXSpreadAttribute
    };
  }
});
