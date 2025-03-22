import { Column } from "@tanstack/react-table";
import { Input } from "../input";

interface RangeFilterProps<TData> {
  column: Column<TData, unknown>;
  title: string;
}

export function RangeFilter<TData>({
  column,
  title,
}: RangeFilterProps<TData>) {


  

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium">{title}</div>
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder="Min"
          value={(column.getFilterValue() as any)?.min}
          onChange={(e) => {
            column.setFilterValue({ min: e.target.value, max: (column.getFilterValue() as any)?.max });
          }}
          className="h-8 w-[100px]"
        />
        <Input
          type="number"
          placeholder="Max"
          value={(column.getFilterValue() as any)?.max}
          onChange={(e) => {
            column.setFilterValue({ min: (column.getFilterValue() as any)?.min, max: e.target.value });
          }}
          className="h-8 w-[100px]"
        />
      </div>
    </div>
  );
} 