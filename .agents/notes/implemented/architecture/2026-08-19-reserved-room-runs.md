# Agent Note: Reserved room is an element, not a length

Status: implemented

English | [中文](2026-08-19-reserved-room-runs.zh.md)

## Problem

Two surfaces in `ui-keybindings` had grown the same layout by hand, each with its own hardcoded widths. A column heading reserves space for a sort mark so that sorting a column does not move its label; a recorder strip reserves space at its end for the confirm and cancel controls, which float over the strip and must never cover the last of the strokes. Both were built out of custom properties naming pixel counts — `--dsh-sort-mark`, `--dsh-heading-gap`, `--dsh-sort-slot`, `--dsh-recorder-control` — plus `::before`/`::after` spacers sized from them.

Every one of those numbers is a lie waiting to happen. They restate a width that the browser already knows and that changes with font, locale, zoom and the mark's own content: a sort mark that grows a rank digit needs more room than the constant says, and nothing reports the mismatch. The heading's rule was worse than a constant, because it was conditional — it reserved `calc(--dsh-sort-slot / 2)` on each flank while unsorted and gathered the whole slot at the end when sorted — and the two surfaces stated the same reservation in different shapes, so a fix to one did not reach the other.

## Decision

A run states its reserved room as an *element*: the caller passes `reserve`, the widest form that end can ever hold, and the run renders it hidden. The engine measures it. No rule in `Run.module.css` carries a length, and no code measures anything — there is no `ResizeObserver`, no layout read, and no state beyond what React already holds.

A run reserves at **either end**, and each end is a `RunRoom`: `reserve`, the `occupant` standing there now, and `occupied` for a room taken by something the run does not hold. The record rather than three flat props, because `reserve` is required in it and an `occupant` without one is then unspellable — that combination named a room measured from whoever was in it, which moves the moment they do, and is precisely the state the two planes exist to prevent.

Reserving at both ends is what centres content against an occupant at one of them, and it is composition rather than a mode: each room stands inside its own flank, the flank floors at what it holds, and two rooms of the same shape floor equally. Nothing new computes that.

What a run asks for is **stated, never read off what it shows**. `exemplar` extends to the content the treatment the room already had: what it measures as, where it cannot measure itself. A control cannot, because it reports an intrinsic width of its own — a number input's comes from its `size` attribute rather than from its value — and neither can a value that varies. Every exemplar is therefore either stated or defaults to something inert, which yields the invariant the whole design was reaching for: a run whose exemplars do not change cannot change width, whatever happens inside it.

A fitted run is **two planes**, because one element cannot both settle what the run asks for and settle where things sit.

The **size plane** is the run itself: hidden exemplars in three `max-content` tracks — a stand-in for the content between one reserve per end. They are the only things in flow, so the run asks for the content plus its rooms, always. An occupant is not an input to that ask, because it is not in the plane at all. This is stronger than measuring the occupied and unoccupied states and finding them equal: there is one state.

The **paint plane** is an overlay (`position: absolute; inset: 0`) laid out at the width the size plane won. It carries the content the reader sees and each held room, and it may place them however the alignment asks, because nothing it does can reach back into the sizing. Whether a room is held is the only state a run has: `occupant` is what stands in it, and `occupied` says it is taken by something the run does not hold — a control floating over that end, which cannot nest inside the content it floats over, so the run makes way for it without holding it. A room nobody is in stays out of this plane entirely, since a flank holding one would floor against a width the content is free to use. With every room free, the content honours the alignment across the whole run. With one held, the plane becomes a flank, the content, and a flank, each flank flooring at the room it holds. The content then sits at

$$\min\!\left(s,\ \frac{R + s}{2}\right)\quad\text{where } s = W - L - R$$

which is one formula rather than a list of cases: centred wherever there is room to be centred, pushed off centre by exactly what the mark needs, and not moved at all once the slack reaches the room's width.

### Why two planes are necessary

In a grid, two items' intrinsic contributions add only where their track spans are disjoint. Suppose the run's ask is exactly `L + R` and that the content and the reserve are what supply it. Their spans are then disjoint intervals tiling `[0, L + R]` of lengths at least `L` and at least `R`, so equality forces the content's span to be `[0, L]` or `[R, L + R]`. A centred content needs its span to start at `R/2`, which is neither. So with the content in flow and the ask supplied by the content and the reserve together, centring at the floor is impossible — no distribution mode, `fit-content`, subgrid or writing-mode arrangement escapes it, because they all move track edges and none of them changes that additivity requires disjointness.

The obstruction binds the *content*, not the *ask*. Overlap is a painting fact and disjointness a sizing fact, so the way out is to stop asking one element to do both jobs: take the visible content out of flow, and let a hidden ghost of it supply `L`. The ghost is therefore the reserve's exact mirror — the reserve states the room's width, the ghost states the content's — and it is necessary rather than a trick.

