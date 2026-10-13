// Where one product's extraction lives. The method repo holds no client: every product is its
// own repository (scripts/init_product.py), and the Figma-track scripts take its path.
//
//   <product>/README.md                how to open the Storybook and the prototype
//   <product>/storybook-app/           the kit, from templates/storybook-app — what a person uses
//   <product>/extraction/              everything else (P.spec): capture-manifest.json, tokens.json (the canon),
//                                      components.json, GAPS/DEVIATIONS, canon/figma/, baseline/, flows/
// A product scaffolded before extraction/ existed keeps all of that at its root; P.spec is then the root.

import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

// `npm run` changes the working directory to the package root; INIT_CWD is where the person
// actually typed the command. Resolve against that, or `npm run ds -- verify .` means the method repo.
export const here = (p) => resolve(process.env.INIT_CWD || process.cwd(), p);

export function product(arg, usage) {
  if (!arg) { console.error(usage); process.exit(1); }
  const dir = here(arg);
  if (!existsSync(dir)) { console.error(`no product repository at ${dir}`); process.exit(1); }
  // Where the extraction lives: <dir>/extraction/ (the layout a person opens — README, storybook-app/, extraction/),
  // or the repository root in a product scaffolded before it.
  const spec = existsSync(join(dir, 'extraction')) ? join(dir, 'extraction') : dir;
  let name = basename(dir).replace(/-ds$/, '');
  try { name = JSON.parse(readFileSync(join(spec, 'capture-manifest.json'), 'utf8')).product || name; } catch { /* not scaffolded by init_product */ }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const canonDir = join(spec, 'canon');
  return { dir, spec, name, slug, canonDir, figmaDir: join(canonDir, 'figma'), canonFile: join(spec, 'tokens.json'), app: join(dir, 'storybook-app') };
}
