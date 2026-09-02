# Agent Note: Keybindings resolve as seats holding ranked contributions

Status: implemented

English | [中文](2026-08-16-keybinding-seats-and-contributions.zh.md)

## Problem

Keyboard behavior lived in the components that owned it. `InputBar` decided what Enter meant, each overlay decided what Escape meant, and the command menu decided what the arrow keys meant, so no surface could state a binding it did not itself implement, nothing could be rebound, and two features claiming one gesture discovered the conflict only as a bug report. A settings page over that arrangement was not writable: there was no list of bindings to render, no identity to store an adjustment against, and no place to decide which of two claimants wins.

The hard part is not a registry — it is what a stored adjustment addresses. A gesture is not an identity: rebinding the default to `Ctrl+Enter` cannot mean the stored record now addresses whatever else holds `Enter`. A `when` clause is not one either: two clauses may imply each other, and whether they do is not statically decidable, so keying on the clause text splits one binding into two that never reconcile.

## Decision

An action is what a feature registers — an id, a label, a `run` handler, and zero or more default keybindings, each carrying a stable `key`. That key is the identity: the pair `(action, key)` is a **seat**, and a seat outlives the gesture sitting in it, which is what lets a stored adjustment survive a default whose strokes move.

A **contribution** to a seat is a `KeybindingOverride`: `{ action, key, base, strokes?, when?, prio? }`. It states only the fields the user changed, so a field it does not state keeps following the default and a later change to that default still reaches the merged binding — restating the merged value would freeze it instead. `base` snapshots the default the contribution departs from; reconciliation writes the current default back into it whenever either side moves, compares structurally so an already-reconciled list writes nothing, and leaves the base alone when the default is unavailable, because failing to reconcile is not failing to merge.

A contribution never declares where it came from. The settings document is the user's by definition and a plugin's contributions are that plugin's, so the source is stamped on ingest and a declaration cannot claim one it does not have. Ranking decides which contribution merges — user over plugin over shipped — and only the top-ranked one does. A contribution that states no field at all is not empty: holding a seat is itself a statement, since the binding becomes the user's, outranking the source it used to follow and ordering in the user's scope rather than that source's.

The page shows a seat's shipped binding beside the contribution that took it, the shipped one inert and struck through, because it is what the contribution departs from and what returns if the contribution goes. A binding may also be added: it takes a seat of its own keyed in the family of the seat it was added beside (`send`, `send#1`, `send#2`), a suffix no registrar can write, so a minted key and a shipped one share a namespace and cannot collide.

## Ordering and collisions

Two bindings collide when they share a gesture and both may fire. Source rank settles the cross-source case; within one rank, `prio` separates them, and its scope is exactly `(strokes, source)` — the entries that can actually meet. A binding competing with nothing therefore reads 0, and only a genuine contest counts upward. Seeding across the whole list was the alternative and is unsound: it numbers bindings that never meet, and since every seeded value is then distinct, a real collision becomes undetectable.

Stating a priority places the binding rather than claiming a value that may be refused: it takes the value and everything ordered at or after it in the same scope moves one place back. Only bindings the user already contributed to share that scope, so a shift rewrites contributions that exist and never invents one. Adopting a shipped default this way moves it out of the shipped scope into the user's, where the places are already taken, so the placement is judged against the world the edit would leave rather than the one it arrived in.

## Alternatives considered

- **Key a stored adjustment by its gesture**: rejected — the gesture is the mutable part. A rebind would re-address the record at whatever else now holds the old strokes, and a shipped default that moves would silently orphan every adjustment made against it.
- **Include the `when` clause in the identity**: rejected — clause equality is not semantic equality. Two clauses may imply one another, and deciding whether they do is not statically possible, so one binding splits into two records that never reconcile and both dispatch.
- **Roll all three sources into one merged binding**: rejected — a plugin's clause combined with the user's strokes is a binding neither party wrote. Ranking picks one contribution to merge with the default, which keeps every effective binding attributable to a single author.
- **Let a contribution declare its own source**: rejected — provenance a declaration can assert is provenance a plugin can forge. Stamping on ingest makes "the user's" a fact about which document the contribution arrived in.
- **Refuse a priority that is already taken**: rejected — the field is the only way to reorder a scope, so refusing turns the one available gesture into a puzzle. Placement displaces instead, which is what the user meant by typing it.
- **Drop a contribution that states no field**: rejected after shipping it — it silently handed the seat back to the shipped default, changing both rank and priority scope, which is a behavior change the user never asked for.
- **Keep a superseded shipped binding off the page**: rejected — it is what the contribution departs from and what returns if the contribution is dropped, and hiding it made unbinding a system default read as destroying it.

## Consequences

A feature states its default binding and stops implementing key handling; the dispatcher claims a keystroke only when it matched or opened a chord, so an unbound printable key still reaches the input beneath it. Every effective binding is attributable to one author and one seat, which is what makes the settings table renderable and a stored adjustment durable across a default that moves.

The cost is a vocabulary a maintainer has to hold: seat, contribution, base, source rank, and a priority scoped to `(strokes, source)` rather than to the action. The reconciliation pass is also a write-back — it settles after one write because the comparison is structural, but it does mean a registration change can produce a settings write with no user action behind it.

`when` clauses gate at runtime only. They never enter an identity, so a binding whose clause never holds is inert rather than absent, and a clause naming state no feature publishes is not rejected — it simply never holds.
