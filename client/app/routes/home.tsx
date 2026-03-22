import { ProjectsTable } from "../../components/projects-table";
import type { Route } from "./+types/home";

export async function loader() {
  try {
    const response = await fetch("http://localhost:5000/api/projects");
    const projects = await response.json();
    return { projects };
  } catch (error) {
    console.error("Error fetching projects:", error);
    return { projects: [] };
  }
}

export function meta() {
  return [
    { title: "PMEGP Projects" },
    { name: "description", content: "PMEGP Projects Information" },
  ];
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <ProjectsTable projects={loaderData.projects} />;
}
