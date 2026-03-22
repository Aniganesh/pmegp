module.exports = {
  apps: [{
    name: "pmegp-server",
    script: "cd server && pnpm i && pnpm run build && pnpm run start",

  }, {
    name: "pmegp-client",
    script: "cd client && pnpm i && pnpm run build && pnpm run start",
  }
  ]
}