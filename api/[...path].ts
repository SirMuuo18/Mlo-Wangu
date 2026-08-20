// Vercel serverless entry point. The [...path] catch-all filename makes
// Vercel automatically route every /api/* request here — no vercel.json
// rewrite needed. Vercel's Node runtime treats a default-exported
// (req, res) => void-shaped function as a request handler, which an
// Express app satisfies directly. All the actual routes live in
// ../server.ts; this file exists only because Vercel discovers functions
// by file path under /api, not by pointing config at server.ts directly.
export { default } from '../server';
