/**
 * Browser entry for the shared widget row: the widget library import face.
 * The plugin mount is inert — the module exists to answer
 * `dsh.client.external` requests, not to contribute to any slot or service.
 */
import type { Context } from '@deepseek-ai/cordis'

export { FittedRun, ScrollingRun } from './Run.tsx'
export type { FittedRunProps, ScrollingRunProps, RunAlign, RunJustify, RunRoom } from './Run.tsx'
export {
  minContentWidth, settledWidths, showsItsContent, Table, TableGroup, tableColumnLine, tableLaneLine,
} from './Table.tsx'
export type {
  TableColumnCells, TableColumnFloor, TableColumnLayout, TableGroupProps, TableProps,
} from './Table.tsx'
export { bandOffset, TableGutter, TableSeam } from './TableBand.tsx'
export type { BandBounds, TableGutterProps, TableSeamProps } from './TableBand.tsx'
export { runId, runsBy, runsWithin, tableRunRows } from './table-runs.ts'
export type { TableRun } from './table-runs.ts'
export { TableSash, useTableResize } from './TableSash.tsx'
export type { TableResizeController, TableSashProps, UseTableResizeOptions } from './TableSash.tsx'
export { byText, dropSort, orderedBy, sortRows, toggleSort } from './table-order.ts'
export type { ColumnSort, Ordering, SortDirection, TableColumn } from './table-order.ts'
export { resizeWidths } from './table-resize.ts'

/**
 * Mount nothing: the row's factories answer module-table requests only.
 * @param ctx - Browser context; unused, every export above is render-only.
 */
export function apply(_ctx: Context): void {}
