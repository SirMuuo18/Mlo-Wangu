// Temporary diagnostic endpoint — isolates whether Vercel Functions are
// reachable at all, independent of server.ts's size/dependencies. Remove
// once /api/* routing is confirmed working end-to-end.
export default function handler(req: any, res: any) {
  res.status(200).json({ ok: true, from: 'ping' });
}
