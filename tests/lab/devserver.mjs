// Local lab server on in-memory stores (nothing is saved), for tests and quick checks. For day-to-day use,
// `npm run lab` runs the same server with data kept on disk (scripts/lab.mjs).
//   npm run lab:dev            then open http://localhost:8899/lab/admin/ (owner key: local-owner-key-0123456789)
import { labServer, listen } from '../../scripts/lab/server.mjs';
import { memBlobs } from './memstore.mjs';

const env = { LAB_ADMIN_KEY: process.env.LAB_ADMIN_KEY || 'local-owner-key-0123456789' };
const port = await listen(labServer({ getStore: memBlobs(), env }), Number(process.env.PORT || 8899), undefined, 0);
console.log(`Lab dev server: http://localhost:${port}/lab/  (admin key: ${env.LAB_ADMIN_KEY})`);
