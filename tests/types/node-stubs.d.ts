declare module 'fs' {
  export function readFileSync(path: string, options?: string | { encoding?: string }): string;
}

declare module 'path' {
  export function resolve(...segments: string[]): string;
  export function join(...segments: string[]): string;
  export function dirname(path: string): string;
}

declare const __dirname: string;
