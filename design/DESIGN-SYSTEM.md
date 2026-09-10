# Matthew Annable — Design System v1.0

A warm, editorial, print-derived system for a one-person guitar-teaching
business. Paste this file plus `matthew-annable.css` into any project and tell
Claude to build to it.

**Character:** calm, human, hand-made. Warm paper rather than white, a serif
that reads like a book rather than a brand, one loud colour used once per
screen. It should feel like a well-set letter from a person, not a product page.

## Fonts

| Role | Family | Weights | Rule |
|---|---|---|---|
| Display | **Newsreader** | 400 headings, 500 sub-headings, 400 italic | Every h1/h2/h3, pull-quotes, big numbers, prices |
| UI / body | **Manrope** | 400 body, 600 labels, 700 buttons | Everything else. Never a heading |
| Mono | system mono | — | Reference codes, bank details, filenames |

```html
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..600&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Headings are serif, body is sans, and the two never swap. Headings run tight
(1.05–1.2 leading, −0.015em tracking); body runs generous (1.7). One italic
green word inside one heading per page is the only flourish.

## Colour

### Grounds
| Token | Hex | Use |
|---|---|---|
| `--ma-paper` | `#FBF8F3` | Default page ground. Warm off-white |
| `--ma-paper-2` | `#F4EFE7` | Alternating section bands, image wells, tinted cards |
| `--ma-card` | `#FFFFFF` | Cards only — never a page ground |
| `--ma-ink-ground` | `#1C211A` | Dark section / footer. Near-black with green in it |

### Ink
| Token | Hex | Use |
|---|---|---|
| `--ma-ink` | `#2E2A28` | Headings and primary body |
| `--ma-ink-soft` | `#6A625C` | Secondary body, captions (5.4:1 on paper) |
| `--ma-ink-faint` | `#A8A29A` | Dark grounds only, or non-text |

### Brand
| Token | Hex | Use |
|---|---|---|
| `--ma-green` | `#4C6D47` | Accent, links, eyebrows, step numbers, selected state |
| `--ma-green-line` | `#A8C2A3` | Link underlines, hover borders |
| `--ma-amber` | `#F7A630` | **The action colour.** Buttons and star ratings, nothing else |
| `--ma-plum` | `#6F4B52` | Link hover, rare editorial accent |
| `--ma-line` | `#E3DCD1` | Hairlines, card borders, dividers |
| `--ma-line-strong` | `#C9BFB0` | Form field borders |

**The one hard rule:** amber is a verb. One amber thing per screen, and it is
the thing you want pressed. Everything else that's clickable is green. Amber
never carries text at small sizes, never becomes a background band, and never
appears in the logo — the stroke is too fine to hold at that lightness.

Two grounds per page maximum (paper + paper-2), plus the dark footer.

## Geometry

- Radii: **24px** photos, **16px** cards, **12px** inputs and small tints, **999px** buttons and pills
- Container **1080px**; body copy capped at **54ch**
- Section padding `clamp(32px, 7cqi, 104px)` vertical, `clamp(20px, 4cqi, 40px)` horizontal
- Cards `clamp(22px, 2.8cqi, 30px)`, grid gap `clamp(18px, 2.2cqi, 24px)`
- Grids are `repeat(auto-fit, minmax(290px, 1fr))` — they reflow rather than break
- Sibling groups use flex/grid + `gap`, never margins on children
- One shadow exists: the amber glow under the primary button. Cards use a 1px hairline instead

## Tap targets

**44px minimum for anything tappable, 56px for the primary button.** This is
not negotiable — most traffic is parents on phones. Disclosure summaries,
inline text links and icon buttons all get padded up to 44px.

## Components

- **Button** — amber pill, 700 weight, ink text, amber glow shadow, full-width under 640px
- **Secondary action** — green text with a 1px green underline. Never a second filled button
- **Ghost button** — transparent, green text, neutral hairline border. Pagination and admin only
- **Card** — white on a band, tinted on paper, 1px hairline, 16px radius, flex column with 14px gap
- **Eyebrow** — 12px, 600, uppercase, 0.16em tracking, green. Labels a section above its h2
- **Pull-quote** — italic serif at 21–30px, capped at 46ch, attribution in sans 600
- **Disclosure** — `<details>` with a green "Read more ▾" summary; chevron rotates on open. Use it to keep long copy whole without a long page
- **Stat row** — sans 14px soft ink with the number in ink 700, separated by 1px vertical rules
- **Photography** — real photos only, 24px radius, cover-fit, warm paper well behind. No illustration, no icon sets, no stock

## Copy tone

First person, plain, specific. Contractions welcome. No marketing superlatives,
no exclamation marks, no emoji. Numbers stay concrete ("10 years teaching",
"36 reviews"). Prices are shown, never hidden behind a form.

## Not in this system

Gradients. Drop shadows on cards. Pure white page grounds. Icon fonts. Emoji.
Inter or Roboto. Rounded boxes with a left accent border. Anything that
suggests a startup rather than a person.
