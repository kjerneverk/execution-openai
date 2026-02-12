# Bug Fix: Bundling Error in @kjerneverk/execution-openai v1.0.7

## Problem

The published v1.0.7 package had a critical bundling error where two different Node.js built-in modules (`diagnostics_channel` and `util`) were incorrectly aliased to the same variable (`require$$0`), causing runtime failures:

```
TypeError: util2.debuglog is not a function
    at requireDiagnostics (node_modules/@kjerneverk/execution-openai/dist/index.js:1849:32)
```

## Root Cause

The `undici` package was being bundled into the distribution file instead of being treated as an external dependency. When Vite bundled `undici`, it encountered Node.js built-in modules that weren't marked as external, causing the bundler to:

1. Replace them with browser shims (`__viteBrowserExternal`)
2. Incorrectly deduplicate different built-ins into the same variable
3. Create a 23,924-line bundle with broken module references

## Solution

Added `undici` to the `external` array in `vite.config.ts`:

```typescript
rollupOptions: {
  external: [
    "openai",
    "tiktoken",
    "undici",  // ← Added this
    "execution",
    "@utilarium/offrecord",
    "@utilarium/spotclean",
    "node:crypto",
  ],
}
```

## Results

- Bundle size reduced from 23,924 lines to 265 lines
- `undici` is now imported as an external dependency (as it should be)
- No more `require$$0` variable conflicts
- Package imports successfully without errors
- All tests pass

## Testing

```bash
# Build the package
npm run clean && npm run build

# Test import
node -e "import('./dist/index.js').then(() => console.log('✓ Import successful'))"
# Output: ✓ Import successful

# Run tests
npm test
# Output: All 18 tests passed
```

## Next Steps

1. Commit the fix
2. Publish v1.0.8 to npm
3. Update dependent packages (@grunnverk/ai-service, kodrdriv, etc.)

## Why This Fix Works

`undici` is a Node.js-specific networking library that:
- Uses Node.js built-in modules (`util`, `diagnostics_channel`, `stream`, etc.)
- Should not be bundled for Node.js environments
- Is already a dependency in package.json

By externalizing it, we let consuming packages resolve it from `node_modules` at runtime, avoiding the bundling issues entirely.
