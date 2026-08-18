# Agent Note: A catch-all binding for surfaces where raw input is the default

Status: proposed

English | [中文](2026-08-18-raw-input-model.zh.md)

## Problem

The dispatcher assumes commands are the rule and raw keystrokes the exception: a gesture that matches a binding fires an action and the keystroke is claimed, and everything else falls through to whatever has focus. That assumption holds for the composer, the command menu, and the settings page, and it inverts for a surface that consumes keystrokes as data — an embedded terminal, a game, a modal editor with its own key language. There, nearly every key is the surface's own and only a few gestures should escape to the application.

A `when` clause cannot express that inversion. Clauses gate divergence the context can name — a scope is active, a menu is open — but the surface that needs raw input is not asking whether some named state holds; it is asking to receive the input event itself, including keys nobody has bound and combinations no binding could enumerate. Writing `when: !terminalActive` on every binding in every package would state the exception once per binding and put the maintenance burden on every package except the one that needs it, which is exactly backwards.

## Proposal

Add a catch-all pattern to the binding grammar: a binding whose gesture is `*` matches any keystroke that reached the dispatcher, gated by its own `when` clause like any other. A surface that wants raw input registers one action with a `*` binding scoped to its own focus scope, and the ordinary ranking and priority rules decide what still outranks it — an Escape binding placed above the catch-all keeps working, and everything below it never sees the key.

Actions gain typed `args`, so one handler can serve several bindings, and the argument values may carry interpolation tokens the dispatcher substitutes at invocation: `${inputEvent}` for the keystroke that matched, `${activationGesture}` for the gesture as bound. An unclosed `${` is literal text rather than an error, so a user typing a brace into a settings field does not produce a binding that fails to load.

The catch-all is the dual of the `when`-gated decline already shipped for the Space token claim, where a binding declines a gesture it could have taken. Declining is for divergence the context can name; the catch-all is for divergence only the handler can see.

## Alternatives considered

- **A focus-scope flag that suspends dispatch entirely**: rejected — an all-or-nothing switch also loses the bindings that should still fire inside such a surface (Escape to leave it, the application's own accelerators), and re-admitting them means rebuilding priority inside the flag.
- **Let the surface attach its own window listener**: rejected — precedence returns to being ad hoc, the dispatcher's claim contract is bypassed, and the surface's keys become invisible to the settings page, so a user cannot see or rebind them.
- **`when: !rawInput` on every existing binding**: rejected — it inverts the maintenance burden onto every package that is not the one asking, and a package added later silently misses the exception.
- **A separate raw-input service beside the dispatcher**: rejected — two authorities over one keystroke stream need a rule for who sees it first, which is the ordering the dispatcher already owns.

## Acceptance criteria

A surface can register one catch-all action and receive every keystroke that reaches the dispatcher, with a named binding still outranking it and firing normally. The catch-all appears in the settings table like any other binding, with its gesture readable as such. An action with `args` receives the substituted values, `${inputEvent}` carries the event that matched, and a binding whose argument contains an unclosed `${` loads with that text intact.

## Risks

The catch-all claims keystrokes by construction, so a mis-scoped one silences the application inside its scope; the clause is the only thing standing between a raw-input surface and a keyboard that appears dead. Interpolation also introduces a second place where a binding's stored text is interpreted, which is a parsing surface the settings page must render honestly rather than hide.
