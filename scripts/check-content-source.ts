// Drive is the only source of the pages: content/ may only change through the "Publicér" workflow.
// Fails if a commit in the range changes content/ (except the two manual files) under another author.
// A guard against hand edits by mistake, not against someone who sets the bot's name on purpose.
export const SYNC_AUTHOR = '41898282+github-actions[bot]@users.noreply.github.com';
const manual = [':(exclude)content/_slugs.json', ':(exclude)content/_redirects.json'];

async function git(root: string, args: string[]) {
  const proc = Bun.spawn(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`git ${args[0]} fejlede: ${err.trim()}`);
  return out;
}
/** Commits in `range` (git rev-list syntax, e.g. base..head) that change content/ by hand. */
export async function handEditedContent(root: string, range: string) {
  const out = await git(root, ['log', '--format=%H%x09%ae%x09%s', range, '--', 'content', ...manual]);
  return out.split('\n').filter(Boolean).map(line => { const [sha, email, subject] = line.split('\t'); return { sha: sha!, email: email!, subject: subject ?? '' }; })
    .filter(c => c.email !== SYNC_AUTHOR);
}

if (import.meta.main) {
  const range = process.argv[2];
  if (!range) { console.error('Brug: bun run scripts/check-content-source.ts <base>..<head>'); process.exit(1); }
  const found = await handEditedContent('.', range);
  for (const c of found) console.error(`${c.sha.slice(0, 7)} (${c.email}) "${c.subject}" ændrer content/. Sider rettes i Google Drive og publiceres med "Hjemmeside → Publicér nu".`);
  if (found.length) process.exit(1);
  console.log('content/ er kun ændret af Publicér-workflowet.');
}
