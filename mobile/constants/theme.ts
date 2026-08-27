// MLO WANGU brand tokens — mirrored verbatim from the web app's Tailwind
// hex literals (src/components/*.tsx, index.html's theme-color meta tag,
// public/manifest.json) so the mobile app is visually the same brand, not a
// re-derived palette. The web app has no dark theme (confirmed: zero
// `dark:`-prefixed classes anywhere in src/), so this is a single, light
// palette for now — see the Expo Readiness Audit, Section 18.

export const colors = {
  forest: '#14532D', // primary brand green — headers, primary actions
  forestDeep: '#0F3E22', // pressed/hover state of forest
  cream: '#FAF8F2', // app background (matches manifest.json's background_color)
  ink: '#17201A', // primary text
  moss: '#66736A', // secondary/muted text
  line: '#E8E5DD', // borders, dividers
  surface: '#FFFFFF', // cards, inputs
  gold: '#F4B942', // accent — premium, highlights
  danger: '#C62828', // errors, destructive actions
  blue: '#2563EB', // budget-unlocked accent (matches web's Navbar pill)
  white: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const typography = {
  title: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.3 },
  heading: { fontSize: 19, fontWeight: '800' as const, letterSpacing: -0.2 },
  subheading: { fontSize: 15, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyBold: { fontSize: 15, fontWeight: '700' as const },
  caption: { fontSize: 12.5, fontWeight: '600' as const },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.4, textTransform: 'uppercase' as const },
};
