use crate::analyzer::extract::{extract_all, ExportInfo, ImportMeta};
use dashmap::DashMap;
use rayon::prelude::*;
use serde::Serialize;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize)]
pub struct ComponentMeta {
    pub name: String,
    pub file_path: String,
    pub is_memoized: bool,
    pub props: Vec<PropInfo>,
    pub exports: Vec<ExportInfo>,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct PropInfo {
    pub name: String,
    pub kind: PropKind,
    pub is_stable: bool,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize)]
pub enum PropKind {
    Function,
    Object,
    Array,
    Primitive,
}

#[derive(Serialize)]
struct GraphSnapshot {
    components: std::collections::HashMap<String, ComponentMeta>,
    imports: std::collections::HashMap<String, Vec<ImportMeta>>,
    exports: std::collections::HashMap<String, Vec<ExportInfo>>,
}

pub struct MetadataGraph {
    pub components: Arc<DashMap<String, ComponentMeta>>,
    pub imports: Arc<DashMap<String, Vec<ImportMeta>>>,
    pub exports: Arc<DashMap<String, Vec<ExportInfo>>>,
}

impl MetadataGraph {
    pub fn index_project(project_root: &str) -> Self {
        let files = find_all_source_files(project_root);

        let components = Arc::new(DashMap::new());
        let imports = Arc::new(DashMap::new());
        let exports = Arc::new(DashMap::new());

        files.par_iter().for_each(|file_path| {
            if let Ok(source) = std::fs::read_to_string(file_path) {
                let (mut comps, imps, exps) = extract_all(&source, file_path);

                if !imps.is_empty() { imports.insert(file_path.clone(), imps); }
                if !exps.is_empty() { exports.insert(file_path.clone(), exps.clone()); }

                for c in comps.drain(..) {
                    let mut comp = c;
                    comp.file_path = file_path.clone();
                    // anexar exports do mesmo arquivo
                    comp.exports = exps.clone();
                    components.insert(file_path.clone(), comp);
                }
            }
        });

        Self { components, imports, exports }
    }

    pub fn get_memo_boundary(&self, symbol: &str) -> Option<ComponentMeta> {
        self.components
            .iter()
            .find(|entry| entry.value().exports.iter().any(|e| e.name == symbol))
            .map(|e| e.value().clone())
    }

    pub fn is_component_memoized(&self, file: &str) -> bool {
        self.components.get(file).map(|c| c.is_memoized).unwrap_or(false)
    }

    pub fn to_json(&self) -> String {
        let components_map = self
            .components
            .iter()
            .map(|e| (e.key().clone(), e.value().clone()))
            .collect();
        let imports_map = self
            .imports
            .iter()
            .map(|e| (e.key().clone(), e.value().clone()))
            .collect();
        let exports_map = self
            .exports
            .iter()
            .map(|e| (e.key().clone(), e.value().clone()))
            .collect();
        serde_json::to_string(&GraphSnapshot { components: components_map, imports: imports_map, exports: exports_map }).unwrap_or_else(|_| "{}".into())
    }
}

pub fn find_all_source_files(root: &str) -> Vec<String> {
    use walkdir::WalkDir;
    let mut out = Vec::new();
    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        let p = entry.path();
        if p.is_file() {
            // skip common heavy dirs
            if p.components().any(|c| {
                let s = c.as_os_str();
                s == "node_modules" || s == "dist" || s == "build" || s == ".git" || s == "target"
            }) {
                continue;
            }
            if let Some(ext) = p.extension() {
                if ext == "ts" || ext == "tsx" || ext == "js" || ext == "jsx" {
                    out.push(p.to_string_lossy().to_string());
                }
            }
        }
    }
    out
}
