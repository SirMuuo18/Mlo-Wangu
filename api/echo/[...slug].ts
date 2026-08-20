// Temporary diagnostic — isolates whether a nested catch-all route works at
// all on this Vercel project, independent of importing server.ts.
export default function handler(req: any, res: any) {
  res.status(200).json({ ok: true, from: 'echo', url: req.url });
}
