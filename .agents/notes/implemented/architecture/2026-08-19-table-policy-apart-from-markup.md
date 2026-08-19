# Agent Note: Ordering and resizing a table are policy, not markup

Status: implemented

English | [中文](2026-08-19-table-policy-apart-from-markup.zh.md)

## Problem

The keybindings settings page grew a sortable, resizable table by hand, and every part of it lived in `ui-keybindings`: the sort state machine, the row ordering, the sash arithmetic, the tracks, the lanes, the row groups, and the bands that add and remove a binding. None of that is about keybindings. A second table anywhere in the client would have to grow the same parts again, and the two would drift — the first sign of which is already visible in this one, where the same reservation was stated in two different shapes on two surfaces.

The parts differ in kind, though, and lumping them together is what makes a table hard to reuse. Deciding which rows come first is arithmetic over values. Deciding what a column may not be dragged below is a measurement of a page. Deciding where a band hangs is markup. Only the first has no dependency on a browser at all, and it is the part a consumer is most likely to want to state differently.

## Decision

The arithmetic moves to `ui-primitives` as two modules with no React and no DOM, generic over the row type, and the domain stays behind.

`table-order` holds the sort state machine and the ordering. A column does not carry a comparison; it declares which kind of value it holds through an `Ordering<T>`, and the kind carries both the comparison and the direction a first click takes. `orderedBy` binds where a column reads its value to how that value orders, consuming `T` so that a table's columns stay one homogeneous `TableColumn<Row>[]` rather than a family of shapes no array can hold. A consumer's own column type extends `TableColumn<Row>` with whatever draws a heading, which the ordering has no business knowing: `ui-keybindings`' `SortableColumn` adds a dictionary key and nothing else, and its `sortable()` is now one spread over `orderedBy`.

What stays in `ui-keybindings` is what only that domain can state — that a gesture orders by the key it ends on so every binding on one key gathers whatever modifiers it holds, that a source orders by precedence rather than alphabet, that a place in an order counts from the binding that wins and a superseded binding holds no place. Those were never generic and are not the parts a second table would want.

`table-resize` holds `resizeWidths` unchanged. It already took the floors as data rather than measuring anything, and its own documentation already said why: what a column may not be dragged below is a measurement of that column's content, not a property of the arithmetic.

That last point is where the geometry picks the policy up. "A column may not be dragged below its heading" is this table's choice and not a general rule — its rows deliberately do not count, because their fields clip and their gestures scroll, so a long clause must not hold a column open for content that has somewhere else to go. A table whose rows are the whole point wants the opposite.

`Table` therefore takes a `floorOf`, asked once when a boundary is taken hold of so that it may measure, defaulting to what the column's cells measure at their narrowest — a column showing its content, which is the unsurprising rule to depart from knowingly rather than the thrifty one to arrive at by accident. `minContentWidth` is exported so a policy is one line.

Letting the cells state it instead was measured and rejected. A track of `minmax(auto, Xfr)` floors at automatic minimums, which any cell gives up by clipping or scrolling, so "the rows do not count" would have been stated by the rows and the table would have needed no option at all. It does not work here: this table's *headings* clip too, deliberately, so that a column dragged under its label ellipsises rather than refusing to narrow and breaking the pair's conservation. Measured against the real columns, `minmax(min-content, Xfr)` floors at `316.42 / 14 / 313.30 / 14 / 40.28` and `minmax(auto, Xfr)` at `0 / 14 / 0 / 14 / 0` — every column including its heading. The same probe surfaced that there are two floors and not one: the tracks floor at min-content so a pane too narrow scrolls rather than clipping, while a drag floors at the policy, which may be thriftier. They answer different questions and the table carries both.

### The styling contract

A layout component's hardest question is not what it draws but what a consumer may change without breaking it, and the answer here is two registers. What the table **reads back** is data and arrives as props — the columns, each share, the floor policy — because a drag converts a share to pixels and a share only the painter knew would be a number the table converts without having seen. What the table **never reads** is presentation and stays in CSS, reached through a class per part and through the state each part publishes as a `data-` attribute.

Between them sit the lengths the table must know but has no opinion about: the lane's width and the gap between rows. Those are registered custom properties, so a value that is not a length falls back to the declared initial rather than failing at computed-value time and taking the track template with it, and so the table works with nothing configured. Each lane also reads an indexed override before the shared width — `var(--dsh-table-lane-0, var(--dsh-table-lane))` — which is how one lane widens for a row's own controls without the table growing a prop for it.

The table's own rules sit in a cascade layer, so any unlayered consumer rule wins whatever its specificity: a library that guesses at specificity is one its consumer fights. The single exception is the track template, set inline because it is computed from the props — a stylesheet could not state it without restating the data, and inline is also what puts it out of reach of a rule that would break the arithmetic.

## Alternatives considered

- **Leave the policy in `ui-keybindings` and export it**: rejected — a second table would depend on the keybindings package for arithmetic that has nothing to do with keybindings, and the dependency would run the wrong way the moment anything else needed it.
- **A `Table` component owning ordering internally**: rejected — the sort state belongs to the consumer, which persists it, seeds it, and answers for it in its own tests. A component owning it would have to expose it back through props that mirror it, and the mirror is what goes stale.
- **Keep `SortableColumn` as one type carrying both the ordering and the heading**: rejected — the heading is a dictionary key here and would be a node, a string, or a renderer elsewhere. Extending the generic column costs a consumer one line and keeps the ordering free of a type it cannot use.
- **A theme object, or a `styles` prop of inline style objects**: rejected — inline styles beat every stylesheet rule short of `!important`, so a component that writes the consumer's decoration inline takes away the consumer's own cascade. It also puts colours and fonts through a JavaScript bundle that a stylesheet already carries better.
- **Ship no CSS at all and let the consumer state the tracks**: rejected — the tracks are the arithmetic. A consumer stating `grid-template-columns` would have to restate the shares, the lane widths and the interleaving, and the drag would then be converting numbers nobody had agreed on.
- **`:where()` for zero specificity instead of a layer**: kept as a fallback rather than the mechanism. `:where()` makes a rule lose to any consumer rule that names anything, but it cannot express ordering between two library rules, and it is a per-selector discipline that one forgetful rule breaks. A layer states the relationship once for the whole sheet.
- **A part-name attribute (`::part`-style) instead of a class per part**: rejected here — `::part` is a shadow-DOM boundary crossing and this is not one, so it would be a convention with no enforcement behind it. Classes go through the consumer's own build, which is where its design tokens already are.
- **Move the concrete orderings too**: rejected for all but `byText`. Precedence, gesture and place are statements about keybindings; a dotted-identifier ordering is arguably general but reaches into this package's row model, so it stays until something else asks for it.

## Consequences

`ui-keybindings` keeps its domain and loses the machinery: `sorting.ts` is now the columns and their orderings, and `resize.ts` is gone. The sort state machine and the row ordering are covered where they live, against a table of runs and durations rather than keybindings, which is the coverage that proves they are generic — the keybindings spec keeps only the assertions about what its own columns mean.

A boundary is now a `separator` that takes focus and moves by the arrow keys. That is not a port of anything: the hand-built sash was pointer-only, so a width was not something a keyboard could state, and the same drag arithmetic answers both.

The bands that add and remove a binding follow in their own cut, then the section rebased onto the result. Until then `KeybindingsSection` still holds its own copy of the geometry and is unchanged by this cut.
