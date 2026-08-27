// Re-exports the web app's actual About/FAQ/Contact content module
// (src/data/supportContent.ts) — a real runtime import, not a type-only
// one, since About/FAQ/Contact need the actual strings, not just their
// shape. This works because metro.config.js adds the monorepo root to
// Metro's watchFolders; see that file's comment for why this is safe (the
// shared module is plain data with zero imports of its own — in
// particular it never imports React — so there is no path by which Metro
// could resolve a second copy of React through this share). Not one
// character of this content is duplicated or rewritten here.
export * from '../../src/data/supportContent';
