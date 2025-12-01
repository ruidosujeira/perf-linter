use serde::{Serialize, Deserialize};
use swc_common::{errors::{ColorConfig, Handler}, sync::Lrc, FileName, SourceMap, Span};
use swc_ecma_ast::*;
use swc_ecma_parser::{EsConfig, Parser, StringInput, Syntax, TsConfig};
use swc_ecma_visit::{Visit, VisitWith};
use super::metadata::{ComponentMeta, PropInfo, PropKind};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExportKind { Named, Default }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportInfo {
    pub name: String,
    pub kind: ExportKind,
    pub line: usize,
}

// PropKind/PropInfo são definidos em metadata.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSpecifierMeta {
    pub local: String,
    pub imported: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportMeta {
    pub source: String,
    pub specifiers: Vec<ImportSpecifierMeta>,
    pub line: usize,
}

#[derive(Default)]
struct MetadataExtractor {
    components: Vec<ComponentMeta>,
    imports: Vec<ImportMeta>,
    exports: Vec<ExportInfo>,
}

fn span_line(span: Span) -> usize { span.lo.0 as usize }

fn is_identifier_react_memo(expr: &Expr) -> bool {
    // Detect React.memo or memo (common import)
    match expr {
        Expr::Member(MemberExpr { obj, prop, .. }) => {
            if let Expr::Ident(obj_ident) = &**obj {
                if obj_ident.sym.as_ref() == "React" {
                    if let MemberProp::Ident(p) = prop { return p.sym.as_ref() == "memo"; }
                }
            }
            false
        }
        Expr::Ident(id) => id.sym.as_ref() == "memo",
        _ => false,
    }
}

fn expr_ident_name(expr: &Expr) -> Option<String> {
    match expr { Expr::Ident(i) => Some(i.sym.to_string()), _ => None }
}

fn extract_import_specifier(s: &ImportSpecifier) -> ImportSpecifierMeta {
    match s {
        ImportSpecifier::Named(n) => ImportSpecifierMeta {
            local: n.local.sym.to_string(),
            imported: n.imported.as_ref().map(|im| match im { ModuleExportName::Ident(i) => i.sym.to_string(), ModuleExportName::Str(st) => st.value.to_string() }),
        },
        ImportSpecifier::Default(d) => ImportSpecifierMeta { local: d.local.sym.to_string(), imported: Some("default".into()) },
        ImportSpecifier::Namespace(ns) => ImportSpecifierMeta { local: ns.local.sym.to_string(), imported: Some("*".into()) },
    }
}

fn params_to_props(params: &[Param]) -> Vec<PropInfo> {
    let mut props = Vec::new();
    for p in params {
        match &p.pat {
            Pat::Ident(bi) => props.push(PropInfo { name: bi.sym.to_string(), kind: PropKind::Primitive, is_stable: true, line: span_line(bi.id.span) }),
            Pat::Object(_) => props.push(PropInfo { name: "props".into(), kind: PropKind::Object, is_stable: false, line: span_line(p.span) }),
            Pat::Array(_) => props.push(PropInfo { name: "props".into(), kind: PropKind::Array, is_stable: false, line: span_line(p.span) }),
            _ => props.push(PropInfo { name: "arg".into(), kind: PropKind::Primitive, is_stable: true, line: span_line(p.span) }),
        }
    }
    props
}

impl Visit for MetadataExtractor {
    fn visit_fn_decl(&mut self, func: &FnDecl) {
        // Heurística simples: considerar qualquer FnDecl como "componente" potencial
        // Se o nome começa com maiúscula, tratamos como React component.
        let name = func.ident.sym.to_string();
        let is_component = name.chars().next().map(|c| c.is_uppercase()).unwrap_or(false);
        if is_component {
            let props = params_to_props(&func.function.params);
            self.components.push(ComponentMeta {
                name: name.clone(),
                file_path: String::new(),
                is_memoized: false,
                props,
                exports: vec![],
                line: span_line(func.ident.span),
            });
        }
        func.visit_children_with(self);
    }

