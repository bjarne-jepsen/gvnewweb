import { MockContentAdapter } from '../lib/adapters/mock';
import { prepare } from '../lib/publication/store';
const id = process.argv[2];
if (!id) throw new Error('Brug: bun run content:prepare -- <content-id>');
const record = (await new MockContentAdapter().listCandidates()).find(r => r.id === id);
if (!record) throw new Error(`Ukendt indholds-ID: ${id}`);
const entry = await prepare(record, 'fixtures/assets', 'fixtures/snapshots');
console.log('Prepared snapshot (ingen godkendelse eller publicering udført):');
console.log(JSON.stringify(entry, null, 2));
