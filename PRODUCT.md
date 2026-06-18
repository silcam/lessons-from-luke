# Product

## Register

product

## Users

**Lessons from Luke** serves people translating a Sunday School curriculum (the Gospel of Luke) from a source language into the world's languages. Three audiences share the app:

- **System administrators** — manage users, languages, and invitations; have access across all language projects. They work in the web admin (login → dashboard → invitation/user management).
- **Language-project members** — granted owner / editor / viewer roles on a specific language. They live in the split-panel translation editor, often for hours at a stretch.
- **Offline desktop translators** — use the Electron app to work on a single language, frequently **offline and in the field**, syncing via a language code when a connection is available.

Many users are **volunteers and field translators, not software professionals**. They work across **many writing systems and reading directions**, often on **modest hardware over low-bandwidth connections**.

## Product Purpose

Lessons from Luke turns English curriculum content into translated, exportable lessons in any language. It manages languages, lessons, documents (ODT), and the people allowed to work on them, and it keeps web and offline-desktop work in sync.

Success is a translator who can open a lesson and stay in the work — reading source and target side by side, in their own script, without the interface getting in the way — and an administrator who can confidently grant the right people access to the right languages.

## Brand Personality

**Clear, efficient, utilitarian.** This is a working tool, not a showpiece. The voice is plain and direct; the interface earns trust by being legible, predictable, and quietly reliable. Personality is carried by restraint and clarity, not decoration. The content being translated — Scripture — deserves an interface that respects it by getting out of the way.

## Anti-references

This should **not** look or feel like any of these:

- **A flashy, trendy startup** — no gradients-for-gradients'-sake, glassmorphism, hype animation, or dark-mode-cool. Trend-chasing reads as unserious here.
- **Childish church clip-art** — no cartoon mascots, rainbow Comic-Sans energy, or Sunday-school-craft kitsch. The audience is adults doing serious translation work.
- **A corporate SaaS dashboard** — no crowded charts, sidebar-of-everything, or enterprise blandness. Density and "powerful-looking" complexity are not the goal.
- **Ornate religious skeuomorphism** — no gilt, parchment textures, stained glass, or faux-leather-Bible aesthetics. Reverence comes from restraint, not theming.

## Design Principles

1. **Consistency over novelty.** New features adopt the existing component vocabulary and palette (`src/frontend/common/base-components/`, `Colors.ts`). The current direction is to *maintain* the established visual style — e.g. the invitation workflow — not to introduce a competing visual language. Reach for what's already there before inventing.
2. **The text is the product.** Scripture and translation content are the focus; chrome recedes so the words read clearly. Optimize for legibility and sustained focus during long editing sessions.
3. **Approachable for non-experts.** Many users are volunteers, not software people. Name things plainly, guide each screen, and forgive mistakes. Clarity beats cleverness.
4. **Works where the work happens.** Assume low bandwidth, modest hardware, and frequent offline use. Favor lightweight, resilient, fast-loading interfaces over heavy effects.
5. **Script-agnostic by default.** The UI must host any writing system and reading direction without breaking. Never assume Latin text or left-to-right layout.

## Accessibility & Inclusion

- **Target: WCAG 2.1 AA.** Meet AA contrast, keyboard operability, and visible-focus standards as the default bar.
- **Non-Latin scripts & fonts.** The UI and editor must render Thai, Arabic, Devanagari, CJK, and other writing systems cleanly; don't hard-code Latin-only assumptions into line-height, truncation, or font stacks.
- **Right-to-left (RTL).** Some target languages read right-to-left; layouts, the editor, and directional UI must not break.
- **Color-blind safe.** State colors (success / warning / danger) must not rely on hue alone — pair them with text, icon, or shape.
- **Reduced motion.** Honor `prefers-reduced-motion`; every animation needs a crossfade or instant alternative.
- **Modest hardware / low bandwidth.** Treat performance as accessibility: avoid render-heavy effects and large payloads.
