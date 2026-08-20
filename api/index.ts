// Vercel serverless entry point. Deliberately a plain (non-[...catch-all])
// filename: dynamic catch-all API routes ([...param].ts) were confirmed not
// to route at all on this project (a trivial zero-dependency catch-all
// 404'd identically to this one importing server.ts, while a plain-named
// function worked fine) — so vercel.json explicitly rewrites every /api/*
// request to this literal function instead of relying on filesystem
// catch-all routing.
//
// TEMPORARY: wrapped in a try/catch that surfaces the actual error instead
// of Vercel's generic FUNCTION_INVOCATION_FAILED, to diagnose the current
// crash. Revert to a plain re-export once resolved.
export default async function handler(req: any, res: any) {
  try {
    const mod = await import('../server.js');
    const app = mod.default as any;
    return app(req, res);
  } catch (err: any) {
    res.status(500).json({
      debug: true,
      message: err?.message || String(err),
      stack: err?.stack ? String(err.stack).split('\n').slice(0, 10) : undefined,
    });
  }
}
