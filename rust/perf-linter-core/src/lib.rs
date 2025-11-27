pub mod parser;
pub mod bridge;
pub mod analyzer {
    pub mod extract;
    pub mod metadata;
}

// Re-export selected API for consumers
pub use parser::{parse_file, traverse_ast, AstNode, NodeKind, SpanJson};
