use crate::analyzer::extract::{extract_all, ExportInfo, ImportMeta};
use crate::cache::IncrementalCache;
use dashmap::DashMap;
use rayon::prelude::*;
use serde::{Serialize, Deserialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentMeta {
    pub name: String,
    pub file_path: String,
    pub is_memoized: bool,
    pub props: Vec<PropInfo>,
    pub exports: Vec<ExportInfo>,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PropInfo {
    pub name: String,
    pub kind: PropKind,
    pub is_stable: bool,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PropKind {
    Function,
    Object,
    Array,
    Primitive,
}

/// Cacheable extraction result
#[derive(Debug, Clone, Serialize, Deserialize)]
struct FileAnalysis {
    components: Vec<ComponentMeta>,
    imports: Vec<ImportMeta>,
    exports: Vec<ExportInfo>,
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
    /// Index a project with incremental caching for performance
    pub fn index_project(project_root: &str) -> Self {
        Self::index_project_with_cache(project_root, true)
    }

    /// Index a project with optional cache control
    pub fn index_project_with_cache(project_root: &str, use_cache: bool) -> Self {
        let files = find_all_source_files(project_root);

        let components = Arc::new(DashMap::new());
        let imports = Arc::new(DashMap::new());
        let exports = Arc::new(DashMap::new());

        // Create cache in system temp directory
        let cache_dir = std::env::temp_dir().join("perf_linter_cache");
        let cache = if use_cache {
            Some(Arc::new(IncrementalCache::<FileAnalysis>::new(&cache_dir, "0.6.0")))
        } else {
            None
        };

        files.par_iter().for_each(|file_path| {
            if let Ok(source) = std::fs::read_to_string(file_path) {
                // Try to get from cache first
                let (mut comps, imps, exps) = if let Some(ref cache) = cache {
                    if let Some(cached) = cache.get(file_path, &source) {
                        (cached.components, cached.imports, cached.exports)
                    } else {
                        let result = extract_all(&source, file_path);
                        // Store in cache for next time
                        cache.set(file_path, &source, FileAnalysis {
                            components: result.0.clone(),
                            imports: result.1.clone(),
                            exports: result.2.clone(),
                        });
                        result
                    }
                } else {
                    extract_all(&source, file_path)
                };

                if !imps.is_empty() {
                    imports.insert(file_path.clone(), imps);
                }
                if !exps.is_empty() {
                    exports.insert(file_path.clone(), exps.clone());
                }

                for c in comps.drain(..) {
                    let mut comp = c;
                    comp.file_path = file_path.clone();
                    // anexar exports do mesmo arquivo
                    comp.exports = exps.clone();
                    components.insert(file_path.clone(), comp);
                }
            }
        });

        Self {
            components,
            imports,
            exports,
        }
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