`max-content` on both size-plane tracks, not `auto`: `auto` as a minimum is the *automatic* minimum, which any item with `overflow` other than `visible` gives up, and a caller whose content ellipsises says exactly that. The run would then ask for the room alone, and a column could be dragged past its own heading. Measured: with `auto auto`, a `width: min-content` wrapper gave 32 where `L + R` is 70.89 — and the table takes each column's drag floor by setting exactly `width: min-content` on the heading cell.

## Measured behaviour

Measured in Chrome 150 against the real page. Column widths were byte-identical through unsorted, one sort, two sorts ranked, and back — `216.906 / 140.344 / 261.016 / 71.1719 / 76.5625` — so no state change moves a column. The offsets are the label's centre against its cell's centre:

| column | slack over its floor | unsorted | sorted | ranked |
| --- | --- | --- | --- | --- |
| Priority | 0 | 0 | −16.7 | −16.7 |
| Source | 8.39 | 0 | −13.2 | −13.2 |
| Keybinding | ample | 0 | 0 | 0 |
| When clause | ample | 0 | 0 | 0 |

Priority sits exactly at its floor, so its mark takes all the room it needs; Source has 8.39 to spare and moves by less; the wide columns do not move at all. That is the formula above, read off the page.

Against a probe page carrying the shipped stylesheet, with `L = 38.89` and `R = 32`, the run's width was identical across unoccupied, occupant-narrower-than-reserve, and occupant-equal-to-reserve at every wrapper width — including `min-content` and `max-content`, both of which gave 70.89 = `L + R`. The content's centre offset:

| run width | unoccupied | occupied |
| --- | --- | --- |
| `min-content` / `max-content` (70.89) | 0 | −16 = −R/2 |
| 71.17 (floor) | −0.01 | −15.87 |
| 87.87 (floor + R/2) | 0 | −7.52 |
| 104.56 (floor + R) | 0 | **0** |
| 137.95, 300 | −0.01 | −0.01 |
| 55 (below the floor) | −0.01, unclipped | −8.05, unclipped |

`justify` of `start`, `end` and `stretch` were verified in both states: `start` holds the content flush at the start throughout; `end` holds it flush at the end while unoccupied and against the room when occupied; `stretch` spans the run unoccupied and the run less the room when occupied.

The scrolling run was measured on the same page, on a recorder strip 122.34 wide holding chips 76.70 wide, with a room of 25. Idle, its flanks were 22.81 and 22.83 and the chips sat 0.01 off centre; with the control drawn they became 20.64 and 25 and the chips moved 2.18, leaving 11 clear of the control; with the control gone they returned. The table's columns read `216.906 / 140.344 / 261.016 / 71.1719 / 76.5625` throughout. Narrowed to force a scroll, the tracks were `0 / 76.70 / 25` with 50 of scroll, and at the end of that scroll the last chip stood 11.3 clear of the control.

## Alternatives considered

- **`anchor-size()` to derive the reservation from the occupant**: rejected on evidence. `CSS.supports('width', 'calc(anchor-size(--x inline) / 2)')` returns true in both Chrome and Librewolf, which makes it look available; a probe matrix over querier and anchor positioning shows it resolves only when the *querier* is absolutely positioned (`absQ_absA` 20, `absQ_staticA` 20, every `staticQ_*` 0, and `position-anchor` does not help). An absolutely positioned box takes no flow space, so it can never be the spacer that pushes content.
- **Measure with `ResizeObserver` and write a custom property**: rejected — it reintroduces the mutable state the CSS approach removes, runs a frame behind the layout it describes, and makes the reservation an effect rather than a fact.
- **Reserve the room only where a mark is drawn**: rejected — it is the thriftier-looking rule and is not one. A column already at its floor has nowhere to find the mark's room, so it takes it from its neighbours the moment it is sorted, which is the column movement the reservation exists to prevent.
- **Keep the pixel constants and add a gate**: rejected — no gate can check a constant against a font it does not render. The mismatch is only visible in a browser, which is exactly where the constant is wrong.
- **Flexbox with a spacer of `flex: 1`**: rejected — the spacer's base size joins the container's `min-content`, so the run's floor grows by the slack it is supposed to be able to give up.
- **Reserve symmetrically, a hidden copy in each flank**: rejected *as the heading's arrangement*, and since offered as a choice any run can make. It centres at every width, and the floor becomes `L + 2R` — the Priority heading's 71.17 would become 104.56, taken from the wider columns, which is why a heading reserves at its end alone. The cost is only prohibitive where the run drives a column's floor. A field standing *inside* a column does not; its heading already fixed that floor, so it can reserve at both ends and buy the centring. That is the same measurement supporting opposite decisions at two altitudes, not a reversal.
- **Default a room's `reserve` to its `occupant`**, so an always-present occupant needs no separate exemplar: rejected. Occupants are usually controls and reserves must be inert, so the default would silently mount a second, hidden copy of a control at exactly the sites that look tidiest. Requiring `reserve` costs a line and makes the duplication impossible instead.
- **Let `justify="stretch"` imply no content exemplar**, since stretched content takes what it is given rather than asking: rejected, and it needs no new prop, which is what made it tempting. An alignment keyword deciding what the run asks for is the fusion of the two planes that this whole design exists to prevent.
- **One plane, with the reserve's minimum zeroed and the floor restored by `min-width: max-content`**: measured to centre perfectly, and measured to double the floor to `L + 2R` anyway, because a grid's intrinsic size equalises `1fr` tracks to the largest one's contribution, inflating the empty leading flank to the reserve.
- **One plane with `auto` flanks and `justify-content: center`, to avoid that equalisation**: the max-content is then correctly `L + R`, but at that width the free space is consumed by the trailing `auto` track growing to its own max-content, so the content is flush at the start again. Capping that track at `0` stops it eating the space and also stops it contributing, so the floor collapses to `L`.
- **The reserve inline inside the content wrapper**, so the content track's min-content is `L + R`: the floor is right with no equalisation, and the content sits at the start of that wrapper — the same drift, relocated.
- **Keep the content in flow, span it across all tracks, and let a ghost hold the leading flank**: centres perfectly while unoccupied and leaves the occupied state untouched, but the occupied template's `1fr` flanks make the run's max-content `L + 2R`, so a max-content-driven consumer — a `width: max-content` wrapper, an auto-layout table — would fatten the column by a whole room on sort. Measured 104.52 against 71.14.

