# Agent Note: Reserved room is an element, not a length

Status: implemented

English | [中文](2026-08-19-reserved-room-runs.zh.md)

## Problem

Two surfaces in `ui-keybindings` had grown the same layout by hand, each with its own hardcoded widths. A column heading reserves space for a sort mark so that sorting a column does not move its label; a recorder strip reserves space at its end for the confirm and cancel controls, which float over the strip and must never cover the last of the strokes. Both were built out of custom properties naming pixel counts — `--dsh-sort-mark`, `--dsh-heading-gap`, `--dsh-sort-slot`, `--dsh-recorder-control` — plus `::before`/`::after` spacers sized from them.

Every one of those numbers is a lie waiting to happen. They restate a width that the browser already knows and that changes with font, locale, zoom and the mark's own content: a sort mark that grows a rank digit needs more room than the constant says, and nothing reports the mismatch. The recorder's rule was worse than a constant, because it is conditional — the strip moves its content to avoid scrolling where moving is enough, and scrolls where it is not — and the two surfaces state the same reservation in different shapes, so a fix to one does not reach the other.

## Decision

A run states its reserved room as an *element*: the caller passes `reserve`, the widest form that end can ever hold, and the run renders it hidden in the same grid cell the `occupant` lands in. The engine measures it. No rule in `Run.module.css` carries a length, and no code measures anything — there is no `ResizeObserver`, no layout read, and no state beyond what React already holds, because the geometry with the occupant present is identical to the geometry with only the reserve in the cell.

`FittedRun` lays out three tracks: a leading flank, the content, and the reserved end. The flanks are `fr` coefficients and the other two floor at intrinsic minimums, which is what fixes the order in which space is given up. A run under pressure spends its flanks first — centring is the first casualty — and once they are gone it overflows its cell rather than clipping the content or surrendering the room. That order is the entire policy, and it holds in every `justify` mode because no coefficient reaches a track's minimum.

`ScrollingRun` renders the reserve twice, as collapsible slack ahead of the content and as fixed room behind it, inside a scroller that shrink-wraps while its content fits and fills its box once it does not. Its template is the fitted one stated the other way around: the content and room tracks floor at their own `max-content`, so the slack is the only track free space can reach. That single fact produces the whole move-before-scroll rule. While there is spare room the slack takes it and the content sits centred; as the spare runs out the slack gives it back and the content drifts toward the start; once the slack is gone the run scrolls — and the leeway it moved by, before conceding the scroll, is exactly the reserve's width, a value nobody chose and nobody has to maintain.

Grid rather than flex, for a property flex does not have. A `1fr` track is `minmax(auto, 1fr)`, so a track's minimum and its share of the free space are independent quantities. A flex item's base size feeds its container's `min-content`, so slack expressed as a flex item is charged to the floor: centring would cost a second reservation, and the run would refuse to be narrow.

## Measured behaviour

Measured in Chrome 150 against a probe page carrying the shipped stylesheet, with a 320px box and a 48px reserve. The absolute numbers are font-dependent; the relations are not.

| Case | content | slack / content / room | scrollable | at full scroll |
| --- | --- | --- | --- | --- |
| fits | 66.56 | 48 / 66.56 / 48 | 0 | — |
| near | 207.69 | 48 / 207.69 / 48 | 0 | — |
| move | 242.97 | **29.03** / 242.97 / 48 | 0 | — |
| edge | 278.25 | 0 / 278.25 / 48 | 6 | content ends at the control's edge |
| over | 436.19 | 0 / 436.19 / 48 | 164 | content ends at the control's edge |

The `move` row is the rule working: the slack has given up 18.97 of its 48 so that the content still fits, and `scrollable` is 0. The last two rows are the room doubling as overscroll — at maximum scroll the content's trailing edge lands within a quarter-pixel of the floating control's leading edge, in both writing directions (RTL scrolls to −164 and measures the same).

For the fitted run, the floor is `0 / 45.38 / 48` and is byte-identical with and without an occupant, which is the invariance the whole design exists for. A 320px box gives `137.31 / 45.38 / 137.31`, also identical occupied. A 120px box gives `26.63 / 45.38 / 48` — flanks partly spent, room intact. A 60px box, narrower than content plus room, gives `0 / 45.38 / 48` with the content unclipped and the run overflowing instead. `justify="end"` moves all the slack to the leading flank, `justify="start"` to the trailing one, and `justify="stretch"` gives it to the content (`0 / 272 / 48`).

Five declarations that looked load-bearing are not, and were removed after the probe showed the full 19-case matrix unchanged without them: `min-width: 0` on the content, on the scroller, and on the scroller's placing box, and both `min-width: 0` and `overflow: hidden` on the slack. Each template states an explicit track minimum, so an item's automatic minimum is never consulted; the collapsed slack overflows toward the inline start, which no scroll reaches and no `scrollWidth` counts. The one `min-width: 0` that is load-bearing is on the fitted run itself — without it a run in a `1fr` cell carries the sum of its tracks in as an automatic minimum, and a column refuses to be dragged shut.

## Alternatives considered

- **`anchor-size()` to derive the reservation from the occupant**: rejected on evidence. `CSS.supports('width', 'calc(anchor-size(--x inline) / 2)')` returns true in both Chrome and Librewolf, which makes it look available; a probe matrix over querier and anchor positioning shows it resolves only when the *querier* is absolutely positioned (`absQ_absA` 20, `absQ_staticA` 20, every `staticQ_*` 0, and `position-anchor` does not help). An in-flow track cannot be sized from it, so the feature detection is a trap: it reports support for a syntax that silently yields zero in the case we need.
- **Measure with `ResizeObserver` and write a custom property**: rejected — it reintroduces the mutable state the CSS approach removes, runs a frame behind the layout it describes, and makes the reservation an effect rather than a fact. It also cannot express the conditional part: the move-before-scroll leeway would become an explicit number again.
- **Keep the pixel constants and add a gate**: rejected — no gate can check a constant against a font it does not render. The mismatch is only visible in a browser, which is exactly where the constant is wrong.
- **Flexbox with a spacer of `flex: 1`**: rejected on the property above — the spacer's base size joins the container's `min-content`, so the run's floor grows by the slack it is supposed to be able to give up.
- **One component with a `scrolling` flag**: rejected — the two differ in their track template, in where the reserve is rendered, in whether the box shrink-wraps, and in which `justify` modes are meaningful. A flag would name a union of two layouts, and `stretch` would be spellable on the one that cannot honour it.

## Consequences

The reservation now follows its own content: give a heading a mark carrying a rank and the room fits a ranked mark, with nothing to update. Both surfaces get the same behaviour from one place, and `ui-keybindings` loses four custom properties and its spacer pseudo-elements when it migrates onto these.

The cost is a contract the caller must keep and nothing checks: `reserve` must genuinely be the widest form the end can hold. An occupant wider than its own reserve grows the reserved track, which is the one thing that can make a run move when an occupant arrives — the exact failure the design otherwise rules out. It is stated as a limitation in the package README rather than detected, because detecting it would require the measurement this design removes.

The suite pins markup only. jsdom resolves no layout, so the law itself — the floors, the spending order, the overscroll — is verified in a browser and recorded in the table above; a regression in the track templates would pass the unit tests. That is a deliberate split, not a gap to close with a headless layout engine: the claims are about what a real engine does with intrinsic sizing.
