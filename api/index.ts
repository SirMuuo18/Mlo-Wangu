// Vercel serverless entry point. Deliberately a plain (non-[...catch-all])
// filename: dynamic catch-all API routes ([...param].ts) were confirmed not
// to route at all on this project (a trivial zero-dependency catch-all
// 404'd identically to this one importing server.ts, while a plain-named
// function worked fine) — so vercel.json explicitly rewrites every /api/*
// request to this literal function instead of relying on filesystem
// catch-all routing. Vercel's Node runtime treats a default-exported
// (req, res) => void-shaped function as a request handler, which an
// Express app satisfies directly. All the actual routes live in
// ../server.ts.
export { default } from '../server';
