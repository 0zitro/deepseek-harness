/**
 * Attaching the live composer behavior to one editable.
 *
 * Every handler here is ported from the reference composer's `attach`, minus the host-specific
 * pieces (the mention mirror, the task references, the highlighter bus) and with the extension
 * hooks replaced by callbacks: `onEdit` is what pushes the buffer into the session shell, and the
 * recall hooks are methods on the returned control, for the surface to wire to whatever history
 * navigation its host offers.
 */

import { decorate, COMPOSER_STYLE } from './reconcile.ts'
import { drawWithAddress } from './math.ts'
import { createColorFor } from './highlight.ts'
import { at as atAddress, heldText, offsetOf as offsetUnder, replace } from './text.ts'
import { selectionOffsets, setSelection, type HeldSelection } from './selection.ts'
import { foldablesIn, type Foldable } from './segments.ts'
import { SourceHistory, type Position, type Snapshot } from './undo.ts'

/** Where an anchor is written on a glyph, read back by the pointer path. */
const AT = 'data-ccx-at'

/** Options for {@link attach}. */
export interface AttachOptions {
  /** The editable to attach to (already in the document). */
  el: HTMLElement
  /** Called after any text change the browser performed or a restore wrote, with the new text. */
  onEdit: (text: string) => void
  /** Called after each decoration, with the held text and the caret offset. */
  afterDecorate?: (text: string, caret: number | null) => void
}

/** The control a surface keeps for the behaviors it triggers itself. */
export interface ComposerControl {
  /** Capture the current position's text before an external overwrite (a recall, a seed). */
  leaving(): void
  /**
   * Arrive at a message-history position, showing what it was last left holding.
   * @param key - the position (its recalled text, or the draft symbol).
   * @param original - the text the position started from.
   * @param atStart - whether the recall came from the top edge.
   */
  arrive(key: Position, original: string, atStart: boolean): void
  /** A send emptied the composer and returned to the draft. */
  sent(): void
  /**
   * Adopt a text the surface did not type: a shell-side draft change (a pick
   * insert, a persisted-draft seed). The buffer is replaced wholesale, the
   * caret follows the mapped offset (end by default), and the change is
   * recorded as an undo step unless the caller is seeding.
   * @param text - the next buffer text.
   * @param record - whether the adoption joins the undo history.
   */
  adopt(text: string, record: boolean): void
  /** Whether the composer sits on the draft rather than a recalled message. */
  atDraft(): boolean
  /** The live selection, for surfaces that answer questions about the caret. */
  selection(): HeldSelection | null
  /** Undo one step, as the keyboard shortcut would. */
  undo(): void
  /** Redo one step, as the keyboard shortcut would. */
  redo(): void
  /** Stop. */
  dispose(): void
}

/** The window typed loosely where the composer touches non-standard or layout APIs. */
interface HostWindow extends Window {
  setTimeout(handler: () => void, timeout?: number): number
}

const OBSERVE: MutationObserverInit = { childList: true, subtree: true, characterData: true }

/**
 * Attach the live composer to one editable.
 * @param win - the host window.
 * @param options - the editable and the surface callbacks.
 */
