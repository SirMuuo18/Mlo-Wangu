// Centralized Android APK download info for Mlo Wangu — the single source
// of truth so the URL/build metadata below is never duplicated across
// components. Update all four fields together whenever a new build is
// approved for distribution.
//
// IMPORTANT: APK_DOWNLOAD_URL is a signed EAS build-artifact URL, not a
// permanent hosting location. EAS artifact URLs expire (this one expires
// 2026-09-16 — see ARTIFACT_EXPIRES_AT below) and must be rotated to a new
// URL from a fresh `eas build:view <buildId>` before that date, or moved to
// stable hosting (e.g. Supabase storage, a GitHub Release, /public on this
// site). Do not let this URL go stale in production.

export const APK_DOWNLOAD_URL = 'https://expo.dev/artifacts/eas/eL3WobByO4DpT2J01R7lMVPx-y0Enadx7y5lHO23FWk.apk';

export const ANDROID_PACKAGE = 'com.mlowangu.app';
export const EAS_BUILD_ID = 'e8335e57-2ef3-443d-8691-3e496386884c';
export const RUNTIME_VERSION = '06e586228686be3bdd417288d30d4b2845dbc659';
export const ARTIFACT_EXPIRES_AT = '2026-09-16T04:23:06.694Z';
