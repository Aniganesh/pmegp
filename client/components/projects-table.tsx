import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import type { Project } from "../lib/types";
import { DataTableColumnFilter } from "~/components/ui/data-table/column-filter";
import { RangeFilter } from "~/components/ui/data-table/range-filter";
import { DataTable } from "~/components/ui/data-table/data-table";
import { Select, SelectContent, SelectTrigger, SelectValue, SelectItem } from "./ui/select";

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
				<div className="flex gap-2 items-center"
				>
					<div className="flex gap-2 items-center"
						role="button"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
						Title
					</div>
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
					<Select
						onValueChange={(value) => {
							if(value === "all") {
								column.setFilterValue(undefined);
							} else {
								column.setFilterValue(value);
							}
						}}
					>
						<SelectTrigger className="border rounded">
							<SelectValue placeholder="Filter by category..." />
						</SelectTrigger>
						<SelectContent >
							<SelectItem value="all">All</SelectItem>
							{uniqueCategories.map(category => (
								<SelectItem key={category} value={category}>{category}</SelectItem>
							))}
						</SelectContent>
					</Select>
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
				<div className="flex gap-2 flex-col justify-center items-start">
					<div className="flex gap-2 items-center"
						role="button"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
						Cost (₹)
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</div>
					<RangeFilter
						column={column}
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
			<h1 className="text-2xl font-bold mb-4 text-center">PMEGP - Info</h1>
			<p className="text-sm text-gray-600 dark:text-gray-400 mb-6 italic">
				All information is sourced from the PMEGP portal at{" "}
				<a
					href="https://www.kviconline.gov.in/pmegp/pmegpweb/docs/jsp/newprojectReports.jsp"
					target="_blank"
					rel="noopener noreferrer"
					className="text-blue-600 hover:underline"
				>
					kviconline.gov.in
				</a>
				. This website does not claim any copyrights to the information presented.
				The data is displayed for educational purposes and easier accessibility only.
			</p>
			<DataTable columns={columns} data={projects} />
		</div>
	);
} 