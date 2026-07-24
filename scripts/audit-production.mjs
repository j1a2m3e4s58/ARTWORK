import { spawnSync } from 'node:child_process';

const temporaryExceptions = new Map([
  [
    'https://github.com/advisories/GHSA-qwww-vcr4-c8h2',
    'The advisory affects only unstable React Server Components APIs; this application uses React Router declarative browser mode.',
  ],
]);

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  process.stderr.write(result.stderr || result.stdout || 'npm audit did not return valid JSON.\n');
  process.exit(1);
}

const advisories = new Map();
for (const vulnerability of Object.values(report.vulnerabilities || {})) {
  for (const advisory of vulnerability.via || []) {
    if (typeof advisory !== 'object' || !advisory.url) continue;
    advisories.set(advisory.url, advisory);
  }
}

const unapproved = [...advisories.values()].filter(advisory => !temporaryExceptions.has(advisory.url));
if (unapproved.length) {
  for (const advisory of unapproved) {
    process.stderr.write(`${advisory.severity.toUpperCase()}: ${advisory.title} (${advisory.url})\n`);
  }
  process.exit(1);
}

for (const [url, reason] of temporaryExceptions) {
  if (advisories.has(url)) process.stdout.write(`Documented temporary exception: ${url}\n${reason}\n`);
}

if (!advisories.size) process.stdout.write('No production dependency vulnerabilities found.\n');
