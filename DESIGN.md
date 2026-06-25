---
name: Lessons from Luke
description: A clear, utilitarian translation workbench for Sunday School curriculum in every language.
colors:
  primary: "#3f88c5"
  primary-active: "#3470a2"
  dark-bg: "#1c3144"
  highlight: "#ffba08"
  warning: "#ffba08"
  success: "#39b54a"
  danger: "#d00000"
  danger-active: "#ab0000"
  grey: "#999999"
  light-grey: "#dddddd"
  hover-stripe: "#efefef"
  surface: "#ffffff"
  ink: "#000000"
typography:
  display:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "2.5em"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  headline:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "2em"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "1.5em"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "1em"
    fontWeight: 200
    lineHeight: 1.4
rounded:
  sm: "0.25em"
  md: "8px"
spacing:
  xs: "0.25em"
  sm: "0.5em"
  md: "1em"
  lg: "1.2em"
  xl: "1.8em"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0.5em 1em"
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.surface}"
  button-primary-disabled:
    backgroundColor: "#3f88c599"
    textColor: "{colors.surface}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0.5em 1em"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    padding: "0"
  input-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "0.125em 0.25em"
  alert-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: "0.5em 1em"
  alert-highlight:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.highlight}"
    rounded: "{rounded.sm}"
    padding: "0.5em 1em"
  header-bar:
    backgroundColor: "{colors.dark-bg}"
    textColor: "{colors.surface}"
    padding: "1em"
  list-item:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "0.5em 1em"
---

# Design System: Lessons from Luke

## 1. Overview

**Creative North Star: "The Field Manual"**

This is a working tool, not a showpiece. A field manual earns trust by being legible, predictable, and rugged — it works on a folding table in a village with spotty power as readily as on an office desk. Every screen exists to serve one job: get translated curriculum out of a translator's head and into an exportable lesson, in their own writing system, without the interface getting in the way. The content being translated — Scripture — is the figure; the chrome is the ground, and the ground stays quiet.

The system is deliberately plain. It is flat (no shadows, no gradients), monochrome-typed (a single Helvetica family at several sizes and weights), and built from a small, consistent kit of styled-components primitives in `src/frontend/common/base-components/`. State is communicated through a tight, named color set (`Colors.ts`): blue for action, green for done, amber for in-progress/attention, red for danger. There is no decoration that doesn't carry information.

The current directive is to **maintain and extend this established style**, not to redesign it. New surfaces — the in-progress invitation workflow especially — should adopt this kit and these tokens rather than invent a parallel language. What this system explicitly rejects: the flashy-trendy-startup look (gradients, glassmorphism, dark-mode-cool, hype animation), childish church clip-art, the crowded corporate-SaaS dashboard, and ornate religious skeuomorphism (gilt, parchment, stained glass, faux leather). Reverence here comes from restraint.

**Key Characteristics:**

- **Flat by default** — no shadows, no gradients; depth is conveyed by borders and the dark header band alone.
- **One type family** — Helvetica at a small set of sizes; hierarchy through size and weight, never through new faces.
- **Information-carrying color** — the `Colors.ts` set is functional (action / done / attention / danger), used sparingly on a white surface.
- **Em-based, fluid spacing** — sizing scales with font-size; the layout is comfortable, not dense.
- **Script-agnostic** — must host any writing system and reading direction without breaking.

## 2. Colors

A small, functional palette on a white surface: one action blue, one dark navy for chrome, and three traffic-light state colors. Color is never decorative — every hue means something.

### Primary

- **Action Blue** (`#3f88c5`): The single interactive color. Primary buttons, link buttons, and the focused-input border. On press it deepens to **Action Blue Pressed** (`#3470a2`, the `darker()` transform — each RGB channel × 0.82); when disabled it fades to `#3f88c599` (the `faded()` transform — 60% alpha).

### Secondary

- **Field Navy** (`#1c3144`): The chrome color. Carries the header band (`HeaderBar`) with white text and the app logo. It is the only large dark surface in the system; everything below the header is white.

### Tertiary (state colors)

- **Done Green** (`#39b54a`): Success — completed progress bars (at 100%), the "clean/saved" state of `StatusfulTextArea`.
- **Attention Amber** (`#ffba08`): One value serves two named roles, `highlight` and `warning` — highlight alerts, in-progress progress bars (< 100%), and the "dirty/working" state of `StatusfulTextArea`.
- **Danger Red** (`#d00000`): Error alerts, destructive buttons, error text. Deepens to **Danger Pressed** (`#ab0000`) on press.

