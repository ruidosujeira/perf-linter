import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';
import {
  ComponentPropMetadata,
  ExportBinding,
  ExportRecord as DomainExportRecord,
  FileSummary as DomainFileSummary,
  REACT_RETURN_RE,
  PropUsageDetail,
  SymbolKind,
  SymbolMetadata,
  UsageRecord
} from './domain';
import { ModuleIndex, ModuleIndexStats } from './module-index';
import { firstDefined, normalizeFileName } from './shared';
import { UsageIndex, UsageIndexStats } from './usage-index';

type AnalyzerExportRecord = DomainExportRecord<CrossFileSymbolReference>;
type AnalyzerFileSummary = DomainFileSummary<CrossFileSymbolReference>;

interface ExportBindingInternal extends ExportBinding {}

export interface CrossFileAnalyzerOptions {
  debug?(message: string, details?: unknown): void;
}

export type ExportRecord = AnalyzerExportRecord;
export type FileSummary = AnalyzerFileSummary;
export type { UsageRecord, PropUsageDetail, ComponentPropMetadata, ImportRecord, SymbolKind } from './domain';
export { SPREAD_SENTINEL, REACT_RETURN_RE } from './domain';

const analyzerCache = new WeakMap<ts.Program, CrossFileAnalyzer>();

function isFunctionLikeDeclaration(node: ts.Declaration): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isConstructorDeclaration(node)
  );
}

export class CrossFileSymbolReference {
  constructor(private readonly analyzer: CrossFileAnalyzer, private readonly symbol: ts.Symbol) {}

  get declaredName(): string {
    return this.analyzer.getSymbolMetadata(this.symbol).declaredName;
  }

  get canonicalName(): string {
    return this.symbol.getName();
  }

  get kind(): SymbolKind {
    return this.analyzer.getSymbolMetadata(this.symbol).kind;
  }

  get declarationFile(): string | null {
    return this.analyzer.getSymbolMetadata(this.symbol).declarationFile;
  }

  get isComponent(): boolean {
    return this.analyzer.getSymbolMetadata(this.symbol).isComponent;
  }

  get isHook(): boolean {
    return this.analyzer.getSymbolMetadata(this.symbol).isHook;
  }

  get isAsync(): boolean {
    return this.analyzer.getSymbolMetadata(this.symbol).isAsync;
  }

  get returnsPromise(): boolean {
    return this.analyzer.getSymbolMetadata(this.symbol).returnsPromise;
  }

  get isMemoizedComponent(): boolean {
    return this.analyzer.getSymbolMetadata(this.symbol).isMemoizedComponent;
  }

  get componentProps(): Record<string, ComponentPropMetadata> | null {
    return this.analyzer.getSymbolMetadata(this.symbol).componentProps;
  }

  getExportBindings(): ReadonlyArray<ExportBindingInternal> {
    return this.analyzer.getExportBindings(this.symbol);
  }

  getUsages(): ReadonlyArray<UsageRecord> {
    return this.analyzer.getUsagesForSymbol(this.symbol);
  }

  getPropUsages(): ReadonlyArray<PropUsageDetail> {
    return this.analyzer.getComponentPropUsages(this.symbol);
  }

  /**
   * Expose underlying TypeScript symbol for advanced integrations when needed.
   * Consumers should avoid holding onto this beyond the current lint pass.
   */
  getInternalSymbol(): ts.Symbol {
    return this.symbol;
  }
}

export class CrossFileAnalyzer {
  private readonly checker: ts.TypeChecker;
  private readonly promiseTypeCache = new WeakMap<ts.Type, boolean>();
  private readonly symbolMetadataCache = new Map<ts.Symbol, SymbolMetadata>();
  private readonly symbolHandles = new Map<ts.Symbol, CrossFileSymbolReference>();
  private readonly moduleIndex: ModuleIndex;
  private readonly usageIndex: UsageIndex;
  private readonly callSignatureCache = new Map<ts.Symbol, readonly ts.Signature[]>();
  private readonly debug?: (message: string, details?: unknown) => void;

