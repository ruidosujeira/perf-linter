import * as ts from 'typescript';
import { PropUsageDetail, SPREAD_SENTINEL, UsageKind, UsageRecord } from './domain';
import { normalizeFileName, shouldAnalyzeSourceFile } from './shared';

export interface UsageIndexOptions {
  program: ts.Program;
  checker: ts.TypeChecker;
  resolveAliasedSymbol(symbol: ts.Symbol): ts.Symbol;
  getImporterFilesForSymbol?(symbol: ts.Symbol): readonly string[];
  debug?(message: string, details?: unknown): void;
}

export interface UsageIndexStats {
  filesIndexed: number;
  isFullyBuilt: boolean;
}

export class UsageIndex {
  private readonly symbolUsages = new Map<ts.Symbol, UsageRecord[]>();
  private readonly componentPropUsages = new Map<ts.Symbol, PropUsageDetail[]>();
  private readonly builtFiles = new Set<string>();
  private readonly sourceFileByName = new Map<string, ts.SourceFile>();
  private processedFileCount = 0;
  private isFullyBuilt = false;

  constructor(private readonly options: UsageIndexOptions) {
    for (const sourceFile of this.options.program.getSourceFiles()) {
      const normalized = normalizeFileName(sourceFile.fileName);
      this.sourceFileByName.set(normalized, sourceFile);
    }
  }

  ensure(): void {
    if (this.isFullyBuilt) {
      return;
    }

    for (const sourceFile of this.options.program.getSourceFiles()) {
      this.ensureSourceFile(sourceFile);
    }

    this.isFullyBuilt = true;
  }

  getUsagesForSymbol(symbol: ts.Symbol): UsageRecord[] {
    this.ensureSymbol(symbol);
    const resolved = this.options.resolveAliasedSymbol(symbol);
    const list = this.symbolUsages.get(resolved);
    return list ? [...list] : [];
  }

  getPropUsagesForComponent(symbol: ts.Symbol): PropUsageDetail[] {
    this.ensureSymbol(symbol);
    const resolved = this.options.resolveAliasedSymbol(symbol);
    const list = this.componentPropUsages.get(resolved);
    return list ? [...list] : [];
  }

  getStats(): UsageIndexStats {
    return {
      filesIndexed: this.processedFileCount,
      isFullyBuilt: this.isFullyBuilt
    };
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
          this.recordUsage(sourceFile, tag, node, 'jsx');

          const props = this.collectJsxPropUsages(node, sourceFile);
          if (props.length > 0) {
            const compSymbol = this.options.checker.getSymbolAtLocation(tag);
            if (compSymbol) {
              const resolved = this.options.resolveAliasedSymbol(compSymbol);
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

  private ensureSymbol(symbol: ts.Symbol): void {
    const resolved = this.options.resolveAliasedSymbol(symbol);

    const filesToEnsure = new Set<string>();
    const declarations = resolved.declarations ?? [];
    for (const declaration of declarations) {
      filesToEnsure.add(normalizeFileName(declaration.getSourceFile().fileName));
    }

    const importerFiles = this.options.getImporterFilesForSymbol?.(resolved) ?? null;
    if (!importerFiles) {
      this.ensure();
      return;
    }

    for (const importer of importerFiles) {
      filesToEnsure.add(normalizeFileName(importer));
    }

    for (const fileName of filesToEnsure) {
      this.ensureFile(fileName);
    }
  }

  private ensureFile(normalizedFileName: string): void {
    if (this.isFullyBuilt || this.builtFiles.has(normalizedFileName)) {
      return;
    }

    const sourceFile = this.sourceFileByName.get(normalizedFileName);
    if (!sourceFile) {
      return;
    }

    this.ensureSourceFile(sourceFile);
  }

  private ensureSourceFile(sourceFile: ts.SourceFile): void {
    const normalized = normalizeFileName(sourceFile.fileName);
    if (this.isFullyBuilt || this.builtFiles.has(normalized)) {
      return;
    }

    this.builtFiles.add(normalized);

    if (!shouldAnalyzeSourceFile(sourceFile)) {
      return;
    }

    this.processedFileCount += 1;
    this.collectUsages(sourceFile);
  }

  private recordUsage(
    sourceFile: ts.SourceFile,
    expression: ts.Expression | ts.Identifier,
    node: ts.Node,
    kind: UsageKind
  ): void {
    const symbol = this.options.checker.getSymbolAtLocation(expression);
    if (!symbol) {
      return;
    }

    const resolved = this.options.resolveAliasedSymbol(symbol);
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
        pushUsage(SPREAD_SENTINEL, rangeNode, null, false, false);
        return;
      }

      const unwrapped = unwrapExpression(expression);
      if (ts.isObjectLiteralExpression(unwrapped)) {
        handleObjectLiteral(unwrapped);
        return;
      }

      const details = extractExpressionDetails(expression);
      pushUsage(SPREAD_SENTINEL, expression, details.argumentText, false, details.isIdentifier);
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
}
