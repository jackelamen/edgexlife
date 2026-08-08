# Goals Module — UX/UI Critique

Run against `src/pages/GoalsPage.jsx` (1,270 lines, 6 views), `src/lib/goals.js`, `src/lib/design.js`, using the `satori` critique protocols and the app's own stated design rules. 2026-08-08.

---

## Verdict up front

The Goals module isn't badly designed. It's **under-designed relative to the system it lives in** — it opts out of the v3 design system in the exact places that system does its work, and it never decides what the module is *for* on any given screen.

One finding explains most of the "bland" feeling, and it isn't a taste call:

> **Goals uses the degraded fallback variant of almost every component in the design system.**

`design.js` defines two rules that carry the whole visual language — *hue = identity* and *fill = quantity*. Health participates: its tiles take a `metricKey` (permanent hue) and a `pct` (literal fill height), so a Health screen is a wall of colour-coded, partially-filled bento tiles that encode real numbers. Goals calls the same component with neither:

```jsx
// GoalsPage.jsx:129-132
<StatCard label="Streak"       value={streak} sub="consecutive days" />
<StatCard label="Active goals" value={active.length} />
<StatCard label="Live cycles"  value={live.length} />
<StatCard label="Open tasks"   value={...} sub="in Pulse" />
```

Four grey boxes. `StatCard` degrades to a plain figure card when `metricKey`/`pct` are omitted — which was the correct call for genuinely unmeasured counts, but here it's applied to *everything*, including Streak, which has an obvious target and an obvious hue. The module looks blander than Health because it is literally rendering the un-styled fallback path of the shared kit.

Same pattern repeats: `Ring` appears once (cycle exec score) with no breakdown; there is no `MetricLegend`, no `StatusDots`, no `CoachCard` anywhere in 1,270 lines. Health has all four.

---

## 1. Hierarchy — the eye is never told where to look

### 1.1 The First Stop is spent on navigation

```jsx
// GoalsPage.jsx:54-64
<PageHeader kicker="Goals" title={VIEWS.find(v => v.value === view)?.label} ... />
<Tabs value={view} onChange={setView} options={VIEWS} />
```

The largest, highest-contrast text on the page is the word **"Today"** — the label of the tab the user just clicked, rendered immediately above a tab bar where that same word is already highlighted. Satori's Three Flow Rule: the Hook should be the payoff, the thing worth walking across the room for. Here it's a redundant echo of navigation state.

The `sub` prop compounds it: *"Vision, cycles, and the promises that deserve a plan."* is hardcoded and identical on all six views. It's a brand line pretending to be a subtitle — it tells you nothing about the screen you're on, and it's the second-largest text on every screen.

**Fix direction:** kill the view-name title. Let the hero carry the hook. If the header stays, its title should be the *state* ("2 of 5 actions today"), and `sub` should change per view or go away.

### 1.2 The same number is shown twice, 20px apart, at two different weights

```jsx
// hero (line 121-123)
{streak > 0 && <span className="badge badge-orange">🔥 {streak} day streak</span>}
<span className="badge badge-green">{live.length} live cycles</span>
<span className="badge badge-blue">{active.length} active goals</span>

// stat strip immediately below (line 129-131)
<StatCard label="Streak"       value={streak} />
<StatCard label="Live cycles"  value={live.length} />
<StatCard label="Active goals" value={active.length} />
```

Three of the four stat cards are verbatim repeats of the three hero badges. When the same fact appears at two weights, the viewer can't infer which weight means "important" — the hierarchy signal is destroyed by the duplication itself, not by either element being wrong. This is also why the screen reads as busy-but-empty: a lot of surface area, three facts.

**Fix direction:** the hero owns the narrative line and the streak. The strip either becomes real metric tiles with hue + fill (see 1.4) or it goes.

### 1.3 The module's most important number is plain text

The single sentence that matters most in this whole module is:

```jsx
`${todayTotals.done} of ${todayTotals.total} actions done today.`   // line 117
```

It's rendered as a string. No ring, no bar, no fill. Meanwhile the exec-score Ring — a weekly aggregate you'd look at once every few days — gets the only piece of real dataviz on the screen. The daily number, checked many times a day, gets none. Rule 2 of your own system (*fill = quantity*) applies here more cleanly than almost anywhere else in the app: `done/total` is a literal percentage.

### 1.4 Every cycle card is identical weight regardless of state

