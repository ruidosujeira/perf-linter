import path from 'path';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';

type SymbolKind =
  | 'function'
  | 'class'
  | 'variable'
  | 'enum'
  | 'interface'
  | 'type'
  | 'namespace'
  | 'unknown';

type UsageKind = 'call' | 'new' | 'jsx';

interface Range {
  start: number;
  end: number;
}

export interface UsageRecord {
  kind: UsageKind;
  fileName: string;
  range: Range;
  // Optional prop-level metadata when the usage is a JSX element
  propName?: string | null;
  argumentText?: string | null;
  isInline?: boolean;
  isIdentifier?: boolean;
}

export interface ImportRecord {
  moduleName: string;
  imported: string | null;
  local: string;
  isTypeOnly: boolean;
  isNamespace: boolean;
  resolvedFileName: string | null;
}

export interface ExportRecord {
  exportName: string;
  isDefault: boolean;
  isTypeOnly: boolean;
  symbol: CrossFileSymbolReference;
}

export interface FileSummary {
  fileName: string;
  imports: ImportRecord[];
  exports: ExportRecord[];
}

export interface PropUsageDetail {
  fileName: string;
  range: Range;
  propName: string;
  argumentText: string | null;
  isInline: boolean;
  isIdentifier: boolean;
}

export interface ComponentPropMetadata {
  kind: 'function' | 'object' | 'other';
  isOptional: boolean;
}

interface ExportBindingInternal {
  fileName: string;
  exportName: string;
  isDefault: boolean;
  isTypeOnly: boolean;
}

interface SymbolMetadata {
  declaredName: string;
  kind: SymbolKind;
  declarationFile: string | null;
  isComponent: boolean;
  isHook: boolean;
  isAsync: boolean;
  returnsPromise: boolean;
  isMemoizedComponent: boolean;
  componentProps: Record<string, ComponentPropMetadata> | null;
}

const analyzerCache = new WeakMap<ts.Program, CrossFileAnalyzer>();

function normalizeFileName(fileName: string): string {
  return path.normalize(fileName).replace(/\\/g, '/');
}

