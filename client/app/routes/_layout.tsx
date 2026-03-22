import { NavLink, Outlet } from "react-router";

export default function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b">
        <div className="flex justify-between items-center px-4">
          <h1 className="text-xl font-bold text-gray-800">PMEGP</h1>
          <nav className="flex gap-8 items-center">
            <NavLink
              to="/chat"
              className={({ isActive }) =>
                `py-3 px-2 border-b-2 transition-colors ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`
              }
            >
              Chat
            </NavLink>
            <NavLink
              to="/data"
              className={({ isActive }) =>
                `py-3 px-2 border-b-2 transition-colors ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`
              }
            >
              Data
            </NavLink>
          </nav>
          <div className="flex gap-2">{/* empty div simply for positioning */}</div>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