## Consequences

The reservation now follows its own content: give a heading a mark carrying a rank and the room fits a ranked mark, with nothing to update. Both surfaces get the same behaviour from one place, and `ui-keybindings` loses four custom properties and its spacer pseudo-elements as it migrates onto these.

A number field composes both halves: the arrows' shape reserved at each end and occupied at the trailing one, with the widest value it can hold as the content's exemplar. The value then sits on the field's centre with no length stated anywhere, and the arrows' own paint — the gap before them, their hit padding — becomes a free choice, because whatever it measures is measured on both sides.

Three costs, all of them contracts the caller keeps and nothing checks. An exemplar must be inert: a run renders one only to measure it, so a control passed as a `reserve` is a second control, hidden and unreachable and still mounted. It must also be the largest form its region can hold, since an occupant larger than its reserve overflows the room rather than growing it. And a fitted run given no `exemplar` renders its content twice, so that content must measure the same both times: a phrase rather than a subtree carrying `id`s, and one whose wrapping does not depend on which copy it is. A scrolling run pays none of this and takes no `exemplar`, its ask being the rooms alone — which is also why the recorder's strip of chips, a subtree rather than a phrase, is a scrolling run and not a fitted one. Separately, the run claims `position: relative` on itself and `position: absolute; inset: 0` on its overlay — layout plumbing on elements the run owns, which paints nothing and states no length, but which is more than the "tracks and areas only" the primitive started with.

The suite pins markup only. jsdom resolves no layout, so the law itself is verified in a browser and recorded in the tables above; a regression in the track templates would pass the unit tests. That is a deliberate split rather than a gap to close with a headless layout engine: the claims are about what a real engine does with intrinsic sizing.

`ScrollingRun` splits the same two jobs, but stacks its planes rather than layering them: a scroller has to stay in flow to give the run its height and its content its natural line. Its box asks for the room and nothing else, which is the honest ask for a scroller — its whole answer to content it cannot fit is to scroll, so a ghost of that content would hand every column the width of the longest thing anyone ever put in it. The hidden reserve stands in the box's one cell and is where the ask comes from in both states; the scroller beside it asks for nothing, its own overflow having given up its automatic minimum.

Inside the scroller the room is present only while it is taken, and that is what lets the flanks stay equal while it is free. It is also the one place where the two runs genuinely differ in behaviour rather than in construction: the room takes the scrollable range with it. The range grows when the room arrives, and shrinks when it leaves — and a shrinking range makes the engine clamp any offset past its new end, which discards the reader's position before any code of ours could read it. That loss happens on the way out, not the way back, which is what makes it easy to misdiagnose.

The recorder therefore writes the offset down while the room is there and gives it back when the room returns, restoring only a strip still sitting exactly where the clamp put it. Measured on a strip narrowed to force a scroll: parked at 42 of a 50 range with the control's tail gap at 3.3; unhovered, the range fell to 25 and the engine moved the offset to 25 with it; re-hovered, the offset returned to 42 and the chips to the pixel they had occupied. A strip moved to 5 while the control was away stayed at 5. Following the end instead would also have cleared the control, and was rejected: the leeway exists to stop the strip moving, so a jump of a full room inside it defeats what it is for.

A planned 2D run transfers from the fitted side: the size plane becomes a 3×3 of hidden exemplars, contributions add per axis by the same disjointness, and the overlay runs the same per-axis templates with an independent switch per reserved edge.