`CycleCard` renders the same on Today whether it has 5 actions outstanding today or zero. You already solved this exact problem in the workout `ProgressTab` (2026-08-08: `featured = sortedActive[0]`, tinted card, 104px ring, 44px number) — the finding never got applied here. On Today, the cycle with work outstanding should be visually dominant; done/idle cycles should collapse to a quiet row.

### 1.5 Colour contradicts itself on the same card

```jsx
// GoalCard, line 459-462
<div className={`goal-card ${goal.area}`} style={{ borderLeftColor: areaColor(goal.area) }}>
  <Badge tone="blue">{areaLabel(goal.area)}</Badge>
```

The border-left says *pine* (health area). The badge sitting 8px away says the same word in *blue*. Two different colours encoding one identical fact — a direct violation of hue = identity, and it makes the area-colour system feel decorative rather than meaningful. `VisionsView` (line 1097) is worse: `<Badge tone="green">` for **every** life area, so all four vision cards look like one category.

**Fix direction:** area badges take `areaColor(area)`, not a generic tone. Then delete one of the two signals — border-left *or* badge, not both.

### 1.6 Six equal-weight tabs for six unequal jobs

Today is daily. Goals is weekly. Cycles is weekly-ish. Roadmap, Visions, Retros are monthly-to-quarterly. The `Tabs` component presents all six as peers, which means every visit costs a scan of six options to find the one you open 80% of the time. This is a real part of the "hard to understand" feeling — nothing in the UI encodes rhythm.

---

## 2. The Cycle system is opaque

This is the most fixable of the three, because the system is genuinely good and the UI just doesn't explain it.

### 2.1 Four names for two concepts

| Thing | Called |
|---|---|
| `sprints` table | "Cycle", "Focus Cycle", "New Focus Cycle", "12-week Focus Cycle" |
| `sprint_tactics` | "tactics" (code/props), "actions" (Today hero, Empty state), "Weekly Actions" (editor label), "Add action" (button) |

Nowhere in the UI is the model stated once: *a goal gets a cycle; a cycle has three phases; a phase has actions; actions produce checkpoints; checkpoints produce an execution score.* Six screens assume you already hold that chain in your head. Pick one word per concept and use only that word.

### 2.2 The week-dot row is three different components wearing one costume

```jsx
// TacticRow, lines 299-322 — same .wk-dot class, four semantics:
daily     → 7 dots labelled M T W T F S S        (day of week)
custom    → N dots labelled by day letter         (day of week, possibly swapped)
xperweek  → N dots labelled 1 2 3                 (slot index — NOT a day)
weekly    → 1 dot with a check icon               (binary)
```

A row of `1 2 3` and a row of `M T W` are visually identical widgets meaning completely different things, with no label, legend, or header row explaining either. And `M T W T F S S` has two `T`s and two `S`s — ambiguous on its own, which is why every calendar UI in existence uses `Tu`/`Th`. This is the single densest point of confusion in the module.

**Fix direction:** a persistent day-letter header above the daily/custom rows; visually distinct treatment for xperweek (a segmented count meter reads better than fake day-dots); two-letter day labels.

### 2.3 The execution score is never explained

`<Ring score={score} size={72} sub={"wk 5"} />` shows a number in a red/amber/green ramp. Nothing anywhere states what it measures (checkpoints hit ÷ checkpoints possible, this week), what "good" is, or why it moved. Health solved this exact problem with `ScoreBreakdown` + the generated `DesignLegend` in Settings. Goals has no equivalent — the number just appears and judges you. That's a large part of "feels like a chore": you're being graded by something that won't explain itself.

### 2.4 Today hides the one thing Today is for

```jsx
const [open, setOpen] = useState(!compact)   // line 163 — compact ⇒ collapsed
```

On the Today view, cycle cards render **collapsed**. So the hero announces "2 of 5 actions done today" and then the five actions are behind a click. The daily-driver screen defaults to hiding the daily driver. On Today, actions due today should be the default-open content, and the week grid / streak chart the thing behind the toggle — the current arrangement is exactly inverted.

### 2.5 Week navigation gives no sense of place

Week movement is `‹ Week 5 of 12 ›`. There's no strip, no phase boundaries, no visual of where week 5 sits. You can't see that you're two weeks from "Peak", you can't see which weeks were strong, and moving weeks feels like paging through a database rather than walking a timeline. The `StreakChart` already has all 12 weeks of data — it's rendered *below*, and only when the card isn't compact.

