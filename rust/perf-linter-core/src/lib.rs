pub mod parser;
pub mod bridge;

// Re-export selected API for consumers
pub use parser::{parse_file, traverse_ast, AstNode, NodeKind, SpanJson};
