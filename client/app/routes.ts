import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  layout("routes/_layout.tsx", [
    route("chat", "routes/chat.tsx"),
    route("data", "routes/home.tsx"),
  ]),
] satisfies RouteConfig;