    fn visit_var_declarator(&mut self, d: &VarDeclarator) {
        // Detectar const Comp = React.memo(...) ou const Comp = () => <JSX/>
        if let Some(Ident { sym, span, .. }) = d.name.as_ident() {
            let name = sym.to_string();
            let is_component = name.chars().next().map(|c| c.is_uppercase()).unwrap_or(false);
            if let Some(init) = &d.init {
                match &**init {
                    Expr::Call(CallExpr { callee, args, .. }) => {
                        let callee_expr = match callee { Callee::Expr(e) => &**e, _ => { d.visit_children_with(self); return; } };
                        if is_identifier_react_memo(callee_expr) {
                            // Primeiro arg deve ser ident do componente
                            if let Some(first) = args.get(0).map(|a| &*a.expr) {
                                if let Some(comp_name) = expr_ident_name(first) {
                                    if let Some(c) = self.components.iter_mut().find(|c| c.name == comp_name) {
                                        c.is_memoized = true;
                                    } else {
                                        self.components.push(ComponentMeta {
                                            name: comp_name,
                                            file_path: String::new(),
                                            is_memoized: true,
                                            props: vec![],
                                            exports: vec![],
                                            line: span_line(*span),
                                        });
                                    }
                                }
                            }
                        }
                    }
                    Expr::Arrow(_) | Expr::Fn(_) => {
                        if is_component {
                            self.components.push(ComponentMeta {
                                name: name.clone(),
                                file_path: String::new(),
                                is_memoized: false,
                                props: vec![],
                                exports: vec![],
                                line: span_line(*span),
                            });
                        }
                    }
                    _ => {}
                }
            }
        }
        d.visit_children_with(self);
    }

    fn visit_call_expr(&mut self, call: &CallExpr) {
        // já marcado em var_declarator quando possível
        call.visit_children_with(self);
    }

    fn visit_import_decl(&mut self, import: &ImportDecl) {
        let specifiers = import.specifiers.iter().map(extract_import_specifier).collect();
        self.imports.push(ImportMeta { source: import.src.value.to_string(), specifiers, line: span_line(import.span) });
    }

    fn visit_export_decl(&mut self, export: &ExportDecl) {
        match &export.decl {
            Decl::Fn(func) => self.exports.push(ExportInfo { name: func.ident.sym.to_string(), kind: ExportKind::Named, line: span_line(export.span) }),
            Decl::Var(v) => {
                for d in &v.decls {
                    if let Some(id) = d.name.as_ident() {
                        self.exports.push(ExportInfo { name: id.sym.to_string(), kind: ExportKind::Named, line: span_line(export.span) });
                    }
                }
            }
            _ => {}
        }
    }

    fn visit_export_default_expr(&mut self, e: &ExportDefaultExpr) {
        // name is not obvious; mark as default
        self.exports.push(ExportInfo { name: "default".into(), kind: ExportKind::Default, line: span_line(e.span) });
    }
}

fn parse_module(source: &str, filename: &str) -> Option<Module> {
    let cm: Lrc<SourceMap> = Default::default();
    let handler = Handler::with_tty_emitter(ColorConfig::Auto, true, false, Some(cm.clone()));
    let fname = FileName::Custom(filename.to_string());
    let fm = cm.new_source_file(fname, source.into());
    let input = StringInput::from(&*fm);
    let is_ts = filename.ends_with(".ts") || filename.ends_with(".tsx") || filename.ends_with(".d.ts");
    let syntax = if is_ts { Syntax::Typescript(TsConfig { tsx: filename.ends_with(".tsx"), decorators: true, dts: filename.ends_with(".d.ts"), no_early_errors: true, ..Default::default() }) } else { Syntax::Es(EsConfig { jsx: filename.ends_with(".jsx") || filename.ends_with(".tsx"), decorators: true, ..Default::default() }) };
    let mut p = Parser::new(syntax, input, None);
    match p.parse_module() {
        Ok(m) => Some(m),
        Err(e) => { e.into_diagnostic(&handler).emit(); None }
    }
}

pub fn extract_all(source: &str, filename: &str) -> (Vec<ComponentMeta>, Vec<ImportMeta>, Vec<ExportInfo>) {
    if let Some(module) = parse_module(source, filename) {
        let mut ex = MetadataExtractor::default();
        module.visit_with(&mut ex);
        (ex.components, ex.imports, ex.exports)
    } else {
        (Vec::new(), Vec::new(), Vec::new())
    }
}
