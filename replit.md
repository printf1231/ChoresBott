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

- **Start**: `npm run build && PORT=5000 node .`
- **Build**: `npm run build` (lints + compiles TypeScript)
- **Workflow**: "Start application" runs on port 5000

## Storage

Uses a JSON file at `./data/choresbot.json` (auto-created on first write). No database required. Path configurable via `DATA_FILE` env var.

## Environment Variables

| Variable         | Description                          | Default                    |
|------------------|--------------------------------------|----------------------------|
| DISCORD_TOKEN    | Discord bot token (secret)           | (required)                 |
| DISCORD_CHANNEL  | Channel name to listen in            | chores                     |
| DATA_FILE        | Path to JSON data file               | ./data/choresbot.json      |
| PORT             | Web server port                      | 80                         |
| FREQUENCY        | Chore check interval (seconds)       | 120                        |
| VERBOSE          | Enable verbose logging               | false                      |
| LOCALE           | Date/time locale                     | en-US                      |
| TIMEZONE         | Timezone for display                 | America/New_York           |
| MORNING_TIME     | Start assigning chores               | 7:00 AM                    |
| NIGHT_TIME       | Stop assigning chores                | 11:00 PM                   |
| URL              | Server URL for links                 | localhost                  |

## Notes

- No Postgres needed — all data stored in a JSON file
- DISCORD_TOKEN is stored as a Replit secret
- Deployment target: VM (always running, needed for Discord bot)
