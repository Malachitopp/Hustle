/**
 * Loads the Supabase project's URL and public key for the database tests from .env.local (or
 * .env) at the repo root, the same file the app reads, so the tests hit the same dev project.
 * Values already in the environment win, which is how CI would pass them in.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

for (const file of ['.env.local', '.env']) {
  const path = join(process.cwd(), file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
  }
}
