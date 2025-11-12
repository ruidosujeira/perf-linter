# Cross-file warning demo

This scenario showcases how the analyzer stitches information from multiple files to flag issues.

## Run the demo locally

```bash
npm run build
ESLINT_USE_FLAT_CONFIG=true npx eslint docs/examples/cross-file-warning/consumer.tsx --config docs/examples/cross-file-warning/eslint.config.mjs
```

Expected output:

```
/workspaces/perf-linter/docs/examples/cross-file-warning/consumer.tsx
  10:29  warning  Prop "onPress" receives function "handleClick" defined inside this component without memoization. Wrap its declaration with useCallback or move it outside  perf-fiscal/no-unstable-inline-props
  11:33  warning  Inline function for prop "onPress" recreates every render. Wrap it with useCallback or hoist it outside the component                                       perf-fiscal/no-unstable-inline-props
  21:3   warning  Unhandled Promise: await this call or return/chain it to avoid swallowing rejections                                                                        perf-fiscal/no-unhandled-promises
✖ 3 problems (0 errors, 3 warnings)
```

The lint results depend on metadata gathered from `components.tsx` and `memo.ts` to determine that `MemoFancyButton` is a memoized component and that `useDataSource` returns a promise.

## Suggested GIF capture

Run the demo command inside a recording tool such as `terminalizer`, `asciinema`, or `screenkey + ffmpeg`. Save the capture as `docs/examples/cross-file-warning/demo.gif` and embed it in the documentation (see README section below).

## Patch that resolves every warning

```diff
diff --git a/docs/examples/cross-file-warning/consumer.tsx b/docs/examples/cross-file-warning/consumer.tsx
@@
-import { FancyButton, MemoFancyButton, useDataSource } from './components';
+import { useCallback } from 'react';
+import { FancyButton, MemoFancyButton, useDataSource } from './components';
 export function Screen(): JSX.Element {
-  const handleClick = () => {
-    console.log('clicked');
-  };
+  const handleClick = useCallback(() => {
+    console.log('clicked');
+  }, []);
 
   return (
     <div>
       <FancyButton onPress={handleClick} />
-      <MemoFancyButton onPress={() => handleClick()} />
+      <MemoFancyButton onPress={handleClick} />
     </div>
   );
 }
 
 export async function loadScreen(): Promise<void> {
   await useDataSource();
 }
 
 export function triggerLoad(): void {
-  useDataSource();
+  void useDataSource();
 }
```

After applying the diff the ESLint run finishes cleanly, demonstrating the before/after state that can be showcased in the GIF.
