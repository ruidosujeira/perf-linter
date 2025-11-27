use crate::parser;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn parse_file(source: String) -> Result<String> {
    match parser::parse_file(&source) {
        Ok(ast) => {
            let s = serde_json::to_string(&ast)
                .map_err(|e| Error::from_reason(format!("serialize ast failed: {}", e)))?;
            Ok(s)
        }
        Err(err) => Err(Error::from_reason(format!("parse error: {}", err.0))),
    }
}

#[napi(object)]
pub struct TraverseStats {
    pub nodes_visited: u32,
}

struct Counter(u32);

impl parser::Visitor for Counter {
    fn enter(&mut self, _node: &parser::AstNode) {
        self.0 += 1;
    }
}

#[napi]
pub fn traverse_ast(ast_json: String) -> Result<TraverseStats> {
    let ast: parser::AstNode = serde_json::from_str(&ast_json)
        .map_err(|e| Error::from_reason(format!("invalid ast json: {}", e)))?;
    let mut counter = Counter(0);
    parser::traverse_ast(&ast, &mut counter);
    Ok(TraverseStats { nodes_visited: counter.0 })
}
