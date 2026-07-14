/**
 * No-op shim for the `server-only` package in vitest.
 *
 * `server-only` (from npm) throws if it detects it's being bundled into
 * a client component. In Node.js (vitest's default environment) the
 * package's index.js still throws on import — vitest's transform is
 * closer to the browser than to a true server runtime. Aliasing the
 * package to this empty module lets us test modules that include
 * `import 'server-only'` (the marker that says "this code can only
 * run on the server") without the marker itself erroring out.
 *
 * If you add a new test file that imports a module with
 * `import 'server-only'` and it fails with "cannot be imported from a
 * Client Component module", this alias is probably gone.
 */
export {};
