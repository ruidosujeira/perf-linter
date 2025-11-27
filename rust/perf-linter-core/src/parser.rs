use serde::{Deserialize, Serialize};
use swc_common::{errors::{ColorConfig, Handler}, sync::Lrc, SourceMap, Span, DUMMY_SP};
use swc_ecma_parser::{EsConfig, Parser, StringInput, Syntax, TsConfig};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpanJson {
    pub lo: u32,
    pub hi: u32,
}

impl From<Span> for SpanJson {
    fn from(sp: Span) -> Self {
        // We don't track real positions yet; keep it minimal
        SpanJson { lo: sp.lo.0, hi: sp.hi.0 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum NodeKind {
    Root,
    // We can extend with more node kinds later
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AstNode {
    pub kind: NodeKind,
    pub span: SpanJson,
    pub children: Vec<AstNode>,
}

#[derive(Debug)]
pub struct ParseError(pub String);

pub fn parse_file(source: &str) -> Result<AstNode, ParseError> {
    // Use SWC parser configured to handle TS/JS with JSX
    let cm: Lrc<SourceMap> = Default::default();
    let handler = Handler::with_tty_emitter(ColorConfig::Auto, true, false, Some(cm.clone()));

    let fm = cm.new_source_file(swc_common::FileName::Custom("input.tsx".into()), source.into());
    let input = StringInput::from(&*fm);
    let syntax = Syntax::Typescript(TsConfig {
        tsx: true,
        decorators: true,
        dts: false,
        no_early_errors: true,
        ..Default::default()
    });

    let mut parser = Parser::new(syntax, input, None);

    // Try parse as a module; if fails, as script
    if parser.parse_module().is_ok() || parser.take_errors().is_empty() {
        Ok(AstNode { kind: NodeKind::Root, span: DUMMY_SP.into(), children: vec![] })
    } else {
        parser.take_errors().into_iter().for_each(|e| e.into_diagnostic(&handler).emit());
        // Try script fallback
        let fm2 = cm.new_source_file(swc_common::FileName::Custom("input.js".into()), source.into());
        let input2 = StringInput::from(&*fm2);
        let mut parser2 = Parser::new(
            Syntax::Es(EsConfig {
                jsx: true,
                decorators: true,
                ..Default::default()
            }),
            input2,
            None,
        );
        match parser2.parse_script() {
            Ok(_) => Ok(AstNode { kind: NodeKind::Root, span: DUMMY_SP.into(), children: vec![] }),
            Err(err) => {
                let mut s = String::new();
                err.into_diagnostic(&handler).emit();
                s.push_str("Parse error");
                Err(ParseError(s))
            }
        }
    }
}

pub trait Visitor {
    fn enter(&mut self, _node: &AstNode) {}
    fn exit(&mut self, _node: &AstNode) {}
}

pub fn traverse_ast(node: &AstNode, visitor: &mut dyn Visitor) {
    visitor.enter(node);
    for child in &node.children {
        traverse_ast(child, visitor);
    }
    visitor.exit(node);
}
