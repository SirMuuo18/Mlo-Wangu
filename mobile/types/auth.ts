// Re-exports the web app's own UserProfile shape rather than redefining it.
// This is a TYPE-ONLY import (`import type`), so it is fully erased at
// compile time and Metro never needs to bundle ../../src/types.ts at
// runtime — there is no cross-project resolution risk here, unlike sharing
// a runtime value (e.g. src/data/supportContent.ts) would carry. See the
// Phase 1 report for why supportContent.ts sharing is deferred instead of
// solved the same way.
export type { UserProfile as AuthUser } from '../../src/types';