export function attach(win: Window, options: AttachOptions): ComposerControl {
  const doc = win.document
  const el = options.el
  const host = win as HostWindow

  const style = doc.createElement('style')
  style.textContent = COMPOSER_STYLE
  doc.head.appendChild(style)

  // --- decoration state -------------------------------------------------------------------

  let grammarDirty = false
  const colorFor = createColorFor(() => {
    // A lazy grammar finished loading: the fences rendered plain re-paint. The flag defers the
    // re-decoration past the pass in flight rather than recursing mid-decoration.
    grammarDirty = true
    host.setTimeout(() => { redecorate() }, 0)
  })

  /** The column a run of vertical moves was aimed at, and the focus it was last left at. */
  let aiming: { focus: number; x: number } | undefined
  /** Where the caret was left by the last decoration, so the change decoration itself causes is
   * not read back as somebody moving it -- which would be a loop with no end. */
  let placed = ''
  /** Where the browser padded the last line break, read once by the redecoration that edit causes.
   * Which edit it was is a thing only `input` says; a mutation looks the same whoever made it. */
  let compensated = -1
  /** The one object being edited. Being open is state: decided by the caret, the way OUT of an
   * object runs through the whole of its syntax. Held as where it begins AND what it said there,
   * because an offset does not identify an object: a text replaced wholesale -- a recall, a paste,
   * an undo -- can put a different object at the same offset, and one carrying the open state of
   * the object it replaced never folded at all. */
  let opened: { from: number; was: string } | undefined
  /** The last edge a `Home` or `End` reached, so a press that finds the focus still there is a
   * repeat. Anything that moves the focus makes the next press a first one again. */
  let edging: { key: string; focus: number; rung: number } | undefined

  const seen = (): string => {
    const sel = selectionOffsets(win, el)
    return sel !== null ? `${sel.start},${sel.end}` : ''
  }

  const observer = new MutationObserver(() => {
    if (composing || restoring) return
    history.record(heldText(el), selectionOffsets(win, el))
    options.onEdit(heldText(el))
    redecorate()
  })

  const redecorate = (moved = false): void => {
    observer.disconnect()
    // A caret that has gone somewhere else has left, however it got there -- a click, a send, an
    // edit that moved the object out from under it.
    const text = heldText(el)
    const objects = foldablesIn(text, drawWithAddress)
    const here = selectionOffsets(win, el)

    if (opened !== undefined) {
      const still = objects.find((object) => object.from === opened?.from && text.slice(object.from, object.to) === opened?.was)
      if (still === undefined || here === null || here.focus < still.from || here.focus > still.to) opened = undefined
    }

    // An object that formed AROUND the caret was never folded to begin with. Nothing else leaves a
    // caret strictly inside a folded one: an arrow landing there opens it, a pointer landing on it
    // opens it, and leaving one on purpose only ever happens from an edge.
    if (opened === undefined && here !== null && here.start === here.end) {
      const forming = objects.find((object) => here.focus > object.from && here.focus < object.to)
      if (forming !== undefined) opened = { from: forming.from, was: text.slice(forming.from, forming.to) }
    }

    const padded = compensated
    compensated = -1

    decorate(win, el, drawWithAddress, grammarDirty ? null : colorFor, padded, opened?.from ?? -1)
    if (grammarDirty) {
      grammarDirty = false
      // The fresh colours arrived between two passes; one more pass paints them.
      win.setTimeout(() => { redecorate() }, 0)
    }
    taken()
    observer.observe(el, OBSERVE)
    placed = seen()
    options.afterDecorate?.(text, here?.focus ?? null)
    void moved
  }

  /**
   * Show which folded objects a selection has taken, which the browser cannot show for itself: a
   * selection is painted over TEXT, and a folded object holds hidden text plus a drawing, so a
   * range crossing one paints everything but it. Any overlap at all is total -- the browser will
   * not put a boundary inside something it may not edit.
   */
  const taken = (): void => {
    const sel = win.getSelection()
    const range = sel !== null && sel.rangeCount > 0 && !sel.isCollapsed && el.contains(sel.anchorNode)
      ? sel.getRangeAt(0)
      : null
    for (const atom of el.querySelectorAll('[data-ccx-atom]')) {
      atom.classList.toggle('ccx-md-taken', range !== null && range.intersectsNode(atom))
    }
  }

  doc.addEventListener('selectionchange', () => {
    if (doc.activeElement !== el) return
    const now = seen()
    if (now === placed) return
    placed = now
    const text = heldText(el)
    const sel = selectionOffsets(win, el)
    if (sel !== null) history.trackSelection(text, sel)
    redecorate(true)
  })

  // --- undo/redo over (text, selection) snapshots -------------------------------------------

  const history = new SourceHistory(heldText(el))
  let composing = false
  let restoring = false

  const restore = (target: Snapshot): void => {
    restoring = true
    observer.disconnect()
    el.textContent = target.text
    decorate(win, el, drawWithAddress, colorFor)
    observer.observe(el, OBSERVE)
    restoring = false
    const len = target.text.length
    const start = Math.min(target.start ?? len, len)
    // Which end was moving is part of where the selection WAS: restored start-to-end, a backwards
    // selection comes back forwards and the next `shift+arrow` takes the end the writer was not
    // holding.
    setSelection(win, el, start, Math.min(target.end ?? start, len), target.backward)
    options.onEdit(target.text)
    redecorate()
  }

  // Undo/redo KEYBINDINGS live in the action system (`composer.undo` /
  // `composer.redo`, registered by the plugin): gestures are data, and a
  // rebind must move the gesture, not fight a hardcoded handler. This file
  // keeps the undo STACK and the programmatic `undo()`/`redo()` verbs; the
  // standalone harness (tests/browser/entry.ts) binds the default chords
  // itself where no dispatcher exists.

  // --- horizontal arrows: entering and leaving an object ------------------------------------

  el.addEventListener('keydown', (event) => {
    const e = event as KeyboardEvent
    if (e.defaultPrevented || e.isComposing) return
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return

    const sel = selectionOffsets(win, el)
    if (sel === null || sel.start !== sel.end) return

    const rightwards = e.key === 'ArrowRight'
    const here = sel.start
    const text = heldText(el)
    const objects = foldablesIn(text, drawWithAddress)

    const editing = opened === undefined ? undefined : objects.find((object) => object.from === opened?.from)

    if (editing !== undefined) {
      // Leaving: a step that would carry the caret out of what is being edited closes it instead.
      if (!((rightwards && here === editing.to) || (!rightwards && here === editing.from))) return
      opened = undefined
    } else {
      // Entering: folded, the object is one thing with no inside to stand in, so the step that
      // would cross it opens it -- from beside it, whichever side the caret is on.
      const into = objects.find((object) => (rightwards && here === object.from) || (!rightwards && here === object.to))
      if (into === undefined) return
      opened = { from: into.from, was: text.slice(into.from, into.to) }
    }

    e.preventDefault()
    e.stopPropagation()
    redecorate(true)
  }, true)

  // --- vertical arrows: column memory and landing arbitration --------------------------------

  /** The box an object is drawn over, or null where it draws nowhere. */
  const drawnAt = (object: Foldable): DOMRect | null => {
    const span = doc.createRange()
    const from = atAddress(el, object.from)
    const to = atAddress(el, object.to)
    span.setStart(from.node, from.offset)
    span.setEnd(to.node, to.offset)
    const box = span.getBoundingClientRect()
    return box.height > 0 ? box : null
  }

  /** The offset drawn at a point, or null where nothing of the composer's is. What is drawn is
   * what the composer holds: folding hides runs rather than replacing them, so every glyph on the
   * screen outside a drawing is a character of the source. */
  const drawnUnder = (x: number, y: number): number | null => {
    const spot = doc.caretPositionFromPoint(x, y)
    if (spot === null || !el.contains(spot.offsetNode)) return null
    return offsetUnder(el, spot.offsetNode, spot.offset)
  }

  /** The last offset on the drawn line an object sits on, asked of the layout: a line is drawn as
   * far as it wraps and the text does not say where that is. */
  const lineEnd = (object: Foldable): number | null => {
    const box = drawnAt(object)
    if (box === null) return null
    return drawnUnder(el.getBoundingClientRect().right - 1, box.top + box.height / 2)
  }

  el.addEventListener('keydown', (event) => {
    const e = event as KeyboardEvent
    if (e.defaultPrevented || e.isComposing) return
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    if (e.ctrlKey || e.metaKey || e.altKey) return

    const sel = selectionOffsets(win, el)
    if (sel === null) return

    const text = heldText(el)
    const objects = foldablesIn(text, drawWithAddress).filter((object) => object.from !== opened?.from)
    const leading = objects.filter((object) => object.from === 0 || text[object.from - 1] === '\n')
    const down = e.key === 'ArrowDown'

    // Where the focus is taken, keeping the anchor when the move is extending a selection.
    const aim = (focus: number, column: number | null): void => {
      const now = selectionOffsets(win, el)
      const anchor = e.shiftKey && now !== null ? (now.backward ? now.end : now.start) : focus
      setSelection(win, el, Math.min(anchor, focus), Math.max(anchor, focus), focus < anchor)
      aiming = column === null ? undefined : { focus, x: column }
    }

    // Landing on an offset: inside a folded object it opens and holds the caret, elsewhere the
    // caret simply goes there.
    const settle = (offset: number, column: number | null): void => {
      const into = objects.find((object) => offset > object.from && offset < object.to)
      if (into !== undefined) {
        // Opened first, then aimed at: an offset inside a folded object is not a place a caret may
        // be put, and asking for one lands beside the object instead.
        opened = { from: into.from, was: text.slice(into.from, into.to) }
        redecorate(true)
      }
      aim(offset, column)
    }

    // The move is made here rather than by the browser in two cases: a caret at an object's near
    // edge has no box to start from, and a run of moves already carrying a column would lose it to
    // the browser's own, which the last landing reset. A carried column outlives the object it was
    // carried into: entering one changes the line's metrics, and the column a run began at is what
    // leaving it again should return to.
    const was = win.getSelection()
    const from = was !== null && was.rangeCount > 0 ? was.getRangeAt(0).getBoundingClientRect() : null
    const carried = aiming
    const aimed = carried !== undefined && carried.focus === sel.focus ? carried.x : null
    const here = leading.find((object) => object.from === sel.focus)
    const box = from !== null && from.height > 0 ? from : here !== undefined ? drawnAt(here) : null

    if (box !== null && (aimed !== null || here !== undefined)) {
      const column = aimed ?? box.left + 1
      const beyond = drawnUnder(column, down ? box.bottom + box.height / 2 : box.top - box.height / 2)
      if (beyond === null) return
      e.preventDefault()
      e.stopPropagation()
      settle(beyond, column)
      return
    }

    if (objects.length === 0) return
    const column = from !== null && from.height > 0 ? from.left : null

    // Otherwise the browser makes the move and this answers for where it came to rest. Reading the
    // landing rather than predicting it keeps every ordinary move the browser's own, along with the
    // goal column and the wrap it was aimed at.
    host.setTimeout(() => {
      const now = selectionOffsets(win, el)
      if (now === null || heldText(el) !== text) return
      // Coming to rest on an EDGE of an object is the browser saying the column fell inside it,
      // since an object is where it puts every column that one covers. Which edge it chooses
      // differs -- a leading object takes the far edge and one with text before it the near -- so
      // both are read, and the column decides what was meant either way.
      const rested = objects.find((object) => object.from === now.focus || object.to === now.focus)
      if (rested === undefined) return
      const objectBox = drawnAt(rested)
      const wanted = column !== null && objectBox !== null ? drawnUnder(column, objectBox.top + objectBox.height / 2) : null
      if (wanted === null) return
      // Inside the object is a place a reader asked for, so the object opens and the caret goes
      // there. Outside it is not, and the caret stops at the edge the column is nearest.
      if (wanted > rested.from && wanted < rested.to) return settle(wanted, column)
      if (wanted <= rested.from && now.focus !== rested.from) aim(rested.from, column)
    }, 0)
  }, true)

  // --- Home/End: two rungs, the repeat remembered ---------------------------------------------

  el.addEventListener('keydown', (event) => {
    const e = event as KeyboardEvent
    if (e.defaultPrevented || e.isComposing) return
    if (e.key !== 'Home' && e.key !== 'End') return
    if (e.ctrlKey || e.metaKey || e.altKey) return

    const sel = win.getSelection() as (Selection & { modify?: (alter: string, direction: string, granularity: string) => boolean }) | null
    const was = selectionOffsets(win, el)
    if (sel?.modify === undefined || was === null) return

    e.preventDefault()

    const onwards = e.key === 'End'
    const again = edging !== undefined && edging.key === e.key && edging.focus === was.focus

    if (!again) {
      // The browser's `lineboundary` is asked for the inner rung, since it knows where a line was
      // wrapped and this cannot -- but not from beside a folded object, where it runs past the
      // line's end and into the next. Only forwards; backwards is right from everywhere.
      const besideObject = onwards
        ? foldablesIn(heldText(el), drawWithAddress)
            .find((object) => object.from !== opened?.from && (object.from === was.focus || object.to === was.focus)) ?? null
        : null
      const drawn = besideObject !== null ? lineEnd(besideObject) : null

      if (drawn !== null) {
        const anchor = e.shiftKey ? (was.backward ? was.end : was.start) : drawn
        setSelection(win, el, Math.min(anchor, drawn), Math.max(anchor, drawn), drawn < anchor)
        edging = { key: e.key, focus: drawn, rung: 1 }
        return
      }

      sel.modify(e.shiftKey ? 'extend' : 'move', onwards ? 'forward' : 'backward', 'lineboundary')
      const now = selectionOffsets(win, el)
      if (now !== null) edging = { key: e.key, focus: now.focus, rung: 1 }
      return
    }

    if (edging?.rung !== undefined && edging.rung > 1) return // nowhere further out to go

    const held = heldText(el)
    const ends = held.indexOf('\n', was.focus)
    const target = onwards ? (ends === -1 ? held.length : ends) : held.lastIndexOf('\n', was.focus - 1) + 1

    const anchor = e.shiftKey ? (was.backward ? was.end : was.start) : target
    setSelection(win, el, Math.min(anchor, target), Math.max(anchor, target), target < anchor)
    edging = { key: e.key, focus: target, rung: 2 }
  }, true)

  // --- Backspace/Delete at a folded object's edge ----------------------------------------------
  //
  // A folded object is one thing the browser will not edit into, and a
  // deletion at its edge should take it entire — the same property an arrow
  // and a select-all delete rest on. The browser's own answer at the edge of
  // a contenteditable=false island inside a plaintext-only editable is not
  // that: it may take the drawing and leave the hidden source standing. The
  // edge cases are claimed here; every other deletion is the browser's own.
  el.addEventListener('keydown', (event) => {
    const e = event as KeyboardEvent
    if (e.defaultPrevented || e.isComposing) return
    const backspace = e.key === 'Backspace'
    if (!backspace && e.key !== 'Delete') return
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

    const sel = selectionOffsets(win, el)
    if (sel === null || sel.start !== sel.end) return

    const objects = foldablesIn(heldText(el), drawWithAddress)
      .filter((object) => object.from !== opened?.from)
    // Backspace at the far edge deletes the object whole; Delete at the near
    // edge does. The open object is excluded: its source is ordinary text.
    const object = backspace
      ? objects.find((one) => one.to === sel.focus)
      : objects.find((one) => one.from === sel.focus)
    if (object === undefined) return

    e.preventDefault()
    e.stopPropagation()
    replace(win, el, object.from, object.to, '')
  }, true)

  // --- pointer: a region is what a region is FOR, which is editing ------------------------------

  const lift = (): void => {
    for (const atom of el.querySelectorAll('[data-ccx-atom]')) atom.removeAttribute('contenteditable')
  }
  const settleRegions = (): void => {
    for (const atom of el.querySelectorAll('[data-ccx-atom]')) atom.setAttribute('contenteditable', 'false')
  }

  /**
   * What the gesture left the caret pointing at, inside an object: asked of the LAYOUT and not of
   * what the pointer hit. A glyph is a filled outline, so it receives a pointer only where its
   * strokes actually are -- reading the target answered with the start of the whole thing almost
   * every time. Every click was over a character all the same, and the boxes say which.
   */
  const struck = (event: Event | undefined): number | null => {
    const target = event?.target
    if (target === null || target === undefined || typeof (target as Element).closest !== 'function') return null
    const box = (target as Element).closest('[data-ccx-atom]')
    if (box === null || !el.contains(box)) return null

    const x = (event as MouseEvent).clientX
    const glyphs = [...box.querySelectorAll(`[${AT}]`)]
      .map((one) => ({ at: Number(one.getAttribute(AT)), drawn: one.getBoundingClientRect() }))
      .filter((one) => Number.isInteger(one.at) && one.drawn.width > 0)

    // How far a point is from a glyph, which is zero for every point over it.
    const away = (one: { drawn: DOMRect }): number =>
      x < one.drawn.left ? one.drawn.left - x : x > one.drawn.right ? x - one.drawn.right : 0

    if (typeof x === 'number' && glyphs.length > 0) {
      return glyphs.reduce((near, one) => (away(one) < away(near) ? one : near)).at
    }

    const said = box.getAttribute('data-ccx-atom')
    const at = Number(said)
    return said !== null && said !== '' && Number.isInteger(at) ? at : null
  }

  const gestureEnded = (event: Event): void => {
    const sel = selectionOffsets(win, el)
    const text = heldText(el)
    const objects = foldablesIn(text, drawWithAddress)

    const caret = sel !== null && sel.start === sel.end ? sel.focus : null
    const inside = caret === null ? undefined : objects.find((object) => caret > object.from && caret < object.to)

    // A link is drawn out of its own text, so the caret the browser resolved IS the place that was
    // pointed at. An expression is not: it hides all of its source, so the caret lands at one edge
    // of the whole thing however far in the pointer went, and what was struck is the only thing
    // that says where the writer was reaching. A drag asked for a selection, not for a place.
    const at = inside !== undefined || (sel !== null && sel.start !== sel.end) ? null : struck(event)
    const reached = inside ?? (at === null ? undefined : objects.find((object) => at >= object.from && at < object.to))

    if (reached === undefined) return settleRegions()

    opened = { from: reached.from, was: text.slice(reached.from, reached.to) }

    // Twice, for two different reasons, and neither will do the other's job. The redecoration asks
    // where the caret is to decide whether the object it was told to open is still the one being
    // edited, so a caret left outside closes it again before it is ever drawn open; the object's
    // own start is the furthest in a caret can be put while the object is still folded. Which is
    // why the place actually pointed at has to wait for the text to be real.
    if (at !== null) setSelection(win, el, reached.from, reached.from, false)

    redecorate(true)

    if (at !== null) setSelection(win, el, at, at, false)
  }

  el.addEventListener('mousedown', lift, true)
  // On the document, since a button released outside the composer still ends the gesture, and after
  // the browser has had the event: putting the region back first is standing in the way again.
  const onDocMouseUp = (event: Event): void => {
    host.setTimeout(() => gestureEnded(event), 0)
  }
  doc.addEventListener('mouseup', onDocMouseUp, true)
  el.addEventListener('blur', settleRegions)

  // --- clipboard: what a send would carry -------------------------------------------------------

  for (const kind of ['copy', 'cut'] as const) {
    el.addEventListener(kind, (event) => {
      const e = event as ClipboardEvent
      const sel = selectionOffsets(win, el)
      if (sel === undefined || sel === null || sel.start === sel.end) return
      const held = heldText(el).slice(sel.start, sel.end)
      if (e.clipboardData === null) return
      // A selection serialises what is DRAWN, so copying across a folded object would take its
      // label and leave its target behind. Both answer with the text the composer holds over the
      // selected range -- and a cut then performs the deletion itself, since refusing the event
      // refuses that too.
      e.clipboardData.setData('text/plain', held)
      e.preventDefault()
      if (kind === 'cut') replace(win, el, sel.start, sel.end, '')
    })
  }

  // --- the browser's two-newline stand-in -------------------------------------------------------

  let heldBeforeBreak = -1
  el.addEventListener('beforeinput', (event) => {
    const e = event as InputEvent
    if (e.inputType !== 'insertLineBreak' && e.inputType !== 'insertParagraph') return
    heldBeforeBreak = heldText(el).length
  })

  el.addEventListener('input', (event) => {
    const e = event as InputEvent
    if (e.inputType !== 'insertLineBreak' && e.inputType !== 'insertParagraph') return
    const text = heldText(el)
    const was = heldBeforeBreak
    heldBeforeBreak = -1
    const sel = selectionOffsets(win, el)
    if (was < 0 || text.length - was !== 2 || sel === null) return
    // Measured rather than read off the text: a break that grew the text by two was answered with a
    // stand-in the composer takes back, since it draws the line itself.
    if (text[sel.start] === '\n') compensated = sel.start
  })

  // --- IME and the mutation funnel ---------------------------------------------------------------

  el.addEventListener('compositionstart', () => {
    composing = true
  })
  el.addEventListener('compositionend', () => {
    composing = false
    history.record(heldText(el), selectionOffsets(win, el))
    options.onEdit(heldText(el))
    redecorate()
  })

  const disposers: (() => void)[] = [
    () => { doc.removeEventListener('mouseup', onDocMouseUp, true) },
    () => { observer.disconnect() },
    () => { style.remove() },
  ]

  redecorate()

  return {
    leaving: () => { history.leaving(heldText(el)) },
    arrive: (key, original, _atStart) => {
      void _atStart
      const arrived = history.arrive(key, original)
      restoring = true
      observer.disconnect()
      el.textContent = arrived.shown
      observer.observe(el, OBSERVE)
      restoring = false
      decorate(win, el, drawWithAddress, colorFor)
      options.onEdit(arrived.shown)
      redecorate(true)
    },
    sent: () => {
      history.sent()
      opened = undefined
      options.onEdit('')
      redecorate()
    },
    adopt: (text, record) => {
      // A text replaced wholesale can put a different object where the open one stood; the open
      // state is validated (and dropped) by the next redecoration, and adopting is not the place
      // to carry it across.
      opened = undefined
      if (record) {
        history.record(text, selectionOffsets(win, el))
        redecorate()
        if (heldText(el) !== text) {
          // The recording pass did not produce the adopted text (an external write): write it.
          restoring = true
          observer.disconnect()
          el.textContent = text
          observer.observe(el, OBSERVE)
          restoring = false
          setSelection(win, el, text.length)
          decorate(win, el, drawWithAddress, colorFor)
          options.onEdit(text)
          redecorate()
        }
        return
      }
      restoring = true
      observer.disconnect()
      el.textContent = text
      observer.observe(el, OBSERVE)
      restoring = false
      setSelection(win, el, text.length)
      decorate(win, el, drawWithAddress, colorFor)
      options.onEdit(text)
      redecorate()
    },
    atDraft: () => history.atDraft,
    selection: () => selectionOffsets(win, el),
    undo: () => {
      const target = history.undo()
      if (target !== null) restore(target)
    },
    redo: () => {
      const target = history.redo()
      if (target !== null) restore(target)
    },
    dispose: () => {
      for (const dispose of disposers) dispose()
    },
  }
}
