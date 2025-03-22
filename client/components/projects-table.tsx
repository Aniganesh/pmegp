import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { DataTable } from "./ui/data-table/data-table";
import { DataTableColumnFilter } from "./ui/data-table/column-filter";
import { RangeFilter } from "./ui/data-table/range-filter";
import { Button } from "./ui/button";
import type { Project } from "../lib/types";

interface ProjectsTableProps {
	projects: Project[];
}

export function ProjectsTable({ projects }: ProjectsTableProps) {

	// Extract unique categories from projects
	const uniqueCategories = Array.from(new Set(projects.map(project => project.category)));

	const columns: ColumnDef<Project>[] = [
		{
			accessorKey: "title",
			header: ({ column }) => (
				<div className="flex gap-2 items-center" role="button"

					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Title
					<ArrowUpDown className="ml-2 h-4 w-4" />

					<DataTableColumnFilter
						column={column}
						title="title"
						placeholder="Filter by title..."
					/>
				</div>
			),
		},
		{
			accessorKey: "category",
			header: ({ column }) => (
				<div className="flex gap-2 items-center">
					Category
					<select
						onChange={(e) => {
							const selectedCategory = e.target.value;
							column.setFilterValue(selectedCategory);
						}}
						className="ml-2 border rounded"
					>
						<option value="">All</option>
						{uniqueCategories.map(category => (
							<option key={category} value={category}>{category}</option>
						))}
					</select>
				</div>
			),
		},
		{
			accessorKey: "cost",
			filterFn: (row, columnId, filterValue) => {
				const value = parseFloat(row.getValue(columnId));
				const minValue = filterValue.min ? parseFloat(filterValue.min) : undefined;
				const maxValue = filterValue.max ? parseFloat(filterValue.max) : undefined;

				if (minValue !== undefined && value < minValue) return false;
				if (maxValue !== undefined && value > maxValue) return false;
				return true;
			},
			header: ({ column }) => (
				<div className="flex gap-2 items-center"
					role="button"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Cost (₹)
					<ArrowUpDown className="ml-2 h-4 w-4" />
					<RangeFilter
						column={column}
						title="Cost Range"
					/>
				</div>
			),
			cell: ({ row }) => {
				const cost = parseFloat(row.getValue("cost"));
				const formatted = new Intl.NumberFormat("en-IN", {
					style: "currency",
					currency: "INR",
				}).format(cost);
				return <div>{formatted}</div>;
			},
		},
		{
			accessorKey: "pdfUrl",
			header: () => <div className="font-medium text-gray-900 dark:text-gray-100">PDF</div>,
			cell: ({ row }) => {
				const pdfUrl = row.getValue("pdfUrl") as string;
				const title = row.getValue("title") as string;
				return (
					<a
						href={pdfUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="text-blue-600 hover:underline"
					>
						View PDF
					</a>
				);
			},
		},
	];
	console.log({ projects });

	return (
		<div className="container mx-auto py-6">
			<h1 className="text-2xl font-bold mb-6">PMEGP - Info</h1>
			<DataTable columns={columns} data={projects} />
		</div>
	);
} 