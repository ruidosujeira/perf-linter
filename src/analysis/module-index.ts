import * as ts from 'typescript';
import { ExportRecord, FileSummary, ImportRecord } from './domain';
import { normalizeFileName, shouldAnalyzeSourceFile } from './shared';

export interface ModuleIndexOptions {
  program: ts.Program;
  checker: ts.TypeChecker;
  resolveAliasedSymbol(symbol: ts.Symbol): ts.Symbol;
  isTypeOnlyExport(symbol: ts.Symbol): boolean;
  debug?(message: string, details?: unknown): void;
}

export interface ModuleIndexStats {
  filesIndexed: number;
  isFullyBuilt: boolean;
}

export class ModuleIndex {
  private readonly fileSummaries = new Map<string, FileSummary<ts.Symbol>>();
  private readonly symbolExports = new Map<ts.Symbol, ExportRecord<ts.Symbol>[]>();
  private readonly builtFiles = new Set<string>();
  private readonly sourceFileByName = new Map<string, ts.SourceFile>();
  private readonly moduleImporters = new Map<string, Set<string>>();
  private processedFileCount = 0;
  private isFullyBuilt = false;

  constructor(private readonly options: ModuleIndexOptions) {
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

  getFileSummary(fileName: string): FileSummary<ts.Symbol> | null {
    const normalized = normalizeFileName(fileName);
    this.ensureFile(normalized);
    const summary = this.fileSummaries.get(normalized);
    if (!summary) {
      return null;
    }

    return {
      fileName: summary.fileName,
      imports: [...summary.imports],
      exports: summary.exports.map(exp => ({ ...exp }))
    };
  }

  findExportedSymbol(fileName: string, exportName: string): ts.Symbol | null {
    const normalized = normalizeFileName(fileName);
    this.ensureFile(normalized);
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

  findSymbolsByExportName(exportName: string): ts.Symbol[] {
    this.ensure();
    const results: ts.Symbol[] = [];
    for (const [symbol, bindings] of this.symbolExports) {
      if (bindings.some(binding => binding.exportName === exportName)) {
        results.push(symbol);
      }
    }
    return results;
  }

  getExportBindings(symbol: ts.Symbol): readonly ExportRecord<ts.Symbol>[] {
    this.ensure();
    const resolved = this.options.resolveAliasedSymbol(symbol);
    const bindings = this.symbolExports.get(resolved);
    return bindings ? [...bindings] : [];
  }

  getImporterFilesForSymbol(symbol: ts.Symbol): readonly string[] {
    this.ensure();
    const resolved = this.options.resolveAliasedSymbol(symbol);
    const candidateModules = new Set<string>();
    const bindings = this.symbolExports.get(resolved) ?? [];
    for (const binding of bindings) {
      if (binding.fileName) {
        candidateModules.add(binding.fileName);
      }
    }

    const declarations = resolved.declarations ?? [];
    for (const declaration of declarations) {
      candidateModules.add(normalizeFileName(declaration.getSourceFile().fileName));
    }

    const importerFiles = new Set<string>();
    for (const moduleFile of candidateModules) {
      const importers = this.moduleImporters.get(moduleFile);
      if (!importers) {
        continue;
      }

      for (const importer of importers) {
        importerFiles.add(importer);
      }
    }

    return [...importerFiles];
  }

  getStats(): ModuleIndexStats {
    return {
      filesIndexed: this.processedFileCount,
      isFullyBuilt: this.isFullyBuilt
    };
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

    const imports = this.collectImports(sourceFile);
    const summary: FileSummary<ts.Symbol> = {
      fileName: normalized,
      imports,
      exports: []
    };
    this.fileSummaries.set(normalized, summary);

    this.registerImporters(normalized, imports);

    const moduleSymbol = this.options.checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) {
      return;
    }

    const exportedSymbols = this.options.checker.getExportsOfModule(moduleSymbol);
    for (const exported of exportedSymbols) {
      const record = this.registerExport(exported, summary);
      if (record) {
        summary.exports.push(record);
      }
    }
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

  private registerExport(exported: ts.Symbol, summary: FileSummary<ts.Symbol>): ExportRecord<ts.Symbol> | null {
    const exportName = exported.getName();
    const valueSymbol = this.options.resolveAliasedSymbol(exported);

    const isTypeOnly = this.options.isTypeOnlyExport(exported);
    const bindings = this.symbolExports.get(valueSymbol) ?? [];
    const record: ExportRecord<ts.Symbol> = {
      fileName: summary.fileName,
      exportName,
      isDefault: exportName === 'default',
      isTypeOnly,
      symbol: valueSymbol
    };
    bindings.push(record);
    this.symbolExports.set(valueSymbol, bindings);
    return record;
  }

  private registerImporters(importingFile: string, imports: readonly ImportRecord[]): void {
    for (const record of imports) {
      if (!record.resolvedFileName) {
        continue;
      }

      let importers = this.moduleImporters.get(record.resolvedFileName);
      if (!importers) {
        importers = new Set<string>();
        this.moduleImporters.set(record.resolvedFileName, importers);
      }
      importers.add(importingFile);
    }
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
        this.options.program.getCompilerOptions(),
        ts.sys
      );
      const resolved = resolution.resolvedModule?.resolvedFileName;
      return resolved ? normalizeFileName(resolved) : null;
    } catch (error) {
      if (this.options.debug) {
        this.options.debug('moduleIndex:resolveModuleFileNameFailed', { moduleName, error });
      }
      return null;
    }
  }
}
