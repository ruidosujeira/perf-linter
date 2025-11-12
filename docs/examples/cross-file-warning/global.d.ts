declare namespace JSX {
  type Element = unknown;

  interface IntrinsicElements {
    div: Record<string, unknown>;
    button: Record<string, unknown>;
  }
}
