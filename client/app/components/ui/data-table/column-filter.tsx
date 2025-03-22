import * as React from "react";
import type { Column } from "@tanstack/react-table";

interface DataTableColumnFilterProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: string;
  placeholder: string;
}

export function DataTableColumnFilter<TData, TValue>({
  column,
  title,
  placeholder,
}: DataTableColumnFilterProps<TData, TValue>) {
  const columnFilterValue = column.getFilterValue() as string;

  return (
    <div className="flex items-center space-x-2">
      <input
        type="text"
        value={columnFilterValue ?? ""}
        onChange={(e) => column.setFilterValue(e.target.value)}
        placeholder={placeholder}
        className="max-w-sm border px-3 py-2 rounded text-sm"
        aria-label={`Filter by ${title}`}
      />
    </div>
  );
} 