### Neutral

- **Ink** (`#000000`): Body text. Not an explicit token — it is the browser default on the white surface, which yields a maximal 21:1 contrast. Treat it as the text color and don't lighten it toward gray for "elegance."
- **Mute Grey** (`#999999`): Placeholder text and disabled/subdued text only. Never body copy (it fails AA at small sizes on white).
- **Hairline Grey** (`#dddddd`): Every border, divider, and rule in the system — input underlines, list separators, table cells, foldable-panel outlines, the progress-bar track.
- **Stripe Grey** (`#efefef`): The single hover wash, used on striped list rows.
- **Surface** (`#ffffff`): The page. Also the text color on the navy header and on colored buttons.

### Named Rules

**The Color-Means-Something Rule.** No color is used decoratively. If a hue appears, it is reporting state — blue (actionable), green (done), amber (in progress / attention), red (danger). A surface that needs visual interest gets it from type and spacing, not from paint.

**The Single-Action-Color Rule.** Blue is the only interactive color. Don't introduce a second "accent"; if everything is highlighted, nothing is.

## 3. Typography

**Display / Body / Label Font:** Helvetica (with `Arial, sans-serif` fallback) — one family for everything.

**Character:** Neutral, legible, unfussy. The type does not perform; it gets out of the way of the source and target text the translator is actually reading. Because the _content_ may be in any script (Thai, Arabic, Devanagari, CJK), the UI face is intentionally anonymous so it never competes with the writing systems it frames.

### Hierarchy

Headings are sized by a single formula in `Heading.tsx`: `font-size = (6 − level) × 0.5em`, with `margin: 0.6em 0`.

- **Display** (`<h1>`, bold, 2.5em): Page and header-bar titles.
- **Headline** (`<h2>`, bold, 2em): Major section headings.
- **Title** (`<h3>`, bold, 1.5em; `<h4>` = 1em): Subsection headings.
- **Body** (regular 400, 16px root / 1em): All running text and form values. Cap measure at 65–75ch where prose runs long.
- **Label** (light 200, 1em, `display: block`): Form-field labels (`Label.tsx`). The 200 weight is the system's quietest voice.

### Named Rules

**The One-Family Rule.** Hierarchy comes from size and weight within Helvetica — never from adding a second typeface. There is no display font and no mono font.

**The Script-Neutral Rule.** Never hard-code Latin-only assumptions into line-height, truncation, or font stacks. The editor must render right-to-left and complex scripts cleanly; the UI font is a frame, not the content.

## 4. Elevation

**This system is flat. There are no shadows anywhere** — `box-shadow` appears nowhere in the frontend, and there are no CSS transitions, no `@media` breakpoints, and no `prefers-reduced-motion` handling at present. Depth and separation are conveyed entirely by two devices: **1px hairline borders** (`#ddd`) and the **single dark band** of the navy header against the white body. Foldable panels round their hairline border at `8px`; everything else that rounds uses `0.25em`.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat and separated by hairlines, not shadows. If a new component reaches for a drop shadow to stand out, the answer is a border or whitespace instead. A faint shadow would read as a different design language and is prohibited.

## 5. Components

All components are styled-components primitives in `src/frontend/common/base-components/`. Reach for these before writing new markup.

### Buttons

- **Shape:** Slightly rounded corners (`0.25em` radius), zero border width.
- **Primary:** White text on Action Blue (`#3f88c5`); padding `0.5em 1em`; margin `0.25em`. `:active` → Action Blue Pressed (`#3470a2`); `:disabled` → faded blue (`#3f88c599`), cursor default.
- **Danger (`red` prop):** White text on Danger Red (`#d00000`); same shape; `:active` → `#ab0000`.
- **Bigger (`bigger` prop):** Same button at `font-size: 1.3em`.
- **Link (`link` prop):** Text-only, Action Blue, no background, zero padding; underline on `:hover`; `#3470a2` on `:active`.
- **States note:** Active buttons set `outline: none`. See Do's & Don'ts — a visible focus indicator must be restored for keyboard users.

### Inputs / Fields

