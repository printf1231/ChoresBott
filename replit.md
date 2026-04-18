# ChoresBot

A Discord bot to assist in household chore completion using a round-robin system. Includes a web-based dashboard to view chore lists.

## Architecture

- **Backend**: Node.js + Express (TypeScript), compiled to `dist/`
- **Frontend**: React + Webpack, pre-built to `client/dist/` (served statically by Express)
- **Database**: PostgreSQL (via `pg` driver)
- **Bot**: Discord.js v13

## Project Structure

```
src/           - Server-side TypeScript source
  api/         - Express route handlers
  external/    - DB (PostgreSQL) and Discord client wrappers
  logic/       - Chore assignment and command parsing
  models/      - TypeScript interfaces
  queries/     - SQL query definitions
  utility/     - Helpers (logging, env, mocks)
  main.ts      - Entry point
client/        - React frontend
  src/         - React components and pages
  dist/        - Pre-built frontend bundle
dist/          - Compiled server output
```

## Running

- **Dev (DEBUG mode, mock DB/chat)**: `cross-env DEBUG=true PORT=5000 node .`
- **Build**: `npm run build` (lints + compiles TypeScript)
- **Workflow**: "Start application" runs on port 5000

## Environment Variables

| Variable              | Description                                      | Default          |
|-----------------------|--------------------------------------------------|------------------|
| DISCORD_TOKEN         | Discord bot token                                | (required)       |
| DISCORD_CHANNEL       | Channel name to listen in                        | chores           |
| POSTGRESQL_ADDON_URI  | PostgreSQL connection string                     | (required)       |
| PORT                  | Web server port                                  | 80               |
| FREQUENCY             | Chore check interval (seconds)                   | 120              |
| DEBUG                 | Use mock DB/chat (no real credentials needed)    | false            |
| VERBOSE               | Enable verbose logging                           | false            |
| LOCALE                | Date/time locale                                 | en-US            |
| TIMEZONE              | Timezone for display                             | America/New_York |
| MORNING_TIME          | Start assigning chores                           | 7:00 AM          |
| NIGHT_TIME            | Stop assigning chores                            | 11:00 PM         |
| URL                   | Server URL for links                             | localhost        |

## Notes

- In DEBUG mode, uses in-memory mock data — no Discord token or DB needed
- Production deployment requires DISCORD_TOKEN and POSTGRESQL_ADDON_URI
- Deployment target: VM (always running, needed for Discord bot)
