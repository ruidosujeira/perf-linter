use clap::{Args, Parser, Subcommand};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::io::{self, Read};
use perf_linter_core::parser::{parse_typescript};

#[derive(Parser)]
#[command(author, version, about = "perf-linter core engine", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Check ReDoS risk for a regex pattern (input via STDIN JSON)
    CheckRedos,
    /// Parse JS/TS/JSX/TSX from STDIN and print minimal AST JSON
    Parse(ParseArgs),
}

#[derive(Deserialize)]
struct RedosInput {
    pattern: String,
}

#[derive(Serialize)]
struct RedosOutput {
    safe: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    rewrite: Option<String>,
}

fn detect_simple_nested_quantifier(pattern: &str) -> Option<String> {
    // Very conservative detection for patterns like: ^((\w)+)+$ or (a+)+, capture the inner char class token
    // We keep the JS rule's simple rewrite: (x+)+ => (x+) (no nested +)
    // Rust equivalent using regex:
    // ^(?P<prefix>\^?)\((?P<char>\w)\+\)\+(?P<suffix>\$?)$
    let re = Regex::new(r"^(?P<prefix>\^?)\((?P<char>\w)\+\)\+(?P<suffix>\$?)$").ok()?;
    if let Some(caps) = re.captures(pattern) {
        let prefix = caps.name("prefix").map(|m| m.as_str()).unwrap_or("");
        let ch = caps.name("char")?.as_str();
        let suffix = caps.name("suffix").map(|m| m.as_str()).unwrap_or("");
        return Some(format!("{}({}+){suffix}", prefix, ch, suffix = suffix));
    }
    None
}

fn is_likely_safe(pattern: &str) -> bool {
    // Minimal heuristic: if simple nested quantifier detected, mark unsafe; else assume safe.
    detect_simple_nested_quantifier(pattern).is_none()
}

fn main() {
    let cli = Cli::parse();
    match cli.command {
        Commands::CheckRedos => {
            // read JSON from stdin
            let mut buf = String::new();
            if io::stdin().read_to_string(&mut buf).is_err() {
                // on input error, default to safe to avoid breaking pipelines
                println!("{}", serde_json::to_string(&RedosOutput { safe: true, rewrite: None }).unwrap());
                return;
            }
            let input: RedosInput = match serde_json::from_str(&buf) {
                Ok(v) => v,
                Err(_) => {
                    println!("{}", serde_json::to_string(&RedosOutput { safe: true, rewrite: None }).unwrap());
                    return;
                }
            };

            let rewrite = detect_simple_nested_quantifier(&input.pattern);
            let safe = rewrite.is_none() && is_likely_safe(&input.pattern);
            let out = RedosOutput { safe, rewrite };
            println!("{}", serde_json::to_string(&out).unwrap());
        }
        Commands::Parse(args) => {
            // Read raw source from stdin
            let mut src = String::new();
            if io::stdin().read_to_string(&mut src).is_err() {
                eprintln!("perf-linter-core parse: failed to read from STDIN");
                std::process::exit(2);
            }
            let filename = args.filename.unwrap_or_else(|| "input.tsx".to_string());
            match parse_typescript(&src, &filename) {
                Ok(ast) => {
                    let json = serde_json::to_string(&ast).unwrap_or_else(|_| "{}".to_string());
                    println!("{}", json);
                }
                Err(err) => {
                    // Print minimal error object to stdout to keep interface JSON
                    #[derive(Serialize)]
                    struct ParseErrorOut { error: String }
                    let out = ParseErrorOut { error: err.0 };
                    println!("{}", serde_json::to_string(&out).unwrap());
                    // Non-zero to signal failure to callers that check status
                    std::process::exit(1);
                }
            }
        }
    }
}

#[derive(Args, Debug, Default)]
struct ParseArgs {
    /// Optional filename hint to influence parser mode (e.g., file.tsx)
    #[arg(long)]
    filename: Option<String>,
}
