/**
 * The trigger menu the rich composer renders from the input-trigger
 * controller's own stores: the menu state (groups, highlight) and the pick
 * routing both belong to the controller; this is presentation only.
 *
 * Keyboard arbitration stays with the shell (`arbitrate` answers
 * move/pick/escape while the menu is open); this renders what that state says
 * and routes pointer picks through the same `pick` the keyboard path takes.
 * The chrome mirrors the stock MenuView capsule (see rich-composer.module.css).
 */
import { memo } from 'react'
import type { InputTriggerController } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { useStoreOf } from './useStore.ts'
import css from './rich-composer.module.css'

export const TriggerMenu = memo(function TriggerMenu({ controller }: { controller: InputTriggerController }) {
  const useMenu = useStoreOf(controller.menu)
  const menu = useMenu(state => state)
  if (!menu.open || menu.groups.length === 0) return null

  return (
    <div className={css.menu} role="listbox" aria-label="trigger menu">
      <div className={css.menuViewport}>
        {menu.groups.map(group => (
          <div key={group.source} className={css.menuGroup}>
            {group.showGroupTitle === true ? <div className={css.menuGroupTitle}>{group.source}</div> : null}
            {group.status === 'pending' ? (
              <div className={css.menuPending}>…</div>
            ) : group.items.map((item, index) => {
              const highlighted = menu.highlight?.source === group.source && menu.highlight.index === index
              return (
                <button
                  key={`${item.name}:${index}`}
                  type="button"
                  role="option"
                  aria-selected={highlighted}
                  className={highlighted ? css.menuRowActive : css.menuRow}
                  onMouseEnter={() => { controller.hover(group.source, index) }}
                  onClick={() => { controller.pick(group.source, index) }}
                >
                  <span className={css.menuName}>{item.name}</span>
                  {item.description !== undefined ? (
                    <span className={css.menuDescription}>{item.description}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
})