- **Text input (`TextInput`):** Borderless except a 1px bottom hairline (`#ddd`); padding `0.125em 0.25em`; full width. `:focus` shifts the underline to Action Blue and removes the outline. Placeholder is Mute Grey (`#999`).
- **Textarea (`TextArea`):** Full 1px hairline border, `0.25em`-ish padding, `resize: none`, auto-grows to content height via JS. `:focus` → blue border.
- **Stateful textarea (`StatusfulTextArea`):** A `TextArea` whose border reports save state — Done Green (`clean`/saved) or Attention Amber (`dirty`/`working`). The signature editor affordance.
- **Select (`SelectInput`) / Checkbox:** Near-native; `font-size: 1em`. Checkbox is wrapped in a light-weight `Label`.

### Lists & Tables

- **List item (`ListItem`):** 1px bottom hairline (top hairline on first child); padding `0.5em 1em` (or `0.5em 0` with `noXPad`). Optional `hoverStriping` washes the row to Stripe Grey (`#efefef`).
- **Table (`Table`):** `border-collapse: collapse`; cell padding `0.3em 0.7em`; optional 1px hairline cell borders.

### Feedback

- **Alert (`Alert`):** 2px solid border + matching text color, `0.25em` radius, `0.5em 1em` padding, `0.5em 0` margin. Danger (red) or highlight (amber) variants. Note: the border and text share the state hue — color alone carries meaning, which the Do's & Don'ts flag for AA.
- **Progress bar (`ProgressBar`):** Hairline-grey track; fill is Done Green at 100%, Attention Amber below. Heights: `2px` default, `6px` fixed (100px wide), `8px` big.

### Navigation / Chrome

- **Header bar (`HeaderBar` / `StdHeaderBar`):** Field Navy (`#1c3144`) band, white text, `1em` padding; logo image at `4em` height with `0.8em` right margin; `<h1>` title with zero margin. This is the app's one piece of persistent chrome.

### Containers

- **Foldable (`Foldable`):** 1px hairline border, `8px` radius, `1em` margin; collapsed/expanded via a `PlusMinusButton` (light-grey `+`/`−` glyph, `1.5em` bold).
- **Flex / Div / Scroll:** Layout primitives — `FlexRow`/`FlexCol` with `flexZero`, `flexRoot`, `spaceBetween`, `alignCenter` props; `Div` with `pad`/`padVert`; `Scroll` for `overflow: auto` regions.

## 6. Do's and Don'ts

### Do:

- **Do** build new screens from the `base-components/` kit and the `Colors.ts` tokens. Consistency over novelty — the in-progress **invitation workflow** (`CreateInvitation`, `InvitationsList`, `RedeemInvitation`) is _not_ a style reference; it is unfinished and should be brought up to match this documented system.
- **Do** keep surfaces flat and separate them with 1px `#ddd` hairlines or whitespace.
- **Do** use color only to report state: blue = action, green = done, amber = attention, red = danger.
- **Do** keep body text at Ink (`#000`) on white. Reserve Mute Grey (`#999`) for placeholders and disabled text only.
- **Do** restore a **visible keyboard focus indicator** on buttons and inputs (the kit currently sets `outline: none`). PRODUCT.md targets WCAG 2.1 AA; a focus ring is an accessibility necessity, not a style change — add one in the system's blue without otherwise altering the look.
- **Do** pair every state color with text, an icon, or a shape so meaning survives for color-blind users (alerts currently rely on hue alone).
- **Do** keep the UI font neutral and let any writing system or reading direction (incl. RTL) render cleanly inside it.

### Don't:

- **Don't** add a second accent color or use any hue decoratively — the **Single-Action-Color** and **Color-Means-Something** rules hold.
- **Don't** introduce shadows, gradients, glassmorphism, or hype animation — that is the flashy-trendy-startup look this product rejects.
- **Don't** reach for childish church clip-art, crowded corporate-SaaS dashboards, or ornate religious skeuomorphism (gilt, parchment, stained glass, faux leather).
- **Don't** add a second typeface or a display/mono font; hierarchy is size + weight within Helvetica.
- **Don't** lighten body text toward gray for "elegance" — it breaks AA contrast and legibility, which is the whole point of a field manual.
- **Don't** assume Latin text, left-to-right layout, modern hardware, or fast bandwidth — favor lightweight, resilient interfaces.
