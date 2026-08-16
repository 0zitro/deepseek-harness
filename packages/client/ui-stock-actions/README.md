# @deepseek-ai/dsh-client-ui-stock-actions

Built-in UI actions and their default keybindings. The browser half registers the composer actions — `composer.send` (default Enter, the aggregate that follows the busy-Enter preference) plus the unbound raw opt-outs `composer.queue` and `composer.steer` — against the `uiActions` registry provided by the keybindings orchestrator; the orchestrator then persists each binding and renders its settings row. Each action's `run` calls the `ctx.composer` submission service.

The package is a drop-in layer: the built-in actions live here rather than in the orchestrator, so the orchestrator stays action-agnostic and the upstream fork stays cleanly mergeable — remove this package and the built-in actions go with it.

## Model Experience

None, as the package contributes a browser configuration UI; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Only the composer actions are registered** — future built-in actions (panel toggles, navigation) are added here, one `ctx.uiActions.register` call each.
- **The InputBar still handles Enter directly** — the keybindings dispatcher is not yet the sole submit path; removing that hardcoded handling is a separate `ui-conversation` change.
