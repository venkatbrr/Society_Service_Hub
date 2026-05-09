# Verandah Design Reference

This document is the canonical reference for the Verandah UI system used in Society Service Hub.

## Principles

1. Calm utility first: prioritize task completion over decoration.
2. Warm restraint: use soft neutrals with selective semantic color.
3. Consistent hierarchy: surfaces, spacing, and type must feel predictable.
4. Accessibility by default: readable contrast, large enough tap targets, clear labels.
5. Deterministic identity: people are represented consistently through initials avatars.

## Token Sources

- Color tokens: `constants/Colors.ts` (`Verandah`)
- Type, spacing, radius tokens: `constants/Verandah.ts` (`VerandahType`, `VerandahSpace`, `VerandahRadius`)

No production UI should define parallel visual token sets.

## Full Palette

From `Verandah`:

- `surface`: `#FAF8F4`
- `card`: `#FFFFFF`
- `cardMuted`: `#F1EFE8`
- `primary`: `#0F3732`
- `primaryFg`: `#F0EDE3`
- `accent`: `#0F6E56`
- `accentSoft`: `#E1F5EE`
- `caution`: `#854F0B`
- `cautionSoft`: `#FAEEDA`
- `danger`: `#A32D2D`
- `dangerSoft`: `#FCEBEB`
- `textPrimary`: `#1F2A28`
- `textSecondary`: `#6B6F6D`
- `textTertiary`: `#888780`
- `textMuted`: `#B4B2A9`
- `border`: `rgba(15, 55, 50, 0.08)`
- `borderStrong`: `rgba(15, 55, 50, 0.15)`

Avatar tint families:

- teal: bg `#E1F5EE`, fg `#0F6E56`
- amber: bg `#FAEEDA`, fg `#854F0B`
- purple: bg `#EEEDFE`, fg `#3C3489`
- pink: bg `#FBEAF0`, fg `#993556`
- blue: bg `#E6F1FB`, fg `#185FA5`

## Typography Scale

From `VerandahType`:

- `display`: 26/30, weight 500
- `title`: 20/26, weight 500
- `body`: 14/20, weight 400
- `bodyBold`: 14/20, weight 500
- `caption`: 12/16, weight 400
- `captionBold`: 12/16, weight 500
- `micro`: 11/14, weight 400
- `sectionLabel`: 12, weight 500, uppercase, letter spacing 0.4

Weight policy:

- Allowed: `400`, `500`
- Not allowed: `600+`

## Spacing Scale

From `VerandahSpace`:

- `xs`: 4
- `sm`: 8
- `md`: 12
- `lg`: 16
- `xl`: 20
- `xxl`: 24
- `xxxl`: 32

## Radius Scale

From `VerandahRadius`:

- `sm`: 8
- `md`: 12
- `lg`: 16
- `xl`: 20
- `pill`: 999
- `frame`: 32

## Component Rules

- `BaseCard`: default wrapper for cards and grouped informational sections.
- `Avatar`: use for all person entities (creators, residents, joiners, contributors).
- `Rupees`: use for rupee amounts where feasible; avoid manual `Rs`/`₹` string formatting.
- `EmptyState`: standard empty/list-zero rendering.

General constraints:

- Avoid `LinearGradient` for card/chrome/button surfaces.
- Avoid `shadow*` and `elevation` on cards.
- Keep copy in sentence case.
- Prefer tokenized semantic color meanings over ad-hoc visual accents.

## Avatar Tint Algorithm Rationale

The app intentionally uses deterministic initials avatars rather than mixed photo + fallback rendering.

Rationale:

1. Consistency: avoids mixed-quality user photo presentation.
2. Recognition: same person always maps to the same tint family.
3. Performance: no image fetch dependency for identity rendering.
4. Privacy: no pressure to upload photos for core app use.

`getAvatarTint(name)` creates a stable mapping so each name consistently resolves to one tint pair.

## Rupees Rules

Use `Rupees` for monetary presentation:

- Applies Indian digit grouping (`en-IN`)
- Formats symbol, integer, decimal parts consistently
- Supports tone:
  - `in`: positive contribution style
  - `out`: outgoing/default
  - `neutral`: default neutral style

Do not hand-build currency strings in UI when `Rupees` can be used.

## Out-of-Register Appendix

Out-of-register means any active UI that does not fully match Verandah constraints.

Each entry should list:

- File path
- Deviation summary
- Why it is currently required
- Follow-up action and owner

Current entries:

- None recorded in this revision.