  constructor(private readonly program: ts.Program, options: CrossFileAnalyzerOptions = {}) {
    this.checker = program.getTypeChecker();
    this.debug = options.debug;
    this.moduleIndex = new ModuleIndex({
      program: this.program,
      checker: this.checker,
      resolveAliasedSymbol: this.resolveAliasedSymbol.bind(this),
      isTypeOnlyExport: this.isTypeOnlyExport.bind(this),
      debug: this.debug
    });
    this.usageIndex = new UsageIndex({
      program: this.program,
      checker: this.checker,
      resolveAliasedSymbol: this.resolveAliasedSymbol.bind(this),
      getImporterFilesForSymbol: this.getImporterFilesForSymbol.bind(this),
      debug: this.debug
    });
  }

  getTypeChecker(): ts.TypeChecker {
    return this.checker;
  }

  getFileSummary(fileName: string): FileSummary | null {
    const summary = this.moduleIndex.getFileSummary(fileName);
    if (!summary) {
      return null;
    }

    return {
      fileName: summary.fileName,
      imports: summary.imports.map(importRecord => ({ ...importRecord })),
      exports: summary.exports.map(exportRecord => ({
        fileName: exportRecord.fileName ?? summary.fileName,
        exportName: exportRecord.exportName,
        isDefault: exportRecord.isDefault,
        isTypeOnly: exportRecord.isTypeOnly,
        symbol: this.getSymbolHandle(exportRecord.symbol)
      }))
    };
  }

  findExportedSymbol(fileName: string, exportName: string): CrossFileSymbolReference | null {
    const summary = this.moduleIndex.getFileSummary(fileName);
    if (!summary) {
      return null;
    }

    const match = summary.exports.find(record => record.exportName === exportName);
    return match ? this.getSymbolHandle(match.symbol) : null;
  }

  findSymbolsByExportName(exportName: string): CrossFileSymbolReference[] {
    const symbols = this.moduleIndex.findSymbolsByExportName(exportName);
    return symbols.map(symbol => this.getSymbolHandle(symbol));
  }

  isPromiseLikeExpression(node: ts.Expression): boolean {
    const type = this.checker.getTypeAtLocation(node);
    return this.isPromiseLikeType(type);
  }

  getUsagesForSymbol(symbol: ts.Symbol): ReadonlyArray<UsageRecord> {
    return this.usageIndex.getUsagesForSymbol(symbol);
  }

  getComponentPropUsages(symbol: ts.Symbol): ReadonlyArray<PropUsageDetail> {
    return this.usageIndex.getPropUsagesForComponent(this.resolveAliasedSymbol(symbol));
  }

  getSymbolMetadata(symbol: ts.Symbol): SymbolMetadata {
    const resolved = this.resolveAliasedSymbol(symbol);
    let metadata = this.symbolMetadataCache.get(resolved);
    if (metadata) {
      return metadata;
    }

    metadata = this.computeSymbolMetadata(resolved);
    this.symbolMetadataCache.set(resolved, metadata);
    return metadata;
  }

  getExportBindings(symbol: ts.Symbol): ReadonlyArray<ExportBindingInternal> {
    const bindings = this.moduleIndex.getExportBindings(symbol);
    return bindings.map(binding => ({
      fileName: this.resolveBindingFileName(binding),
      exportName: binding.exportName,
      isDefault: binding.isDefault,
      isTypeOnly: binding.isTypeOnly,
      symbol: binding.symbol
    }));
  }

  getStats(): { moduleIndex: ModuleIndexStats; usageIndex: UsageIndexStats } {
    return {
      moduleIndex: this.moduleIndex.getStats(),
      usageIndex: this.usageIndex.getStats()
    };
  }

  private resolveBindingFileName(binding: DomainExportRecord<ts.Symbol>): string {
    if (binding.fileName) {
      return binding.fileName;
    }

    const declaration = binding.symbol.declarations?.[0];
    return declaration ? normalizeFileName(declaration.getSourceFile().fileName) : '<unknown>';
  }

