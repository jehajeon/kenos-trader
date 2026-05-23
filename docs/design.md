# KENOS — Design System (BMW M-inspired)

This is the canonical design reference for KENOS Trader.
Source: BMW M brand language (adapted for a finance dashboard).
All tokens live in `lib/design-tokens.js`.

## Overview

Near-pure black canvas (`colors.canvas` — #000) holding white headlines in **confident UPPERCASE**. The system has no decorative voltage of its own — brand energy comes from **bold numeric data** (in place of BMW's full-bleed automotive photography), placed as edge-to-edge content. UI chrome stays minimal: thin sans-serif copy, dividers as 1px hairlines (`colors.hairline`), all-caps button labels with no fill until pressed.

The **M tricolor stripe** — `colors.mBlueLight` (#0066b1) → `colors.mBlueDark` (#1c69d4) → `colors.mRed` (#e22718) — appears sparingly as the brand's signature accent. It is never a CTA color and never used as a background fill — exclusively a brand-identity marker.

Type voice runs **Inter** (BMW Type Next Latin substitute) in two cuts: **700 (Display)** for headlines, navigation, button text, category labels — and **300 (Light)** for body, descriptive copy, secondary metadata. The contrast between heavy display and light body is the system's editorial signature.

**Key Characteristics:**
- Near-pure black canvas with white type
- Display headlines in UPPERCASE at weight 700; sub-heads sentence-case at lighter weight
- M tricolor used as 4px brand-stripe dividers, never as buttons or fills
- Bold numeric displays fill bands — cars in BMW M are data points here
- Buttons are flat with 0px corners and uppercase letterspaced labels (1.5px tracking)
- Border radius is mostly zero; circular only for icon buttons
- Spacing is generous: 64px between sections, 24-40px inside cards

## Colors

| Token | Hex | Use |
|---|---|---|
| `colors.canvas` | #000000 | Page floor |
| `colors.surfaceSoft` | #0d0d0d | Spec table cells, footer-adjacent |
| `colors.surfaceCard` | #1a1a1a | Cards, icon-button backgrounds |
| `colors.surfaceElevated` | #262626 | Nested cards inside dark bands |
| `colors.carbonGray` | #2b2b2b | Technical-spec cards |
| `colors.hairline` | #3c3c3c | 1px dividers on dark surfaces |
| `colors.onDark` | #ffffff | All headline + primary text |
| `colors.bodyStrong` | #e6e6e6 | Emphasized body / lead paragraph |
| `colors.body` | #bbbbbb | Default running-text |
| `colors.muted` | #7e7e7e | Footer links, breadcrumbs, captions |
| `colors.mBlueLight` | #0066b1 | M tricolor stop 1 (brand only) |
| `colors.mBlueDark` | #1c69d4 | M tricolor stop 2 (brand only) |
| `colors.mRed` | #e22718 | M tricolor stop 3 (brand only) |
| `colors.profit` | #0fa336 | Financial gain semantic |
| `colors.loss` | #e22718 | Financial loss (= M Red) |
| `colors.warning` | #f4b400 | Caution / kill-switch warning |

## Typography Hierarchy

| Token | Size | Weight | Tracking | Case |
|---|---|---|---|---|
| `type.displayXL` | 64px | 700 | -1px | UPPER |
| `type.displayLG` | 48px | 700 | -0.5px | UPPER |
| `type.displayMD` | 32px | 700 | -0.3px | UPPER |
| `type.displaySM` | 24px | 700 | 0 | UPPER |
| `type.titleLG` | 20px | 700 | 0 | sentence |
| `type.label` | 11px | 700 | 1.5px | UPPER |
| `type.bodyMD` | 15px | 300 | 0 | sentence |
| `type.bodySM` | 13px | 300 | 0 | sentence |
| `type.button` | 13px | 700 | 1.5px | UPPER |
| `type.statValue` | 32px | 700 | -0.5px | tabular-nums |

## Shape Language

- **`radius.none` (0px)** — the default for every button, card, input, table cell
- **`radius.full` (50%)** — only for circular icon buttons / carousel arrows / chatbot launcher
- Nothing in between. Sharp rectangles = engineered precision; circles = functional controls.

## Spacing

Base unit 4px:
- `xxs:4 · xs:8 · sm:12 · md:16 · lg:24 · xl:40 · xxl:64 · section:64`
- **Section padding (vertical):** 64px between major bands
- **Card internal padding:** 24px (content) or 40px (spec cells)
- **Gutters between cards:** 24px

## Signature Elements

### M-Stripe Divider
`tokens.stripe` — 4px tall, three equal solid blocks of the M tricolor. Used between brand-identity sections and as section anchors. The system's only true decorative element.

### Stat Cell
Large monospace numeric value (`type.statValue`) sitting above a small uppercase label (`type.label`). Background `colors.surfaceSoft`, 0px radius. Big number is the band's voltage.

### Section Header
Small uppercase label (`type.label`, color `colors.muted`) above a large display heading (`type.displayMD`). 64px vertical padding around section blocks.

### Button (Primary)
Transparent or canvas background, 1px white border, white uppercase letterspaced label, 0px radius, 48px height. The rectangular silhouette IS the brand button.

### Button (Icon)
48 × 48px circle, `colors.surfaceCard` background, white centered glyph. The only non-rectangular button shape.

## Do's and Don'ts

### Do
- Anchor every band with bold numeric data displays
- Use UPPERCASE display headlines
- Pair heavy display (700) with light body (300)
- Use `radius.none` by default
- Letter-space all-caps labels at 1.5px
- Reserve M tricolor for brand-identity moments

### Don't
- Don't introduce brand colors outside M tricolor
- Don't bold body type (stays at 300)
- Don't use rounded buttons
- Don't put gradient backdrops behind hero type
- Don't repeat the same surface mode in two consecutive bands
- Don't use M stripe as a button fill
- Don't drop letter-spacing below 1.5px on button labels
