import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Show as the primary title on mobile card. */
  primary?: boolean;
  /** Hide on mobile card (keep desktop only). */
  desktopOnly?: boolean;
};

/**
 * Desktop: standard table.
 * Mobile:  stacked cards with label/value pairs. No horizontal scroll.
 */
export function ResponsiveTable<T>({
  rows,
  columns,
  rowKey,
  empty,
  actions,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  empty?: ReactNode;
  actions?: (row: T) => ReactNode;
}) {
  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground">{empty ?? "No rows."}</div>;
  }
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              {columns.map((c) => (
                <th key={c.key} className={`py-1 pr-3 ${c.align === "right" ? "text-right" : ""}`}>
                  {c.header}
                </th>
              ))}
              {actions && <th className="py-1"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={rowKey(row, i)} className="border-t align-top">
                {columns.map((c) => (
                  <td key={c.key} className={`py-1 pr-3 ${c.align === "right" ? "text-right" : ""}`}>
                    {c.cell(row)}
                  </td>
                ))}
                {actions && <td className="py-1 whitespace-nowrap">{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {rows.map((row, i) => {
          const primary = columns.find((c) => c.primary) ?? columns[0];
          const rest = columns.filter((c) => c.key !== primary.key && !c.desktopOnly);
          return (
            <div key={rowKey(row, i)} className="rounded-lg border p-3 space-y-2">
              <div className="text-sm font-medium">{primary.cell(row)}</div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {rest.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-muted-foreground">{c.header}</dt>
                    <dd className={c.align === "right" ? "text-right" : ""}>{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
              {actions && <div className="pt-1 flex gap-1">{actions(row)}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