  private debugLog(message: string, details?: unknown): void {
    if (this.debug) {
      this.debug(message, details);
    }
  }

  private serializeError(error: unknown): { message: string; stack?: string } | { value: unknown } {
    if (error instanceof Error) {
      return { message: error.message, stack: error.stack };
    }

    return { value: error };
  }



  private getSymbolHandle(symbol: ts.Symbol): CrossFileSymbolReference {
    const resolved = this.resolveAliasedSymbol(symbol);
    let handle = this.symbolHandles.get(resolved);
    if (!handle) {
      handle = new CrossFileSymbolReference(this, resolved);
      this.symbolHandles.set(resolved, handle);
    }

    return handle;
  }

  private getImporterFilesForSymbol(symbol: ts.Symbol): readonly string[] {
    return this.moduleIndex.getImporterFilesForSymbol(symbol);
  }

  private determineSymbolKind(symbol: ts.Symbol): SymbolKind {
    const flags = symbol.getFlags();

    if (flags & ts.SymbolFlags.Function) {
      return 'function';
    }

    if (flags & ts.SymbolFlags.Class) {
      return 'class';
    }

    if (flags & ts.SymbolFlags.Variable) {
      return 'variable';
    }

    if (flags & ts.SymbolFlags.Enum) {
      return 'enum';
    }

    if (flags & ts.SymbolFlags.Interface) {
      return 'interface';
    }

    if (flags & ts.SymbolFlags.TypeAlias) {
      return 'type';
    }

    if (flags & ts.SymbolFlags.NamespaceModule) {
      return 'namespace';
    }

    return 'unknown';
  }

  private computeSymbolMetadata(symbol: ts.Symbol): SymbolMetadata {
    const declarations = symbol.declarations ?? [];
    const valueDeclaration = symbol.valueDeclaration ?? declarations[0] ?? null;
    const declarationFile = valueDeclaration
      ? normalizeFileName(valueDeclaration.getSourceFile().fileName)
      : null;

    const declaredName = this.resolveDeclaredName(symbol, valueDeclaration);
    const kind = this.determineSymbolKind(symbol);
    const isComponent = this.isLikelyComponent(symbol, declarations);
    const isHook = /^use[A-Z0-9].*/.test(declaredName);
    const isAsync = this.isAsyncSymbol(symbol, declarations);
    const returnsPromise = this.symbolReturnsPromise(symbol, declarations);
    let isMemoizedComponent = false;
    let componentProps: Record<string, ComponentPropMetadata> | null = null;

    if (isComponent) {
      const extras = this.computeComponentMetadata(symbol, declarations);
      isMemoizedComponent = extras.isMemoized;
      componentProps = extras.props;
    }

    return {
      declaredName,
      kind,
      declarationFile,
      isComponent,
      isHook,
      isAsync,
      returnsPromise,
      isMemoizedComponent,
      componentProps
    };
  }

  private computeComponentMetadata(
    symbol: ts.Symbol,
    declarations: readonly ts.Declaration[]
  ): { isMemoized: boolean; props: Record<string, ComponentPropMetadata> | null } {
    let isMemoized = false;

    for (const declaration of declarations) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        if (this.isMemoWrapperCall(declaration.initializer)) {
          isMemoized = true;
          break;
        }
      }

      const parent = declaration.parent;
      if (parent && ts.isCallExpression(parent) && this.isMemoWrapperCall(parent)) {
        isMemoized = true;
        break;
      }

