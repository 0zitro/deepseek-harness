# @deepseek-ai/dsh-client-ui-stock-actions

Built-in UI actions and their default keybindings. The browser half registers the composer send action (`composer.send`, default Enter) against the `uiActions` registry provided by the keybindings orchestrator; the orchestrator then persists the action's binding and renders its settings row.

The package is a drop-in layer: the built-in actions live here rather than in the orchestrator, so the orchestrator stays action-agnostic and the upstream fork stays cleanly mergeable — remove this package and the built-in actions go with it.

## Model Experience

None, as the package contributes a browser configuration UI; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Only the composer send action is registered** — future built-in actions (panel toggles, navigation) are added here, one `ctx.uiActions.register` call each.
- **The composer send `run` is a no-op placeholder** — wiring it to the InputBar submit is a separate `ui-conversation` change.
