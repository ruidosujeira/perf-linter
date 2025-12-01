pub mod parser;
pub mod bridge;
pub mod cache;
pub mod analyzer {
    pub mod extract;
    pub mod metadata;
}

// Re-export selected API for consumers
pub use parser::{parse_file, traverse_ast, AstNode, NodeKind, SpanJson};
pub use cache::{IncrementalCache, CacheEntry, CacheStats};