      if (parent && ts.isExportAssignment(parent) && ts.isCallExpression(parent.expression)) {
        if (this.isMemoWrapperCall(parent.expression) && parent.expression.arguments.some(arg => this.expressionReferencesSymbol(arg, symbol))) {
          isMemoized = true;
          break;
        }
      }
    }

    if (!isMemoized) {
      // Scan declarators that wrap the component symbol in memo(...) elsewhere
      for (const declaration of declarations) {
        const sourceFile = declaration.getSourceFile();
        const memoized = this.scanForMemoWrapperUsage(sourceFile, symbol);
        if (memoized) {
          isMemoized = true;
          break;
        }
      }
    }

    const props = this.collectComponentPropMetadata(symbol, declarations);

    return {
      isMemoized,
      props
    };
  }

  private isMemoWrapperCall(node: ts.Expression): boolean {
    if (!ts.isCallExpression(node)) {
      return false;
    }

    if (this.isReactMemoAccessor(node.expression)) {
      return true;
    }

    return node.arguments.some(arg => this.isMemoWrapperCall(arg));
  }

  private isReactMemoAccessor(expression: ts.Expression): boolean {
    if (ts.isIdentifier(expression)) {
      return expression.text === 'memo' || expression.text === 'forwardRef';
    }

    if (ts.isPropertyAccessExpression(expression)) {
      const propName = expression.name.text;
      if (propName !== 'memo' && propName !== 'forwardRef') {
        return false;
      }

      return true;
    }

    return false;
  }

  private expressionReferencesSymbol(expression: ts.Expression, target: ts.Symbol): boolean {
    const referenced = this.checker.getSymbolAtLocation(expression);
    if (!referenced) {
      return false;
    }

    const resolvedReferenced = this.resolveAliasedSymbol(referenced);
    const resolvedTarget = this.resolveAliasedSymbol(target);
    return resolvedReferenced === resolvedTarget;
  }

  private scanForMemoWrapperUsage(sourceFile: ts.SourceFile, symbol: ts.Symbol): boolean {
    let isMemoized = false;
    const visit = (node: ts.Node): void => {
      if (isMemoized) {
        return;
      }

      if (ts.isCallExpression(node) && this.isMemoWrapperCall(node)) {
        if (node.arguments.some(arg => this.expressionReferencesSymbol(arg, symbol))) {
          isMemoized = true;
          return;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return isMemoized;
  }

  private collectComponentPropMetadata(
    symbol: ts.Symbol,
    declarations: readonly ts.Declaration[]
  ): Record<string, ComponentPropMetadata> | null {
    const callSignatures = this.getCallSignatures(symbol, declarations);
    if (callSignatures.length === 0) {
      return null;
    }

    const props: Record<string, ComponentPropMetadata> = {};
    const visitedTypes = new Set<ts.Type>();

    for (const signature of callSignatures) {
      if (signature.parameters.length === 0) {
        continue;
      }

      const propsParam = signature.parameters[0];
      const location =
        propsParam.valueDeclaration ??
        propsParam.declarations?.[0] ??
        signature.declaration ??
        declarations[0] ??
        null;

      if (!location) {
        continue;
      }

      const propsType = this.checker.getTypeOfSymbolAtLocation(propsParam, location);
      this.populatePropMetadataFromType(propsType, props, visitedTypes);
    }

    return Object.keys(props).length > 0 ? props : null;
  }

  private populatePropMetadataFromType(
    type: ts.Type,
    out: Record<string, ComponentPropMetadata>,
    seen: Set<ts.Type>
  ): void {
    if (seen.has(type)) {
      return;
    }
    seen.add(type);

    if (type.isUnion() || type.isIntersection()) {
      for (const part of type.types) {
        this.populatePropMetadataFromType(part, out, seen);
      }
      return;
    }

    const baseTypes = this.getBaseTypesSafe(type);
    for (const base of baseTypes) {
      this.populatePropMetadataFromType(base, out, seen);
    }

    const properties = type.getProperties();
    if (properties.length === 0) {
      return;
    }

    for (const property of properties) {
      const name = property.getName();
      if (Object.prototype.hasOwnProperty.call(out, name)) {
        continue;
      }

      const location = property.valueDeclaration ?? property.declarations?.[0] ?? null;
      if (!location) {
        continue;
      }

      const propType = this.checker.getTypeOfSymbolAtLocation(property, location);
      out[name] = {
        kind: this.classifyPropType(propType),
        isOptional: (property.getFlags() & ts.SymbolFlags.Optional) !== 0
      };
    }
  }

  private classifyPropType(type: ts.Type): ComponentPropMetadata['kind'] {
    if (type.getCallSignatures().length > 0) {
      return 'function';
    }

    if (type.isUnion() || type.isIntersection()) {
      let hasFunction = false;
      let hasObject = false;
      for (const part of type.types) {
        const kind = this.classifyPropType(part);
        if (kind === 'function') {
          hasFunction = true;
        } else if (kind === 'object') {
          hasObject = true;
        }
      }

      if (hasFunction) {
        return 'function';
      }

      if (hasObject) {
        return 'object';
      }

      return 'other';
    }

    if (this.isObjectLikeType(type)) {
      return 'object';
    }

    return 'other';
  }

  private isObjectLikeType(type: ts.Type): boolean {
    if (type.getFlags() & ts.TypeFlags.Object) {
      return true;
    }

    if (type.isUnion() || type.isIntersection()) {
      return type.types.some(part => this.isObjectLikeType(part));
    }

    return false;
  }

  private getBaseTypesSafe(type: ts.Type): readonly ts.Type[] {
    if ('getBaseTypes' in type && typeof type.getBaseTypes === 'function') {
      try {
        return type.getBaseTypes() ?? [];
      } catch (error) {
        this.debugLog('getBaseTypes.fail', { error: this.serializeError(error) });
        return [];
      }
    }

    return [];
  }

  private resolveDeclaredName(symbol: ts.Symbol, declaration: ts.Declaration | null): string {
    const directName = this.extractIdentifierName(declaration);
    if (directName) {
      return directName;
    }

    const name = symbol.getName();
    if (name === 'default') {
      const inferred = firstDefined<string>(
        (symbol.declarations ?? []).map((decl: ts.Declaration) => this.extractIdentifierName(decl) ?? undefined)
      );
      if (inferred) {
        return inferred;
      }
    }

    return name;
  }

  private extractIdentifierName(node: ts.Declaration | null): string | null {
    if (!node) {
      return null;
    }

    const named = node as ts.NamedDeclaration;
    if (named.name && ts.isIdentifier(named.name)) {
      return named.name.text;
    }

    return null;
  }

  private hasAsyncModifier(node: ts.Node): boolean {
    const flags = ts.getCombinedModifierFlags(node as ts.Declaration);
    return (flags & ts.ModifierFlags.Async) !== 0;
  }

  private isAsyncSymbol(symbol: ts.Symbol, declarations: readonly ts.Declaration[]): boolean {
    for (const declaration of declarations) {
      if (
        ts.isFunctionLike(declaration) &&
        this.hasAsyncModifier(declaration)
      ) {
        return true;
      }

      if (
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer &&
        ts.isArrowFunction(declaration.initializer) &&
        this.hasAsyncModifier(declaration.initializer)
      ) {
        return true;
      }
    }

    const callSignatures = this.getCallSignatures(symbol, declarations);
    return callSignatures.some(signature => {
      const declaration = signature.declaration;
      if (!declaration || !ts.isFunctionLike(declaration)) {
        return false;
      }

      const modifiers = ts.canHaveModifiers(declaration)
        ? ts.getModifiers(declaration)
        : undefined;

      if (!modifiers) {
        return false;
      }

      return modifiers.some((mod: ts.ModifierLike) => mod.kind === ts.SyntaxKind.AsyncKeyword);
    });
  }

  private symbolReturnsPromise(symbol: ts.Symbol, declarations: readonly ts.Declaration[]): boolean {
    const callSignatures = this.getCallSignatures(symbol, declarations);
    if (callSignatures.length === 0) {
      return false;
    }

    // Ensure every signature is promise-like to avoid false positives.
    return callSignatures.every(signature => this.isPromiseLikeType(signature.getReturnType()));
  }

  private getCallSignatures(
    symbol: ts.Symbol,
    declarations: readonly ts.Declaration[]
  ): readonly ts.Signature[] {
    const resolved = this.resolveAliasedSymbol(symbol);
    const cached = this.callSignatureCache.get(resolved);
    if (cached) {
      return cached;
    }

    if (declarations.length === 0) {
      this.callSignatureCache.set(resolved, []);
      return [];
    }

    const type = this.checker.getTypeOfSymbolAtLocation(resolved, declarations[0]);
    const signatures = type.getCallSignatures();
    this.callSignatureCache.set(resolved, signatures);
    return signatures;
  }

  private isLikelyComponent(symbol: ts.Symbol, declarations: readonly ts.Declaration[]): boolean {
    const metadataName = this.resolveDeclaredName(symbol, symbol.valueDeclaration ?? declarations[0] ?? null);
    const hasComponentName = /^[A-Z]/.test(metadataName);

    for (const declaration of declarations) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) {
          if (this.functionBodyReturnsJsx(declaration.initializer)) {
            return true;
          }
        }

        if (this.isMemoWrapperCall(declaration.initializer)) {
          return true;
        }
      }

      if (isFunctionLikeDeclaration(declaration) && this.functionBodyReturnsJsx(declaration)) {
        return true;
      }
    }

    if (!hasComponentName) {
      return false;
    }

    const callSignatures = this.getCallSignatures(symbol, declarations);
    return callSignatures.some(signature => this.returnTypeLooksLikeReactElement(signature.getReturnType()));
  }

  private functionBodyReturnsJsx(node: ts.FunctionLikeDeclarationBase): boolean {
    if (!node.body) {
      return false;
    }

    if (ts.isJsxElement(node.body) || ts.isJsxFragment(node.body) || ts.isJsxSelfClosingElement(node.body)) {
      return true;
    }

    if (ts.isParenthesizedExpression(node.body)) {
      return this.containsJsx(node.body.expression);
    }

    if (!ts.isBlock(node.body)) {
      return false;
    }

    for (const statement of node.body.statements) {
      if (ts.isReturnStatement(statement) && statement.expression && this.containsJsx(statement.expression)) {
        return true;
      }
    }

    return false;
  }

  private containsJsx(expression: ts.Expression): boolean {
    if (ts.isJsxElement(expression) || ts.isJsxFragment(expression) || ts.isJsxSelfClosingElement(expression)) {
      return true;
    }

    if (ts.isParenthesizedExpression(expression)) {
      return this.containsJsx(expression.expression);
    }

    return false;
  }

  private returnTypeLooksLikeReactElement(type: ts.Type): boolean {
    if (!this.mightBeReactElementCandidate(type)) {
      return false;
    }

    try {
      const textual = this.checker.typeToString(type);
      return REACT_RETURN_RE.test(textual);
    } catch (error) {
      this.debugLog('typeToString.fail', { error: this.serializeError(error) });
      return false;
    }
  }

  private mightBeReactElementCandidate(type: ts.Type): boolean {
    if (type.getCallSignatures().length > 0) {
      return true;
    }

    if (type.flags & ts.TypeFlags.Object) {
      return true;
    }

    if (type.isUnion()) {
      return type.types.some(part => this.mightBeReactElementCandidate(part));
    }

    if (type.isIntersection()) {
      return type.types.some(part => this.mightBeReactElementCandidate(part));
    }

    return false;
  }

  private resolveAliasedSymbol(symbol: ts.Symbol): ts.Symbol {
    if (symbol.flags & ts.SymbolFlags.Alias) {
      try {
        return this.checker.getAliasedSymbol(symbol);
      } catch (error) {
        this.debugLog('resolveAlias.fail', {
          symbol: symbol.getName(),
          error: this.serializeError(error)
        });
        return symbol;
      }
    }

    return symbol;
  }

  private isTypeOnlyExport(exported: ts.Symbol): boolean {
    if (exported.flags & ts.SymbolFlags.Type) {
      return true;
    }

    if (!exported.declarations) {
      return false;
    }

    return exported.declarations.every((declaration: ts.Declaration) =>
      ts.isTypeAliasDeclaration(declaration)
    );
  }

  private isPromiseLikeType(type: ts.Type): boolean {
    const cached = this.promiseTypeCache.get(type);
    if (cached !== undefined) {
      return cached;
    }

    if (type.isUnion()) {
      const result = type.types.length > 0 && type.types.every((part: ts.Type) => this.isPromiseLikeType(part));
      this.promiseTypeCache.set(type, result);
      return result;
    }

    let result = false;

    const checkerWithPromise = this.checker as ts.TypeChecker & {
      getPromisedTypeOfPromise?: (type: ts.Type) => ts.Type | undefined;
    };

    if (!result && typeof checkerWithPromise.getPromisedTypeOfPromise === 'function') {
      try {
        const promised = checkerWithPromise.getPromisedTypeOfPromise(type);
        if (promised) {
          result = true;
        }
      } catch (error) {
        this.debugLog('promiseType.getPromised.fail', { error: this.serializeError(error) });
      }
    }

    const checkerWithAwait = this.checker as ts.TypeChecker & {
      getAwaitedType?: (type: ts.Type, errorNode?: ts.Node, shouldThrow?: boolean) => ts.Type;
    };

    if (!result && typeof checkerWithAwait.getAwaitedType === 'function') {
      try {
        const awaited: ts.Type = checkerWithAwait.getAwaitedType(type, undefined, false);
        if (awaited !== type) {
          result = true;
        }
      } catch (error) {
        this.debugLog('promiseType.getAwaited.fail', { error: this.serializeError(error) });
      }
    }

    if (!result) {
      const thenProperty = type.getProperty('then');
      if (thenProperty) {
        const location = thenProperty.valueDeclaration ?? thenProperty.declarations?.[0];
        if (location) {
          const signatures = this.checker.getSignaturesOfType(
            this.checker.getTypeOfSymbolAtLocation(thenProperty, location),
            ts.SignatureKind.Call
          );
          if (signatures.some((signature: ts.Signature) => signature.parameters.length >= 1)) {
            result = true;
          }
        }
      }
    }

    if (!result) {
      try {
        const textual = this.checker.typeToString(type);
        if (/^Promise(?:<.*>)?$/.test(textual) || /\bPromise<.*>/.test(textual)) {
          result = true;
        }
      } catch (error) {
        this.debugLog('promiseType.toString.fail', { error: this.serializeError(error) });
      }
    }

    this.promiseTypeCache.set(type, result);
    return result;
  }
}