function firstDefined<T>(values: readonly (T | undefined)[]): T | undefined {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

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
  private readonly symbolExports = new Map<ts.Symbol, ExportBindingInternal[]>();
  private readonly fileSummaries = new Map<string, FileSummary>();
  private readonly symbolUsages = new Map<ts.Symbol, UsageRecord[]>();
  // index mapping component symbol -> array of prop usage details seen across files
  private readonly componentPropUsages = new Map<ts.Symbol, PropUsageDetail[]>();
  private moduleIndexBuilt = false;
  private usageIndexBuilt = false;

  constructor(private readonly program: ts.Program) {
    this.checker = program.getTypeChecker();
  }

  getTypeChecker(): ts.TypeChecker {
    return this.checker;
  }

  getFileSummary(fileName: string): FileSummary | null {
    this.ensureModuleIndex();
    const normalized = normalizeFileName(fileName);
    const summary = this.fileSummaries.get(normalized);
    return summary ? { ...summary, imports: [...summary.imports], exports: [...summary.exports] } : null;
  }

  findExportedSymbol(fileName: string, exportName: string): CrossFileSymbolReference | null {
    this.ensureModuleIndex();
    const normalized = normalizeFileName(fileName);
    const summary = this.fileSummaries.get(normalized);
    if (!summary) {
      return null;
    }

    for (const record of summary.exports) {
      if (record.exportName === exportName) {
        return record.symbol;
      }
    }

    return null;
  }

  findSymbolsByExportName(exportName: string): CrossFileSymbolReference[] {
    this.ensureModuleIndex();
    const results: CrossFileSymbolReference[] = [];
    for (const [symbol, bindings] of this.symbolExports) {
      if (bindings.some(binding => binding.exportName === exportName)) {
        results.push(this.getSymbolHandle(symbol));
      }
    }

    return results;
  }

  isPromiseLikeExpression(node: ts.Expression): boolean {
    const type = this.checker.getTypeAtLocation(node);
    return this.isPromiseLikeType(type);
  }

  getUsagesForSymbol(symbol: ts.Symbol): ReadonlyArray<UsageRecord> {
    this.ensureUsageIndex();
    const resolved = this.resolveAliasedSymbol(symbol);
    const usages = this.symbolUsages.get(resolved);
    return usages ? [...usages] : [];
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
    this.ensureModuleIndex();
    const resolved = this.resolveAliasedSymbol(symbol);
    const bindings = this.symbolExports.get(resolved);
    return bindings ? [...bindings] : [];
  }

  private ensureModuleIndex(): void {
    if (this.moduleIndexBuilt) {
      return;
    }

    this.moduleIndexBuilt = true;

    for (const sourceFile of this.program.getSourceFiles()) {
      if (!this.shouldAnalyzeFile(sourceFile)) {
        continue;
      }

      const fileName = normalizeFileName(sourceFile.fileName);
      const imports = this.collectImports(sourceFile);
      const summary: FileSummary = {
        fileName,
        imports,
        exports: []
      };
      this.fileSummaries.set(fileName, summary);

      const moduleSymbol = this.checker.getSymbolAtLocation(sourceFile);
      if (!moduleSymbol) {
        continue;
      }

      const exportedSymbols = this.checker.getExportsOfModule(moduleSymbol);
      for (const exported of exportedSymbols) {
        const binding = this.registerExport(exported, summary);
        if (binding) {
          summary.exports.push(binding);
        }
      }
    }
  }

  private ensureUsageIndex(): void {
    if (this.usageIndexBuilt) {
      return;
    }

    this.usageIndexBuilt = true;

    for (const sourceFile of this.program.getSourceFiles()) {
      if (!this.shouldAnalyzeFile(sourceFile)) {
        continue;
      }

      this.collectUsages(sourceFile);
    }
  }

  private shouldAnalyzeFile(sourceFile: ts.SourceFile): boolean {
    if (sourceFile.isDeclarationFile) {
      return false;
    }

    const normalized = normalizeFileName(sourceFile.fileName);
    if (normalized.includes('/node_modules/')) {
      return false;
    }

    if (normalized.endsWith('.json')) {
      return false;
    }

    return true;
  }

  private registerExport(exported: ts.Symbol, summary: FileSummary): ExportRecord | null {
    const exportName = exported.getName();
    const valueSymbol = this.resolveAliasedSymbol(exported);
    const handle = this.getSymbolHandle(valueSymbol);

    if (!handle) {
      return null;
    }

    const isTypeOnly = this.isTypeOnlyExport(exported);
    const bindings = this.symbolExports.get(valueSymbol) ?? [];
    const record: ExportBindingInternal = {
      fileName: summary.fileName,
      exportName,
      isDefault: exportName === 'default',
      isTypeOnly
    };
    bindings.push(record);
    this.symbolExports.set(valueSymbol, bindings);

    return {
      exportName,
      isDefault: record.isDefault,
      isTypeOnly,
      symbol: handle
    };
  }

  private collectImports(sourceFile: ts.SourceFile): ImportRecord[] {
    const records: ImportRecord[] = [];

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }

      const moduleName = statement.moduleSpecifier.text;
      const resolvedFileName = this.resolveModuleFileName(sourceFile, moduleName);
      const importClause = statement.importClause;

      if (!importClause) {
        // Side-effect import
        continue;
      }

      if (importClause.name) {
        records.push({
          moduleName,
          imported: 'default',
          local: importClause.name.text,
          isTypeOnly: importClause.isTypeOnly,
          isNamespace: false,
          resolvedFileName
        });
      }

      if (!importClause.namedBindings) {
        continue;
      }

      if (ts.isNamespaceImport(importClause.namedBindings)) {
        records.push({
          moduleName,
          imported: '*',
          local: importClause.namedBindings.name.text,
          isTypeOnly: importClause.isTypeOnly,
          isNamespace: true,
          resolvedFileName
        });
        continue;
      }

      for (const element of importClause.namedBindings.elements) {
        const importedName = element.propertyName ? element.propertyName.text : element.name.text;
        records.push({
          moduleName,
          imported: importedName,
          local: element.name.text,
          isTypeOnly: importClause.isTypeOnly || element.isTypeOnly,
          isNamespace: false,
          resolvedFileName
        });
      }
    }

    return records;
  }

  private resolveModuleFileName(sourceFile: ts.SourceFile, moduleName: string): string | null {
    const resolvedModules = (sourceFile as ts.SourceFile & {
      resolvedModules?: Map<string, ts.ResolvedModuleFull | undefined>;
    }).resolvedModules;

    const viaSource = resolvedModules?.get(moduleName);
    if (viaSource?.resolvedFileName) {
      return normalizeFileName(viaSource.resolvedFileName);
    }

    try {
      const resolution = ts.resolveModuleName(
        moduleName,
        sourceFile.fileName,
        this.program.getCompilerOptions(),
        ts.sys
      );
      const resolved = resolution.resolvedModule?.resolvedFileName;
      return resolved ? normalizeFileName(resolved) : null;
    } catch {
      return null;
    }
  }

  private collectUsages(sourceFile: ts.SourceFile): void {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        this.recordUsage(sourceFile, node.expression, node, 'call');
      } else if (ts.isNewExpression(node)) {
        this.recordUsage(sourceFile, node.expression, node, 'new');
      } else if (ts.isJsxOpeningLikeElement(node)) {
        const tag = node.tagName;
        if (ts.isIdentifier(tag) && /^[A-Z]/.test(tag.text)) {
          // record usage for the component itself
          this.recordUsage(sourceFile, tag, node, 'jsx');

          // collect prop-level usage details
          const props = this.collectJsxPropUsages(node, sourceFile);
          if (props.length > 0) {
            const compSymbol = this.checker.getSymbolAtLocation(tag);
            if (compSymbol) {
              const resolved = this.resolveAliasedSymbol(compSymbol);
              const list = this.componentPropUsages.get(resolved) ?? [];
              for (const p of props) {
                list.push(p);
              }
              this.componentPropUsages.set(resolved, list);
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  private recordUsage(
    sourceFile: ts.SourceFile,
    expression: ts.Expression | ts.Identifier,
    node: ts.Node,
    kind: UsageKind
  ): void {
    const symbol = this.checker.getSymbolAtLocation(expression);
    if (!symbol) {
      return;
    }

    const resolved = this.resolveAliasedSymbol(symbol);
    const declarations = resolved.declarations ?? [];
    if (declarations.length === 0) {
      return;
    }

    const currentFile = normalizeFileName(sourceFile.fileName);
    const hasExternalDeclaration = declarations.some((declaration: ts.Declaration) =>
      normalizeFileName(declaration.getSourceFile().fileName) !== currentFile
    );

    if (!hasExternalDeclaration) {
      return;
    }

    const list = this.symbolUsages.get(resolved) ?? [];
    list.push({
      kind,
      fileName: currentFile,
      range: {
        start: node.getStart(),
        end: node.getEnd()
      }
    });
    this.symbolUsages.set(resolved, list);
  }

  private collectJsxPropUsages(node: ts.JsxOpeningLikeElement, sourceFile: ts.SourceFile): PropUsageDetail[] {
    const out: PropUsageDetail[] = [];
    const fileName = normalizeFileName(sourceFile.fileName);
    const attrs = (node.attributes && (node.attributes as ts.JsxAttributes).properties) || [];

    const pushUsage = (
      propName: string,
      rangeNode: ts.Node,
      argumentText: string | null,
      isInline: boolean,
      isIdentifier: boolean
    ): void => {
      out.push({
        fileName,
        range: {
          start: rangeNode.getStart(sourceFile, false),
          end: rangeNode.getEnd()
        },
        propName,
        argumentText,
        isInline,
        isIdentifier
      });
    };

    const unwrapExpression = (expr: ts.Expression): ts.Expression => {
      let current: ts.Expression = expr;
      while (ts.isParenthesizedExpression(current)) {
        current = current.expression;
      }
      return current;
    };

    const isPrimitiveLiteral = (expr: ts.Expression): boolean => {
      const node = unwrapExpression(expr);
      if (ts.isLiteralExpression(node)) {
        return true;
      }

      switch (node.kind) {
        case ts.SyntaxKind.TrueKeyword:
        case ts.SyntaxKind.FalseKeyword:
        case ts.SyntaxKind.NullKeyword:
        case ts.SyntaxKind.UndefinedKeyword:
          return true;
        default:
          break;
      }

      if (ts.isPrefixUnaryExpression(node)) {
        return isPrimitiveLiteral(node.operand);
      }

      return false;
    };

    const isInlineExpression = (expr: ts.Expression): boolean => {
      const node = unwrapExpression(expr);
      if (
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node) ||
        ts.isObjectLiteralExpression(node) ||
        ts.isArrayLiteralExpression(node) ||
        ts.isNewExpression(node) ||
        ts.isClassExpression(node) ||
        ts.isTemplateExpression(node)
      ) {
        return true;
      }

      if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
        return true;
      }

      return false;
    };

    const extractExpressionDetails = (
      expr: ts.Expression
    ): { argumentText: string; isInline: boolean; isIdentifier: boolean } => {
      const unwrapped = unwrapExpression(expr);
      const isIdentifier = ts.isIdentifier(unwrapped);
      const isInline = !isIdentifier && !isPrimitiveLiteral(unwrapped) && isInlineExpression(unwrapped);

      return {
        argumentText: expr.getText(sourceFile),
        isInline,
        isIdentifier
      };
    };

    const handleObjectLiteral = (literal: ts.ObjectLiteralExpression): void => {
      for (const property of literal.properties) {
        if (ts.isPropertyAssignment(property)) {
          const name = property.name.getText(sourceFile);
          const initializer = property.initializer;
          if (!initializer) {
            continue;
          }

          const { argumentText, isInline, isIdentifier } = extractExpressionDetails(initializer);
          pushUsage(name, initializer, argumentText, isInline, isIdentifier);
        } else if (ts.isShorthandPropertyAssignment(property)) {
          const name = property.name.getText(sourceFile);
          const rangeNode = property.name;
          pushUsage(name, rangeNode, property.name.getText(sourceFile), false, true);
        } else if (
          ts.isMethodDeclaration(property) ||
          ts.isGetAccessorDeclaration(property) ||
          ts.isSetAccessorDeclaration(property)
        ) {
          const name = property.name.getText(sourceFile);
          pushUsage(name, property, property.getText(sourceFile), true, false);
        } else if (ts.isSpreadAssignment(property)) {
          handleSpread(property.expression, property);
        }
      }
    };

    const handleSpread = (expression: ts.Expression | undefined, rangeNode: ts.Node): void => {
      if (!expression) {
        pushUsage('<<spread>>', rangeNode, null, false, false);
        return;
      }

      const unwrapped = unwrapExpression(expression);
      if (ts.isObjectLiteralExpression(unwrapped)) {
        handleObjectLiteral(unwrapped);
        return;
      }

      const details = extractExpressionDetails(expression);
      pushUsage('<<spread>>', expression, details.argumentText, false, details.isIdentifier);
    };

    for (const attr of attrs) {
      if (ts.isJsxAttribute(attr)) {
        const name = ts.isIdentifier(attr.name) ? attr.name.text : attr.name.getText(sourceFile);
        let argumentText: string | null = null;
        let isInline = false;
        let isIdentifier = false;

        let rangeNode: ts.Node = attr;

        if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
          const expr = attr.initializer.expression;
          const details = extractExpressionDetails(expr);
          argumentText = details.argumentText;
          isInline = details.isInline;
          isIdentifier = details.isIdentifier;
          rangeNode = expr;
        }

        pushUsage(name, rangeNode, argumentText, isInline, isIdentifier);
      } else if (ts.isJsxSpreadAttribute(attr)) {
        handleSpread(attr.expression ?? undefined, attr.expression ?? attr);
      }
    }

    return out;
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

    const callee = node.expression;
    if (ts.isIdentifier(callee)) {
      return callee.text === 'memo' || callee.text === 'forwardRef';
    }

    if (ts.isPropertyAccessExpression(callee)) {
      const propName = callee.name.text;
      return propName === 'memo' || propName === 'forwardRef';
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
      } catch {
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
    if (declarations.length === 0) {
      return [];
    }

    const declaration = declarations[0];
    const location = declaration;
    const type = this.checker.getTypeOfSymbolAtLocation(symbol, location);
    return type.getCallSignatures();
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
    const textual = this.checker.typeToString(type);
    return /(?:JSX\.Element|React\.?Element|ReactNode)/.test(textual);
  }

  private resolveAliasedSymbol(symbol: ts.Symbol): ts.Symbol {
    if (symbol.flags & ts.SymbolFlags.Alias) {
      try {
        return this.checker.getAliasedSymbol(symbol);
      } catch {
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
      } catch {
        // ignore
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
      } catch {
        // ignore
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
      const textual = this.checker.typeToString(type);
      if (/^Promise(?:<.*>)?$/.test(textual) || /\bPromise<.*>/.test(textual)) {
        result = true;
      }
    }

    if (!result && type.isUnion()) {
      result = type.types.length > 0 && type.types.every((part: ts.Type) => this.isPromiseLikeType(part));
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
