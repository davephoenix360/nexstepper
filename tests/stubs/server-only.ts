// Vitest stub for the `server-only` package. The real package throws
// when imported in a non-Server-Component context (browser bundler, RSC
// build, etc.). In the vitest Node environment, that throw fires before
// the test body can run, so we alias `server-only` to this empty module
// in vitest.config.ts. No runtime behavior changes — this file is
// imported as a side-effect (`import 'server-only'`) and exports nothing.
export {};
