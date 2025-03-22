import {
	ColumnDef,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	useReactTable,
	SortingState,
	getSortedRowModel,
	ColumnFiltersState,
	getFilteredRowModel,
} from "@tanstack/react-table";
import { Button } from "../../ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../select";
import { useState } from "react";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
}

const pageSizeOptions = [10, 20, 30, 40, 50];

export function DataTable<TData, TValue>({
	columns,
	data,
}: DataTableProps<TData, TValue>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		onSortingChange: setSorting,
		getSortedRowModel: getSortedRowModel(),
		onColumnFiltersChange: setColumnFilters,
		getFilteredRowModel: getFilteredRowModel(),
		state: {
			sorting,
			columnFilters,
			pagination
		},
	});

	return (
		<div>
			<div className="rounded-md border">
				<table className="w-full table-fixed">
					<thead>
						{table.getHeaderGroups().map((headerGroup) => (
							<tr key={headerGroup.id} className="border-b">
								{headerGroup.headers.map((header, index) => {
									return (
										<th key={header.id} className={`p-2 text-left font-medium ${index === 0 ? 'w-[40%]' : 'w-[20%]'}`}>
											{header.isPlaceholder
												? null
												: flexRender(
													header.column.columnDef.header,
													header.getContext()
												)}
										</th>
									);
								})}
							</tr>
						))}
					</thead>
					<tbody>
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
								<tr
									key={row.id}
									className="border-b hover:bg-gray-300/30 dark:hover:bg-gray-900 text-gray-800 dark:text-gray-200 h-16"
									data-state={row.getIsSelected() && "selected"}
								>
									{row.getVisibleCells().map((cell, index) => (
										<td key={cell.id} className={`p-2 ${index === 0 ? 'w-[40%]' : 'w-[20%]'}`}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext()
											)}
										</td>
									))}
								</tr>
							))
						) : (
							<tr>
								<td colSpan={columns.length} className="h-16 text-center">
									No results.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
			<div className="flex items-center justify-between space-x-2 py-4">
				<div className="flex items-center space-x-2">
					<span className="text-sm text-gray-600">Rows per page:</span>
					<Select
						value={pagination.pageSize.toString()}
						onValueChange={(value) => setPagination((curr) => ({ ...curr, pageSize: Number(value) }))}
					>
						<SelectTrigger className="h-8 w-[70px]">
							<SelectValue placeholder={pagination.pageSize} />
						</SelectTrigger>
						<SelectContent>
							{pageSizeOptions.map((size) => (
								<SelectItem key={size} value={size.toString()}>
									{size}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center space-x-2">
					<div className="flex-1 text-sm text-gray-600">
						{table.getPaginationRowModel().rows.length} of {table.getFilteredRowModel().rows.length} row(s)
					</div>
					<div className="space-x-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => { setPagination((curr) => ({ ...curr, pageIndex: curr.pageIndex - 1 })); }}
							disabled={!table.getCanPreviousPage()}
						>
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => { setPagination((curr) => ({ ...curr, pageIndex: curr.pageIndex + 1 })); }}
							disabled={!table.getCanNextPage()}
						>
							Next
						</Button>
					</div>
					<div className="text-sm text-gray-600">
						Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
					</div>
				</div>
			</div>
		</div>
	);
} 