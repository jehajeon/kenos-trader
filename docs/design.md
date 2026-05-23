# KENOS — Design System (Vercel, always dark mode)

Source: Vercel's developer-platform marketing language, adapted for
permanent dark-mode operation in a finance dashboard.
Tokens live in `lib/design-tokens.js`.

## Voice

KENOS reads as an engineered tool, not a marketing surface. The page sits on a
deep ink-near-black canvas (`colors.canvasSoft` — #0a0a0a) holding near-white
text (`colors.ink` — #ededed). Decoration is exactly one element: the **multi-stop
mesh gradient** (cyan / blue / violet / pink / amber) that hovers in the hero
backdrop. The gradient is the brand. Everything else is type + hairline + space.

Type is the second decisive voice. **Inter** carries everything narrative —
display, body, button — at weight **400 / 500 / 600**. The face never goes to
weight 700; that ceiling is what makes the system feel calmer than typical SaaS.
**JetBrains Mono** carries the technical layer: section eyebrows, terminal
mockups, code blocks. Body paragraphs never set in mono.

Headlines are **sentence-case**, often **period-terminated** ("Build and deploy
on the AI Cloud."), with aggressive **negative letter-spacing** (`-2.4px` at
48px hero). Reverting to default tracking breaks the brand. Mono labels are
the only place uppercase appears.

## Polarity in Dark Mode

In light Vercel, the primary CTA is a black pill against white siblings, and
the "featured" pricing tier is a black card polarity-flipped from white
neighbors. **In dark mode, that polarity inverts**: the primary CTA becomes a
**white pill** against dark siblings, and the featured tier becomes a **white
card with dark text** against dark neighbors. The polarity flip — not the
specific color — is the signature.

## Colors

| Token | Hex | Use |
|---|---|---|
| `colors.canvas` | #000000 | Deepest band, polarity-flipped sections |
| `colors.canvasSoft` | #0a0a0a | Default page background |
| `colors.canvasSoft2` | #111111 | Inset region |
| `colors.card` | #0a0a0a | Card surface (held by hairline ring) |
| `colors.cardElevated` | #161616 | Featured / nested card |
| `colors.hairline` | #1f1f1f | 1px dividers, card borders |
| `colors.hairlineStrong` | #2e2e2e | Emphasized divider |
| `colors.ink` | #ededed | Headings + primary body |
| `colors.body` | #a1a1a1 | Secondary text |
| `colors.mute` | #737373 | Lowest-priority text |
| `colors.primary` | #ededed | Primary CTA pill background (white on dark) |
| `colors.onPrimary` | #0a0a0a | Text on white CTA |
| `colors.primarySurface` | #fafafa | Polarity-flipped featured card |
| `colors.primarySurfaceText` | #0a0a0a | Text on featured card |
| `colors.link` | #3291ff | Inline links (brighter than light-mode #0070f3) |
| `colors.success` | #0fcc4e | Financial gain |
| `colors.error` | #ff4949 | Financial loss / destructive |
| `colors.warning` | #f5a623 | Caution / pending |

### Brand Gradient Stops (unchanged from light mode — pop more on dark)

| Pair | Start | End |
|---|---|---|
| Develop | #007cf0 | #00dfd8 |
| Preview | #7928ca | #ff0080 |
| Ship | #ff4d4d | #f9cb28 |

The three pairs collapse into a single multi-stop mesh gradient when used as
the hero backdrop. **Use at hero scale only.** Never miniaturize to an icon,
never reduce to one color, never reorder the stops.

`tokens.meshGradient.backdrop` is a pre-baked CSS `background-image` string
ready to drop on any hero band.

## Typography Hierarchy

| Token | Size | Weight | Line | Tracking | Notes |
|---|---|---|---|---|---|
| `type.displayXL` | 48 | 600 | 48 | -2.4px | Hero headline (sentence case, period-terminated) |
| `type.displayLG` | 32 | 600 | 40 | -1.28px | Section headline |
| `type.displayMD` | 24 | 600 | 32 | -0.96px | Card cluster headline |
| `type.displaySM` | 20 | 600 | 28 | -0.6px | Inline micro-heading |
| `type.bodyLG` | 18 | 400 | 28 | 0 | Lead paragraph |
| `type.bodyMD` | 16 | 400 | 24 | 0 | Default body |
| `type.bodySM` | 14 | 400 | 20 | -0.28px | Secondary body, button-md |
| `type.captionMono` | 12 | 400 | 16 | 0 | Mono eyebrow (UPPERCASE, JetBrains Mono) |
| `type.code` | 13 | 400 | 20 | 0 | Code blocks, terminal mockups |
| `type.buttonMD` | 14 | 500 | 20 | 0 | Nav-scale button label |
| `type.buttonLG` | 16 | 500 | 24 | 0 | Marketing pill label |
| `type.statValueXL` | 48 | 600 | 52 | -2.4px | Hero portfolio value |
| `type.statValue` | 32 | 600 | 36 | -1.28px | Stat-cell numeric |

### Voice rules
- Display ceiling is **weight 600**. Never go 700.
- Headlines: **sentence case, period-terminated**.
- **Negative tracking** is part of the voice — never default.
- **Mono only for the technical layer** (eyebrows, code).
- **No positive letter-spacing**, ever, in the sans face.

## Shape Language

| Token | Value | Use |
|---|---|---|
| `radius.none` | 0 | Full-bleed bands |
| `radius.sm` | 6 | Nav buttons, form inputs, in-app controls |
| `radius.md` | 8 | Feature cards, template cards (marketing default) |
| `radius.lg` | 12 | Pricing cards, callout panels |
| `radius.xl` | 16 | Hero-image cards |
| `radius.pillSm` | 64 | Tab pills |
| `radius.pill` | 100 | Marketing CTA — the canonical button shape |
| `radius.full` | 9999 | Circular icon buttons |

The two pill scales — **6px nav** vs **100px marketing** — coexist deliberately.
Pick one scale per surface and stay there; don't mix.

## Elevation

Cards use **stacked shadows** (multiple small offsets layered) plus an inset
hairline ring — never a single heavy drop-shadow. Tokens `shadow.level1` →
`shadow.level5` cycle through:

| Level | Use |
|---|---|
| L1 | Inset hairline only |
| L2 | Subtle drop (template cards) |
| L3 | Soft stack (feature cards) |
| L4 | Float stack (pricing, callouts) |
| L5 | Modal stack |

For dark mode, shadow opacity is slightly elevated (0.15–0.4 vs light-mode's
0.05–0.2) so the offsets stay visible against the ink canvas.

## Spacing

Base 4px (Vercel's `--geist-space`).

`xxs:4 · xs:8 · sm:12 · md:16 · lg:24 · xl:32 · 2xl:40 · 3xl:48 · 4xl:64 · 5xl:96 · section:96`

- Marketing band padding: `4xl` to `5xl`
- Card interior padding: `lg` (24) to `xl` (32)
- Inline gap between siblings: `sm` (12) to `md` (16) — Vercel's `--geist-gap` is 24

## Components

| Component | Surface | Radius | Shadow | Typography |
|---|---|---|---|---|
| `button-primary` (marketing) | `primary` ink-near-white | `pill` 100 | none | `buttonLG` |
| `button-secondary` (marketing) | `card` + 1px hairline | `pill` 100 | `level1` | `buttonLG` |
| `nav-cta-signup` | `primary` | `sm` 6 | none | `bodySMStrong` |
| `nav-cta-login` | `card` | `sm` 6 | `level1` | `bodySMStrong` |
| `tab-ghost` | `card` | `pillSm` 64 | `level1` | `bodySM` |
| `card-marketing` | `card` | `md` 8 | `level3` | inner |
| `pricing-card-featured` | `primarySurface` (white) | `lg` 12 | `level4` | dark text |
| `code-editor-mockup` | `canvas` (pure black) | `md` 8 | `level1` | `code` |

## Do's

- Reserve `colors.primary` (white in dark mode) for primary CTAs.
- Use `radius.pill` (100px) for marketing CTAs and `radius.sm` (6px) for nav.
- Set every headline weight 600, sentence case, with negative tracking.
- Use the mesh gradient as the hero backdrop — and nowhere else.
- Layer stacked shadows; never a single heavy drop.
- Cycle bands canvasSoft → card → primary surface for polarity rhythm.
- Mono only for eyebrows + code.

## Don'ts

- Don't introduce a sixth accent color. Ink + gray + 4-pair gradient is the palette.
- Don't render headlines in all caps. Sentence-case only.
- Don't drop a single heavy shadow on cards.
- Don't render the mesh gradient at icon scale.
- Don't promote Inter to weight 700.
- Don't mix nav-radius (6px) and marketing-pill (100px) on the same surface.
- Don't set body paragraphs in mono.
