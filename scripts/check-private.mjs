// npm run check:private  (also runs automatically before every commit via .githooks/pre-commit)
//
// The repo is public, so household details must never be committed. This checks
// every staged file for the terms listed in local/private-terms.txt (gitignored:
// names, balances, keys; one per line, # for comments) and for secret keys.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const SECRETS = [/sb_secret_[A-Za-z0-9_-]+/]; // Supabase secret keys never belong in the repo
const SKIP = [/^package-lock\.json$/, /^local\//, /\.(png|jpe?g|gif|ico|webp)$/i];

const termsFile = new URL('../local/private-terms.txt', import.meta.url);
const terms = existsSync(termsFile)
  ? readFileSync(termsFile, 'utf8')
      .split(/\r?\n/)
      .map((t) => t.trim())
      .filter((t) => t && !t.startsWith('#'))
  : [];
if (!terms.length) console.warn('check-private: local/private-terms.txt not found or empty; only checking for secret keys.');

const staged = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' })
  .split('\n')
  .map((f) => f.trim())
  .filter((f) => f && !SKIP.some((re) => re.test(f)));

const problems = [];
for (const file of staged) {
  const text = execSync(`git show ":${file}"`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  text.split('\n').forEach((line, i) => {
    const lower = line.toLowerCase();
    for (const t of terms) if (lower.includes(t.toLowerCase())) problems.push(`${file}:${i + 1}  contains "${t}"`);
    for (const re of SECRETS) if (re.test(line)) problems.push(`${file}:${i + 1}  contains a secret key`);
  });
}

if (problems.length) {
  console.error('\nPrivate details are staged for commit (the repo is public):\n');
  for (const p of problems) console.error('  ' + p);
  console.error('\nRemove them, or move that data under local/. Commit blocked.\n');
  process.exit(1);
}
console.log(`check-private: ${staged.length} staged file(s) clean.`);
