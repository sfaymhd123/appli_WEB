import { writeFileSync } from 'node:fs';

// Mark each build output with the correct module type so Node and bundlers
// resolve the dual ESM/CJS package correctly regardless of the root package "type".
writeFileSync(
  new URL('../dist/cjs/package.json', import.meta.url),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
);
writeFileSync(
  new URL('../dist/esm/package.json', import.meta.url),
  JSON.stringify({ type: 'module' }, null, 2) + '\n',
);
