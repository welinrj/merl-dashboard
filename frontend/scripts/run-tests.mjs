#!/usr/bin/env node
// run-tests.mjs — `npm test` for the frontend.
//
// The modules under test are written the way the rest of the app is written:
// Vite-style extensionless imports, and a chain that reaches i18n.js and its
// `import.meta.env`. Node's own resolver handles neither, so rather than bend
// the source to suit the test runner, the tests are bundled the way Vite would
// bundle them and then handed to `node --test`.
//
// Same convention as translate-service and cache-service: tests live in
// test/*.mjs and run under node:test.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Not under node_modules: node --test skips that directory entirely.
const OUT = '.test-build';
mkdirSync(OUT, { recursive: true });

const tests = readdirSync('test').filter((f) => f.endsWith('.mjs'));
if (tests.length === 0) { console.log('no tests'); process.exit(0); }

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });

for (const file of tests) {
  run('npx', ['esbuild', join('test', file),
    '--bundle', '--platform=node', '--format=esm', '--log-level=error',
    // Vite substitutes these at build time; nothing in the tests depends on
    // their values, they just have to exist.
    '--define:import.meta.env={"DEV":false,"BASE_URL":"/","VITE_APP_ENV":"test"}',
    `--outfile=${join(OUT, file)}`]);
}

run('node', ['--test', ...tests.map((f) => join(OUT, f))]);
