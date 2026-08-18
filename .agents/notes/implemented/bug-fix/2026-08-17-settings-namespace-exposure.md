# Agent Note: A settings namespace is served by the gateway, not by registering it

Status: implemented

English | [中文](2026-08-17-settings-namespace-exposure.zh.md)

## Problem

The keybindings settings page bound its namespace, rendered every field, accepted every edit, and stored nothing. A reload brought back the shipped defaults with no error anywhere: not in the console, not in the page, not in the host log. The plugin had done what the settings seam documents — `ctx.settingsScope.bind({ namespace })` — and that is necessary but not sufficient, because the API gateway serves an explicit allowlist and a namespace outside it is absent from every description and refused on every write. `ui-keybindings` was not on that list.

The refusal was invisible twice over, and each half is a design decision that reads as correct in isolation. A bound scope turns a non-ok description into a re-read, because the ordinary cause is a connection that is not up yet. The caller that writes discards the returned promise, because a write is fire-and-forget from the row's point of view. Composed, an authoritative "this namespace is not exposed" answer became a retry that never reported, and the only symptom left was preferences that do not survive a reload — which reads as a persistence bug in the feature, not as a composition error in the deployment.

The page also published optimistically: an edit appeared in the list as soon as it was made. That is why the failure was silent even while the user watched, since the value they typed stayed on screen exactly as it would have had the write landed.

## Decision

The gateway serves `ui-keybindings`, alongside the other Web preference namespaces it already exposed. Registering a namespace on the client still does not expose it; the allowlist remains the decision point, because that is the boundary where remote readability and writability are granted.

A bound scope now reports an unserved namespace once, as an error naming it, the first time a description answers without it. Once, because the condition is a composition fact rather than a transient one, and repeating it every reconnect would bury it. A remote browser binds in memory mode by design and never reports, so the diagnostic fires only where the namespace was actually expected to be served.

The keybindings store also stopped publishing optimistically: it projects the stored list and nothing else, so an edit appears when it is stored rather than when it is made. A write the host refuses can no longer leave a binding on screen that no reload will bring back, and every write derives the next list from the stored one — absent a stored list, the write is refused with an error rather than allowed to replace overrides it never saw.

## Alternatives considered

- **Serve every namespace a client registers**: rejected — the allowlist is the security boundary for the whole configuration plane. Registration happens in the browser; letting it grant remote read and write access would mean any client-side plugin could expose host state by declaring it.
- **Fail the bind, or throw on the first refused write**: rejected — a remote browser legitimately binds namespaces the gateway will not serve and works in memory mode. An exception would break that supported case to report a deployment error that only applies to loopback compositions.
- **Report on every refused description**: rejected — the condition does not change between reconnects, so repetition adds volume without adding information, and the one useful instance is the first.
- **A gate asserting every client-registered namespace is exposed**: not built. Registration is a runtime fact in the browser plane and the allowlist is a literal in the host plane, so there is no pair of static lists to compare; a check would have to boot a composition and diff its descriptions. Recorded here as the deferred item rather than left implicit, because the invisible-by-construction failure mode still exists for the next client namespace.

## Consequences

The class of failure this belongs to is worth naming: a refusal that is swallowed by a retry and a discarded promise produces a feature that looks implemented and stores nothing, and no test of either half fails. What fixed it was making the authoritative answer say so once, at the layer that can tell the difference between "not up yet" and "not served here".

Projecting only stored state cost the page its optimistic echo — an edit now appears a round trip after it is made — and bought the guarantee that what is on screen is what is stored. The rest of the settings surface keeps its own behavior; this change is scoped to the keybindings store and the shared scope's reporting.
