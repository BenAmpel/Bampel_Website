// CARE Behavioral Lab API: every study, one function. Routes: netlify/lib/lab/router.mjs.
import { getStore } from '@netlify/blobs';
import { handle } from '../lib/lab/router.mjs';

export default (req) => handle(req, { getStore, env: process.env });

export const config = { path: ['/api/lab/*', '/api/vc/*'] };
