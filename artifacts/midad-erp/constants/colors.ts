/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#18332c',
    tint: '#14715d',
    background: '#f4f7f4',
    foreground: '#18332c',
    card: '#ffffff',
    cardForeground: '#18332c',
    primary: '#146b58',
    primaryDark: '#0d4c40',
    primaryForeground: '#ffffff',
    secondary: '#e9f1ed',
    secondaryForeground: '#245348',
    muted: '#edf1ee',
    mutedForeground: '#77837d',
    accent: '#e9f1ed',
    accentForeground: '#245348',
    destructive: '#c3544d',
    destructiveForeground: '#ffffff',
    border: '#e2e9e4',
    input: '#e2e9e4',
    gold: '#e8ba69',
    success: '#258369',
    successSoft: '#e7f4ee',
    warning: '#b87829',
    warningSoft: '#fbf1df',
    info: '#507b8c',
    infoSoft: '#eaf2f4',
  },
  dark: {
    text: '#e9f1ed',
    tint: '#77c4aa',
    background: '#101b18',
    foreground: '#e9f1ed',
    card: '#182723',
    cardForeground: '#e9f1ed',
    primary: '#77c4aa',
    primaryDark: '#174c3e',
    primaryForeground: '#10241e',
    secondary: '#21342e',
    secondaryForeground: '#c1d8ce',
    muted: '#21302b',
    mutedForeground: '#a1b1aa',
    accent: '#21342e',
    accentForeground: '#c1d8ce',
    destructive: '#d67b73',
    destructiveForeground: '#241211',
    border: '#2b3b35',
    input: '#2b3b35',
    gold: '#e8ba69',
    success: '#6ac3a1',
    successSoft: '#1e3a30',
    warning: '#e5b465',
    warningSoft: '#3a3020',
    info: '#8db9c5',
    infoSoft: '#20343a',
  },

  radius: 18,
};

export default colors;
