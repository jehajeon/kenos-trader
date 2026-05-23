// lib/design-tokens.js
// BMW M-inspired design system for KENOS Trader.
// Reference: docs/design.md — near-pure black canvas, white type, M tricolor accent,
// 0px radius default, UPPERCASE display 700 vs Light 300 body, generous grid spacing.

export const tokens = {
  colors: {
    // Canvas + surfaces
    canvas:          "#000000",
    surfaceSoft:     "#0d0d0d",
    surfaceCard:     "#1a1a1a",
    surfaceElevated: "#262626",
    carbonGray:      "#2b2b2b",

    // Hairlines
    hairline:        "#3c3c3c",
    hairlineStrong:  "#262626",

    // Text
    onDark:          "#ffffff",
    bodyStrong:      "#e6e6e6",
    body:            "#bbbbbb",
    muted:           "#7e7e7e",
    inkDim:          "#5a5a5a",

    // M Tricolor — brand identity ONLY (never CTAs, never fills)
    mBlueLight:      "#0066b1",
    mBlueDark:       "#1c69d4",
    mRed:            "#e22718",

    // Electric variant
    electricBlue:    "#0653b6",

    // Semantic (financial)
    profit:          "#0fa336",  // success green — for gains
    profitSoft:      "#0fa33622",
    loss:            "#e22718",  // = M red — for losses
    lossSoft:        "#e2271822",
    warning:         "#f4b400",  // caution
    warningSoft:     "#f4b40022",
  },

  spacing: {
    xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 40, xxl: 64, section: 64,
  },

  type: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontFamilyMono: "'JetBrains Mono', 'SF Mono', Monaco, Consolas, monospace",

    // Display (UPPERCASE, weight 700, tight tracking)
    displayXL: { fontSize: 64, fontWeight: 700, lineHeight: 1.0,  letterSpacing: "-1px",   textTransform: "uppercase" },
    displayLG: { fontSize: 48, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.5px", textTransform: "uppercase" },
    displayMD: { fontSize: 32, fontWeight: 700, lineHeight: 1.1,  letterSpacing: "-0.3px", textTransform: "uppercase" },
    displaySM: { fontSize: 24, fontWeight: 700, lineHeight: 1.15, letterSpacing: 0,        textTransform: "uppercase" },

    titleLG:   { fontSize: 20, fontWeight: 700, lineHeight: 1.3,  letterSpacing: 0 },
    titleMD:   { fontSize: 18, fontWeight: 400, lineHeight: 1.4,  letterSpacing: 0 },
    titleSM:   { fontSize: 16, fontWeight: 400, lineHeight: 1.4,  letterSpacing: 0 },

    // Labels — uppercase letterspaced "machined" voice
    label:     { fontSize: 11, fontWeight: 700, lineHeight: 1.3,  letterSpacing: "1.5px", textTransform: "uppercase" },
    labelSm:   { fontSize: 10, fontWeight: 700, lineHeight: 1.3,  letterSpacing: "1.2px", textTransform: "uppercase" },

    // Body — Light (300)
    bodyMD:    { fontSize: 15, fontWeight: 300, lineHeight: 1.5,  letterSpacing: 0 },
    bodySM:    { fontSize: 13, fontWeight: 300, lineHeight: 1.5,  letterSpacing: 0 },
    caption:   { fontSize: 11, fontWeight: 400, lineHeight: 1.4,  letterSpacing: "0.5px" },

    // Buttons — uppercase letterspaced
    button:    { fontSize: 13, fontWeight: 700, lineHeight: 1.0,  letterSpacing: "1.5px", textTransform: "uppercase" },
    navLink:   { fontSize: 13, fontWeight: 400, lineHeight: 1.4,  letterSpacing: "0.5px" },

    // Numeric (monospace tabular for stat values)
    statValue: { fontSize: 32, fontWeight: 700, lineHeight: 1.0,  letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums" },
    statValueSm:{ fontSize: 18, fontWeight: 700, lineHeight: 1.1, letterSpacing: 0,        fontVariantNumeric: "tabular-nums" },
  },

  radius: {
    none: 0,   // dominant
    sm:   2,   // rare
    full: 9999,
  },

  // M tricolor stripe — the system's only true "decorative" element
  // Used as a 4px horizontal divider on motorsport chrome / brand-identity moments
  stripe: {
    height: 4,
    backgroundImage:
      "linear-gradient(90deg," +
      " #0066b1 0%,  #0066b1 33.33%," +
      " #1c69d4 33.33%, #1c69d4 66.66%," +
      " #e22718 66.66%, #e22718 100%)",
  },
};

export default tokens;