### 2.6 A genuinely good feature is invisible

Day-swaps — real backend work, a real problem solved — are reached by a 12px `swap_horiz` icon button nested inside an 11px grey meta line. Discoverability is effectively zero; you'd only find it if you already knew it existed.

---

## 3. Entry friction

### 3.1 The primary CTA of the empty state is a dead button

```jsx
// TodayView, line 140
<button className="btn btn-primary btn-sm" onClick={() => {}}>Start a Cycle</button>
```

A brand-new user with no cycles sees exactly one call to action, and it **does nothing**. This is a bug, not a design opinion, and it's the highest-severity item in this document.

### 3.2 You can't create a cycle without a goal, and nothing tells you that

`CycleEditor`'s save is disabled without `goal_id`; the select renders `<option value="">Choose a goal…</option>` over an empty list. New Cycle from a fresh account is a dead end with no explanation and no inline "create a goal first". The ordering constraint is real and correct — it just isn't communicated or shortcut.

### 3.3 A new goal lands nowhere

`GoalEditor` is a well-judged 3-field form (title / area+status / why). Then the goal appears as a card in a list and *nothing happens*. There is no next step, no prompt to give it a cycle, no empty-state on the card saying "no cycle yet — start one". The goal→cycle gap is precisely where the system stops feeling alive, and it's currently unbridged in the UI.

### 3.4 "Quick" mode is still six decisions, two of them essays

Quick setup asks for: cycle **name**, goal, start date, *"What does success look like at week 12?"*, action text, frequency. Two of those are open writing prompts — the highest-friction input type there is — and one (name) is pure bookkeeping that could be derived (`"12 weeks · Run 3×/week"`). A genuine quick path is: pick a goal → type one action → pick a frequency. Three inputs, zero prose. Everything else can be defaulted and edited later.

### 3.5 Metric logging is better than it was, but the setup isn't

`MetricEditor` takes `target` as a bare free-text input with no unit, while `type` offers Currency and Percentage. So "10000" for a Currency metric renders as `target 10000` with no symbol, and the progress bar has no unit either. Small, but it's the difference between a tracker and an instrument.

### 3.6 Vision editing reads from the DOM and loses work

```jsx
// VisionsView, lines 1106-1111
<textarea defaultValue={v?.content || ''} id={`vision-${area}`} ... />
const val = document.getElementById(`vision-${area}`).value
```

Uncontrolled, read by `getElementById`, no draft persistence — clicking Cancel or navigating away silently discards everything typed. Visions are the longest-form writing in the module and have the least-protected input.

---

## Bugs and code-health items found along the way

| Severity | Item |
|---|---|
| **High** | `TodayView` line 140 — empty-state "Start a Cycle" button has `onClick={() => {}}`. |
| Medium | `CycleEditor` line 819 — `useMemo` used as an effect (calls `setPhaseDrafts` during render). Works today; it's a React anti-pattern that will bite under StrictMode/concurrent rendering. Should be `useEffect`. |
| Medium | `VisionsView` — uncontrolled textarea read via `document.getElementById`; unsaved text is silently lost. |
| Low | `PageHeader` `sub` is hardcoded across all six views. |
| Low | `Badge tone="green"` for all four life areas in `VisionsView`; `tone="blue"` for all areas in `GoalCard`. |
| Low | `.prog-track` / `.prog-fill` classes used by the (currently hidden) Savings panel don't exist in `index.css` — pre-existing, noted in project history, still unfixed. |

---

## If I were prioritising

Ordered by impact-per-unit-of-work, not by section order above:

1. **Fix the dead button** (3.1). Minutes.
2. **Put Goals back inside the design system** (the verdict, 1.4, 1.5) — give StatCards real `metricKey`/`pct`, make area badges use `areaColor`, feature the cycle that needs attention. This is what closes most of the "bland" gap and it's mostly parameter-passing, not redesign.
3. **Invert the Today card** (2.4) and give `done/total` a real fill (1.3). Today stops hiding its own purpose.
4. **Explain the cycle model once, well** (2.1, 2.2, 2.3) — one vocabulary, a labelled day-header, and a score breakdown. This is the "opaque" complaint almost entirely.
5. **Bridge goal → cycle** (3.2, 3.3) and cut Quick mode to three inputs (3.4).
6. **Rethink the six tabs** (1.6) — the deepest change, and the one worth a preview before any code.

Items 1–5 are all inside the existing structure. Only item 6 is an actual redesign.