export interface AnalyzerServices {
  analyzer: CrossFileAnalyzer;
  getTypeScriptNode(node: TSESTree.Node): ts.Node | null;
}

function resolveParserServices(
  context: TSESLint.RuleContext<string, readonly unknown[]>
): { esTreeNodeToTSNodeMap: { get(node: TSESTree.Node): ts.Node | undefined }; program: ts.Program } | null {
  const sourceCode = context.getSourceCode();
  const candidate = (sourceCode as unknown as { parserServices?: unknown }).parserServices ?? context.parserServices;

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const services = candidate as {
    esTreeNodeToTSNodeMap?: { get(node: TSESTree.Node): ts.Node | undefined };
    program?: ts.Program;
  };

  if (!services.program || !services.esTreeNodeToTSNodeMap) {
    return null;
  }

  return {
    esTreeNodeToTSNodeMap: services.esTreeNodeToTSNodeMap,
    program: services.program
  };
}

export function getCrossFileAnalyzer(
  context: TSESLint.RuleContext<string, readonly unknown[]>
): AnalyzerServices | null {
  const services = resolveParserServices(context);
  if (!services) {
    return null;
  }

  const { program, esTreeNodeToTSNodeMap } = services;
  let analyzer = analyzerCache.get(program);
  if (!analyzer) {
    analyzer = new CrossFileAnalyzer(program);
    analyzerCache.set(program, analyzer);
  }

  return {
    analyzer,
    getTypeScriptNode(node: TSESTree.Node): ts.Node | null {
      return esTreeNodeToTSNodeMap.get(node) ?? null;
    }
  };
}
