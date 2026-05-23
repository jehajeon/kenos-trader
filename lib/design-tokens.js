// lib/design-tokens.js
// Vercel-inspired design system, ALWAYS DARK MODE.
//
// Reference: docs/design.md — geometric sans (Geist → Inter substitute) for narrative
// + monospaced face (Geist Mono → JetBrains Mono substitute) for technical labels,
// sentence-case period-terminated headlines with aggressive negative tracking,
// multi-stop mesh gradient as the only decoration, polarity flip = highlighted card.

export const tokens = {
  colors: {
    // Surfaces — dark ladder (inverted from Vercel's light system but same step relationships)
    canvas:           "#000000",   // deepest band, polarity-flipped sections
    canvasSoft:       "#0a0a0a",   // default page background (was 98% white in light)
    canvasSoft2:      "#111111",   // occasional inset region
    card:             "#0a0a0a",   // card surface — sits on canvasSoft with hairline
    cardElevated:     "#161616",   // featured / inverted card

    // Hairlines (10–25% white)
    hairline:         "#1f1f1f",   // 1px dividers
    hairlineStrong:   "#2e2e2e",   // emphasized divider / muted text on bg

    // Text
    ink:              "#ededed",   // every heading + primary body
    body:             "#a1a1a1",   // secondary text
    mute:             "#737373",   // lowest-priority text
    onPrimary:        "#0a0a0a",   // text on white (inverted) primary CTA

    // Primary action — DARK MODE INVERSION
    // In light Vercel, primary CTA is black pill (#171717). In dark mode it inverts
    // to a white/near-white pill against the ink canvas. This polarity flip is the
    // signature.
    primary:          "#ededed",
    primaryHover:     "#ffffff",

    // Polarity-flipped highlighted surface (for "featured" pricing-style cards
    // in dark mode: the featured tier becomes WHITE on dark siblings)
    primarySurface:   "#fafafa",   // featured card background
    primarySurfaceText:"#0a0a0a",  // text on that featured card

    // Brand gradient stops — unchanged from light mode (they pop more on dark)
    gradientDevelopStart:  "#007cf0",
    gradientDevelopEnd:    "#00dfd8",
    gradientPreviewStart:  "#7928ca",
    gradientPreviewEnd:    "#ff0080",
    gradientShipStart:     "#ff4d4d",
    gradientShipEnd:       "#f9cb28",
    cyan:                  "#50e3c2",
    highlightPink:         "#ff0080",
    violet:                "#7928ca",

    // Semantic
    link:             "#3291ff",    // brighter link blue for dark mode visibility
    linkDeep:         "#52a8ff",
    linkBgSoft:       "#0e3a6b",
    success:          "#0fcc4e",    // brighter green for dark
    successSoft:      "#0fcc4e22",
    warning:          "#f5a623",
    warningSoft:      "#f5a62322",
    warningDeep:      "#ab570a",
    error:            "#ff4949",
    errorSoft:        "#ff494922",
    errorDeep:        "#c50000",
  },

  spacing: {
    // Base unit 4px — Vercel's --geist-space
    xxs:   4,
    xs:    8,
    sm:    12,
    md:    16,
    lg:    24,
    xl:    32,
    "2xl": 40,
    "3xl": 48,
    "4xl": 64,
    "5xl": 96,
    "6xl": 128,
    section: 96,   // dashboard-adapted (light Vercel uses 192px hero)
  },

  type: {
    // Geist substitute → Inter (geometric sans)
    fontFamily:     "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    // Geist Mono substitute → JetBrains Mono
    fontFamilyMono: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",

    // Display — sentence-case, weight 600 ceiling, aggressive negative tracking
    displayXL: { fontSize: 48, fontWeight: 600, lineHeight: "48px", letterSpacing: "-2.4px" },
    displayLG: { fontSize: 32, fontWeight: 600, lineHeight: "40px", letterSpacing: "-1.28px" },
    displayMD: { fontSize: 24, fontWeight: 600, lineHeight: "32px", letterSpacing: "-0.96px" },
    displaySM: { fontSize: 20, fontWeight: 600, lineHeight: "28px", letterSpacing: "-0.6px" },

    // Body
    bodyLG:        { fontSize: 18, fontWeight: 400, lineHeight: "28px", letterSpacing: 0 },
    bodyMD:        { fontSize: 16, fontWeight: 400, lineHeight: "24px", letterSpacing: 0 },
    bodyMDStrong:  { fontSize: 16, fontWeight: 500, lineHeight: "24px", letterSpacing: 0 },
    bodySM:        { fontSize: 14, fontWeight: 400, lineHeight: "20px", letterSpacing: "-0.28px" },
    bodySMStrong:  { fontSize: 14, fontWeight: 500, lineHeight: "20px", letterSpacing: "-0.28px" },
    caption:       { fontSize: 12, fontWeight: 400, lineHeight: "16px", letterSpacing: 0 },

    // Mono — the "technical layer"
    captionMono: { fontSize: 12, fontWeight: 400, lineHeight: "16px", letterSpacing: 0,
                   fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
                   textTransform: "uppercase" },
    code:        { fontSize: 13, fontWeight: 400, lineHeight: "20px", letterSpacing: 0,
                   fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace" },

    // Buttons — sentence-case, no tracking expansion
    buttonMD: { fontSize: 14, fontWeight: 500, lineHeight: "20px", letterSpacing: 0 },
    buttonLG: { fontSize: 16, fontWeight: 500, lineHeight: "24px", letterSpacing: 0 },

    // Stat values (tabular-nums for finance)
    statValueXL: { fontSize: 48, fontWeight: 600, lineHeight: "52px", letterSpacing: "-2.4px",
                   fontVariantNumeric: "tabular-nums" },
    statValue:   { fontSize: 32, fontWeight: 600, lineHeight: "36px", letterSpacing: "-1.28px",
                   fontVariantNumeric: "tabular-nums" },
    statValueSm: { fontSize: 20, fontWeight: 600, lineHeight: "24px", letterSpacing: "-0.4px",
                   fontVariantNumeric: "tabular-nums" },
  },

  radius: {
    none:    0,
    xs:      4,
    sm:      6,    // --geist-radius — nav buttons, form inputs
    md:      8,    // --geist-marketing-radius — feature cards
    lg:      12,   // pricing cards
    xl:      16,   // hero-image cards
    pillSm:  64,   // tab pills
    pill:    100,  // marketing CTA pill
    full:    9999, // icon-button circles
  },

  // Stacked shadows — multiple small offsets, never one heavy drop.
  // Tuned for dark backgrounds (slightly stronger opacity than light mode).
  shadow: {
    none:   "none",
    level1: "0 0 0 1px rgba(255,255,255,0.08) inset",
    level2: "0 0 0 1px rgba(255,255,255,0.08) inset, 0 1px 1px rgba(0,0,0,0.2), 0 2px 2px rgba(0,0,0,0.15)",
    level3: "0 0 0 1px rgba(255,255,255,0.08) inset, 0 2px 2px rgba(0,0,0,0.2), 0 8px 8px -8px rgba(0,0,0,0.25)",
    level4: "0 0 0 1px rgba(255,255,255,0.10) inset, 0 2px 2px rgba(0,0,0,0.2), 0 8px 16px -4px rgba(0,0,0,0.3)",
    level5: "0 0 0 1px rgba(255,255,255,0.10) inset, 0 1px 1px rgba(0,0,0,0.1), 0 8px 16px -4px rgba(0,0,0,0.25), 0 24px 32px -8px rgba(0,0,0,0.4)",
  },

  // Mesh gradient backdrop — the brand's ONLY decoration.
  // Used at hero scale only, never miniaturised, never reduced to one color.
  meshGradient: {
    // Pre-baked CSS background-image string ready to drop on a hero band
    backdrop: [
      "radial-gradient(at 18% 12%, rgba(0, 124, 240, 0.35) 0px, transparent 50%)",
      "radial-gradient(at 82% 18%, rgba(255, 0, 128, 0.28) 0px, transparent 50%)",
      "radial-gradient(at 8%  78%, rgba(121, 40, 202, 0.30) 0px, transparent 50%)",
      "radial-gradient(at 92% 82%, rgba(249, 203, 40, 0.22) 0px, transparent 55%)",
      "radial-gradient(at 50% 100%, rgba(0, 223, 216, 0.20) 0px, transparent 60%)",
    ].join(", "),
  },
};

export default tokens;
