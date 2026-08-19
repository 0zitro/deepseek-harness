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

That last point is the seam the next cut has to widen. "A column may not be dragged below its heading" is this table's policy and not a general rule — its rows deliberately do not count, because their fields clip and their gestures scroll, so a long clause must not hold a column open for content that has somewhere else to go. A table whose rows are the whole point wants the opposite. The arithmetic is already indifferent; the component that obtains the floors is where the choice will be stated.

## Alternatives considered

- **Leave the policy in `ui-keybindings` and export it**: rejected — a second table would depend on the keybindings package for arithmetic that has nothing to do with keybindings, and the dependency would run the wrong way the moment anything else needed it.
- **A `Table` component owning ordering internally**: rejected — the sort state belongs to the consumer, which persists it, seeds it, and answers for it in its own tests. A component owning it would have to expose it back through props that mirror it, and the mirror is what goes stale.
- **Keep `SortableColumn` as one type carrying both the ordering and the heading**: rejected — the heading is a dictionary key here and would be a node, a string, or a renderer elsewhere. Extending the generic column costs a consumer one line and keeps the ordering free of a type it cannot use.
- **Move the concrete orderings too**: rejected for all but `byText`. Precedence, gesture and place are statements about keybindings; a dotted-identifier ordering is arguably general but reaches into this package's row model, so it stays until something else asks for it.

## Consequences

`ui-keybindings` keeps its domain and loses the machinery: `sorting.ts` is now the columns and their orderings, and `resize.ts` is gone. The sort state machine and the row ordering are covered where they live, against a table of runs and durations rather than keybindings, which is the coverage that proves they are generic — the keybindings spec keeps only the assertions about what its own columns mean.

The markup layers follow in their own cuts: tracks, lanes, sash and row groups; then the bands that add and remove; then the section rebased onto the result. Until then `KeybindingsSection` still holds every piece of geometry, and reads its policy across the seam this note opens.
