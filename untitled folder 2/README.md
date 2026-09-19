# Rotational — prototype architecture

Three files, one clean split:

- **`game-logic.js`** — everything about the game itself: variables, decisions,
  effect math, match simulation, thresholds. No DOM code at all. This is
  where the "real" game lives, and it's the file to edit when you want to
  add decisions, rebalance numbers, or change how a stat is calculated.
- **`styles.css`** — all visual styling.
- **`app.js`** — reads game state from `GameEngine` (defined in
  `game-logic.js`) and renders it to the page. This is the file to replace
  or heavily rework if you want a different UI — different layout, animations,
  a totally different visual style, even a different framework — without
  touching how the game actually plays.
- **`index.html`** — just wires the three together.

## The contract between logic and UI

`app.js` only ever talks to `game-logic.js` through the `GameEngine` object.
That's the whole interface:

```
GameEngine.getState()          // current variable values (energy, sleep, etc.)
GameEngine.getPlayer()         // static player info (name, position, ...)
GameEngine.getWeek()           // current week number
GameEngine.getSeasonLength()   // total weeks in a season
GameEngine.getCurrentDecision()// the decision object to display right now
GameEngine.getStepLabel()      // "Training Decision", "Nutrition / Hydration Decision", etc.
GameEngine.choose(optionIndex) // apply a decision option (0, 1, or 2), advances the game
GameEngine.getPendingReport()  // weekly report data, once the match sim has run
GameEngine.advanceWeek()       // dismiss the report, move to the next week
GameEngine.getLog()            // history of decisions/matches, newest first
GameEngine.getSeasonStats()    // cumulative season totals
GameEngine.isSeasonOver()      // true once week > season length
GameEngine.tier(value)         // {label, colorKey} for a 0-100 stat
GameEngine.reset()             // start a new season
```

If you want to build a completely different front end (a card-based UI, a
mobile layout, even a native app talking to a rebuilt version of this logic
in another language), everything you need is in that list above — you never
need to read the internals of `game-logic.js` to build a UI on top of it.

## Adding content

New decisions live in `game-logic.js` inside `trainingDecisions`,
`nutritionDecisions`, `sleepDecisions`, and `personalDecisions`. Each one
follows the same shape:

```js
{
  title: "...",
  desc: "...",
  options: [
    { label: "...", detail: "...", evidence: "optional — why this effect size",
      effects: { variableName: deltaAmount, ... } }
  ]
}
```

Use the `EFFECT_SCALE` constants (`veryS`, `small`, `moderate`, `large`,
`major`) instead of raw numbers so effect sizes stay consistent with the
1–25 point scale from the design doc.

## Game-feel layer (added in v2)

`app.js` now does more than swap text — it's a small screen router with
these states: `start` → `decision` → (on the 4th weekly choice) `matchday`
→ `report` → `weekTransition` → back to `decision`, or `end` once the
season's over. The additions:

- **Title screen** before the season starts.
- **Season progress track** — a top bar for week N/12 plus five dots for
  this week's beats (train/fuel/rest/life/match), so you always know where
  you are without reading the log.
- **Matchday sequence** — a few seconds of "Warming up… Kickoff… Full
  time." between your last decision and the report, instead of an instant
  cut. This is the single biggest "feels like a game" lever for the least
  code.
- **Week transition card** — a beat between weeks so they read as distinct
  chapters.
- **Animated reveals** — the weekly report's stat deltas fade in one at a
  time instead of appearing all at once.

All of this is UI-only and lives in `app.js`/`styles.css`; `game-logic.js`
is untouched by any of it. If you want to go further (sound, a visual
match-minute-by-minute ticker, a proper roster screen), this router
structure is the place to add new states.

## Character customization (added in v3)

New file: **`character.js`**. Owns character creation (name, skin tone, hair
style/color, kit color) and renders a reactive SVG portrait — purely
cosmetic, it never touches `game-logic.js` or the underlying stats.

- `CharacterModule.getCustomization()` — current appearance choices
- `CharacterModule.renderPortraitSVG(mood)` — returns an SVG string; `mood`
  is a plain object (`{tired, stressed, happy, hurt}`) that the caller
  (`app.js`) derives from live game state, so the portrait's expression
  changes with energy/stress/morale/injury risk without this module
  knowing anything about how those numbers are calculated
- `CharacterModule.renderCustomizeHTML()` / `wireCustomizeControls()` —
  the character-creation screen shown before the season starts

There's now a `customize` screen before the season preview, and the
portrait appears in the sidebar throughout the game and on the season
summary — reacting to your actual stats, not just static art.

This is a flat SVG art style (shapes composited by code), not literal
pixel art or an animated walking sprite — see the chat for why a full
Kairosoft-style isometric facility was intentionally scoped out for this
game's loop. If you want to go further, `hairPath()` / `eyePair()` /
`mouth()` / `extras()` in `character.js` are the functions to extend with
more styles or expressions.

## What's still a placeholder

- Effect sizes are grounded in general sports-science findings (cited in
  comments above the decision pools in `game-logic.js`) but aren't tuned
  against your specific dataset yet — treat them as a reasonable starting
  point, not final numbers.
- No save/load — a season resets on page refresh.
- No GM/roster layer from your later notes — this is just the single-athlete
  weekly loop.
