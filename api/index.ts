// Vercel serverless entry point. Deliberately a plain (non-catch-all)
// filename: dynamic catch-all API routes ([...param].ts) do not route at
// all on this project (confirmed directly — a trivial, dependency-free
// catch-all 404'd identically to this file, while a plain-named function
// routed correctly), so vercel.json explicitly rewrites every /api/*
// request to this literal function instead of relying on filesystem
// catch-all routing. Vercel's Node runtime treats a default-exported
// (req, res) => void-shaped function as a request handler, which an
// Express app satisfies directly. All the actual routes live in
// ../server.ts.
export { default } from '../server.js';
