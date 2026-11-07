# Design System Master File — Arabs Startups

> **LOGIC:** When building a specific page, first check `design-system/arabs-startups/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file. Otherwise follow the rules below.

**Project:** Arabs Startups (`arabs/startups`)
**Category:** News / Media Platform — Arabic-first (RTL), English secondary
**Brand direction:** "Slash" (from `design/B · Slash.pdf`)
**Style:** Minimalism & Swiss Style (grid-led, editorial) — RTL level: **full**
**Dials:** Variance 4/10 (balanced) · Motion 3/10 (subtle) · Density 5/10 (standard)

> Note: the client **brand** (the Slash PDF) is the source of truth for color and type. The generic palette/font the generator proposed has been replaced with the brand below.

---

## 1. The brand in one line

The **slash** is the brand. `arabs/startups` reads like a path: region, then sector. The same slash tags sections: `/news`, `/founders`, `/events`. The slash is the **only** colored element; everything else is ink, paper, and grid.

---

## 2. Color palette (brand)

Three brand colors only. Indigo is an **accent**, used sparingly: the logo slash, links, one primary CTA, section tags.

| Role | Hex |
|------|-----|
| Ink (near-black) | `#000012` |
| Paper (white) | `#FFFFFF` |
| Indigo (accent) | `#4B3BFF` |

### Semantic tokens — Light (default)

| Token | Value |
|-------|-------|
| `--bg` | `#FFFFFF` |
| `--fg` | `#000012` |
| `--accent` | `#4B3BFF` |
| `--on-accent` | `#FFFFFF` |
| `--muted-bg` | `#F4F4F7` |
| `--muted-fg` | `#4A4A55` |
| `--border` | `#E4E4EA` |
| `--card` | `#FFFFFF` |

### Semantic tokens — Dark

| Token | Value |
|-------|-------|
| `--bg` | `#000012` |
| `--fg` | `#FFFFFF` |
| `--accent` | `#8A80FF` *(lighter indigo — pure `#4B3BFF` fails text contrast on ink)* |
| `--on-accent` | `#000012` |
| `--muted-bg` | `#0C0C1C` |
| `--muted-fg` | `#A6A6B5` |
| `--border` | `#232334` |
| `--card` | `#0C0C1C` |

**Contrast rules:** body text meets 4.5:1. `#4B3BFF` on white passes for text; on ink it does **not** — in dark mode use `--accent` = `#8A80FF` for links/text and keep `#4B3BFF` only for large fills with white on top.

---

## 3. Typography

| Use | Font | Source |
|-----|------|--------|
| Arabic (default) | **IBM Plex Sans Arabic** | Google Fonts (OFL) |
| Latin / UI / logo | **Inter Tight** | Google Fonts |

- Logo wordmark: Inter Tight Bold, lowercase, letter-spacing tightened ~2.8%.
- Arabic headings & body: IBM Plex Sans Arabic. Base body 16px+, line-height 1.7 for Arabic.
- Keep numerals, email, URLs, and Latin names **LTR inline** even inside Arabic (`<bdi>` / `dir="ltr"`).

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter+Tight:wght@500;600;700;800&display=swap');
```

### Type scale (fluid)

| Token | Size |
|-------|------|
| `--fs-display` | clamp(2.2rem, 5vw, 3.75rem) |
| `--fs-h1` | clamp(1.8rem, 3.5vw, 2.6rem) |
| `--fs-h2` | clamp(1.4rem, 2.5vw, 1.9rem) |
| `--fs-h3` | 1.25rem |
| `--fs-body` | 1.0625rem (17px) |
| `--fs-small` | 0.875rem |

---

## 4. Spacing, radius, shadow

Swiss grid: generous whitespace, **sharp corners**, almost no shadow.

| Token | Value |
|-------|-------|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 16px |
| `--space-lg` | 24px |
| `--space-xl` | 32px |
| `--space-2xl` | 48px |
| `--space-3xl` | 72px |
| `--radius` | 2px (near-square; symbol block is 0) |
| `--shadow` | none by default; `0 1px 2px rgba(0,0,18,.06)` only if a card must lift |
| `--maxw` | 1200px content, 720px article text |

---

## 5. RTL-first rules (critical)

- `<html lang="ar" dir="rtl">` by default. English pages: `lang="en" dir="ltr"`.
- Use **CSS logical properties only**: `margin-inline`, `padding-inline`, `inset-inline-start/end`, `text-align: start`. Never hard-code `left`/`right`.
- The logo slash leans forward (LTR lean). Keep the wordmark `arabs/startups` **LTR** as a locked lockup even on Arabic pages; place an Arabic tagline beside/under it.
- Mirror icons that imply direction (arrows, chevrons, "read more"). Do not mirror the logo, numerals, or embedded players.
- Section tag style: a leading indigo slash before the label, e.g. `/ الأخبار`.

---

## 6. Page pattern

**Hero-centric, editorial.** Homepage order (from the content brief):
Hero (headline + one primary CTA) → Latest coverage (news cards) → Featured founder stories → Recurring series → Watch & listen (embeds) → "Have a story?" contact CTA → Footer.

One primary CTA per view. Never show an empty section for a format not launched yet.

---

## 7. Motion (subtle)

Scroll-reveal fade, 300–400ms, `power1.out`, y-offset 8–16px. Respect `prefers-reduced-motion` and render the final state immediately. No motion that blocks reading. SEO content must not depend on JS to be visible.

---

## 8. Components

- **Header:** `arabs/startups` lockup (slash in indigo) start-aligned; lean nav (Home, News, Founder Stories, Webinars & Podcasts, About, Contact); language switch (ar/en); one accent CTA ("Submit a story"). Sticky, does not cover content.
- **Article card:** category tag (`/news`), Arabic headline, short summary, author + date (date LTR), optional cover. Hover: 200ms, no layout shift.
- **Section heading:** leading indigo slash + label.
- **Buttons:** primary = indigo fill, white text; secondary = ink outline. `cursor:pointer`, 200ms transition, visible focus ring (`--accent`).
- **Comment / contact forms:** visible labels (not placeholder-only), error beside the field, Turnstile, 44×44px min touch targets.

---

## 9. Anti-patterns (do NOT use)

- ❌ Emoji as icons — use SVG (Lucide / Heroicons).
- ❌ Hard-coded `left`/`right` — breaks RTL.
- ❌ Indigo body text on the ink background (fails contrast).
- ❌ Rounded, shadowed, "SaaS" cards — this is an editorial grid.
- ❌ Cluttered layout, slow loading, layout-shifting hovers.
- ❌ Invisible focus states; disabling zoom; horizontal scroll on mobile.
- ❌ Inventing logos, partners, real articles, figures, or guests — use labeled placeholders.

---

## 10. Pre-delivery checklist

- [ ] `dir`/`lang` correct; Arabic default; English mirrors via logical properties.
- [ ] Text contrast ≥ 4.5:1 in both light and dark.
- [ ] SVG icons only; consistent set.
- [ ] `cursor:pointer` + 150–300ms transitions on interactive elements.
- [ ] Visible keyboard focus everywhere.
- [ ] `prefers-reduced-motion` respected.
- [ ] Responsive at 375 / 768 / 1024 / 1440px; no horizontal scroll.
- [ ] Numerals, URLs, Latin names stay LTR inside Arabic.
- [ ] No empty sections; placeholders clearly labeled.
