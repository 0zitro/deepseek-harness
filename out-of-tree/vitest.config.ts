/**
 * Test runner for the out-of-tree plugin packages. Root vitest only includes
 * tests under packages, so this config gives out-of-tree tests the same
 * resolution facade (tsconfig.base.json paths — upstream names through the
 * generated region, OOT names through the hand-written block) and setup file
 * without touching any upstream script.
 *
 * Run from the repository root:
 *
 *     pnpm exec vitest run --config out-of-tree/vitest.config.ts
 */
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from '../vitest.shared.ts'

// Same facade as the root config: tsconfig.base.json has no include, which
// vite-tsconfig-paths treats as match-all, so its paths map applies to every
// OOT test file and imports resolve to workspace sources, never built lib/.
// Paths resolve against the invocation cwd (the repository root).
const pathsPlugin = (): ReturnType<typeof tsconfigPaths> => tsconfigPaths({ projects: ['./tsconfig.base.json'] })

export default defineConfig({
  plugins: [pathsPlugin(), standardDecoratorPlugin()],
  test: {
    // Vitest resolves setup files against the project root (the repository
    // root this config is always invoked from), not this file's directory.
    setupFiles: ['./scripts/test-invariants.ts'],
    // .tsx: client component specs (jsdom via per-file @vitest-environment pragma).
    include: ['out-of-tree/*/tests/**/*.spec.{ts,tsx}'],
    pool: 'forks',
    execArgv: vitestExecArgv,
  },
})
