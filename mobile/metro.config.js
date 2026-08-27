// Extends Metro's watched/resolvable set to include the monorepo root so
// this app can share pure content modules (currently: src/data/
// supportContent.ts) with the web app, without npm workspaces (which risks
// hoisting a conflicting React version between the two — see the Phase 1
// report for why that path was rejected) and without disabling Metro's own
// hierarchical node_modules lookup (tried in Phase 1: broke resolution of
// expo-router's own nested dependencies, reverted). `watchFolders` only
// ADDS to what Metro can see; it does not restrict or override anything.
//
// That "risks hoisting a conflicting React version" comment above was
// exactly right — Stage 4 surfaced it for real: adding two new mobile
// packages made expo-doctor's dependency scanner walk far enough to flag
// the root web project's own, separate `react@19.2.x` (in
// `<root>/node_modules`, visible only because watchFolders exposes it) as
// a duplicate alongside mobile's correctly-deduped `react@19.2.3` (in
// `mobile/node_modules`, confirmed via `npm ls react` to already dedupe
// cleanly on its own). The two were never actually the same copy at
// runtime — this blockList just stops Metro from ever being able to
// resolve a module out of the ROOT's node_modules at all (mobile has its
// own complete one), which is what `watchFolders` was never meant to
// expose in the first place; source files under the root (like
// src/data/supportContent.ts) remain fully watchable and resolvable.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const monorepoRoot = path.resolve(__dirname, '..');
config.watchFolders = [monorepoRoot];

const escapedRoot = monorepoRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : config.resolver.blockList ? [config.resolver.blockList] : []),
  new RegExp(`^${escapedRoot}/node_modules/.*`),
];

module.exports = config;
