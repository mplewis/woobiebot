# WoobieBot

WoobieBot is a Discord bot that indexes files from a directory, allows users to search for them via Discord commands, and serves files through a web server with proof-of-work CAPTCHA protection and rate limiting. Files are served through signed, expiring URLs to prevent unauthorized access.

## Usage (Docker)

Pull and run the latest image:

```bash
docker pull <username>/woobiebot:latest

docker run -d \
  --name woobiebot \
  -p 3000:3000 \
  -v /path/to/files:/app/files \
  -e DISCORD_TOKEN=your-token \
  -e DISCORD_CLIENT_ID=your-client-id \
  -e SIGNING_SECRET=your-secret-min-32-chars \
  <username>/woobiebot:latest
```

## Local Development

Install dependencies:

```bash
pnpm install
```

Generate a fresh secret for `SIGNING_SECRET`:

```bash
openssl rand -hex 32
```

Copy example environment file and configure (add `SIGNING_SECRET` here):

```bash
cp .env.example .env
# Edit .env with your values
```

Run in development mode:

```bash
pnpm dev
```

Run tests:

```bash
pnpm test
```

Build for production:

```bash
pnpm build
pnpm start
```

## Discord Slash Commands

WoobieBot automatically deploys slash commands on startup:

- **Global deployment**: Commands are always deployed globally and will appear in all servers after up to 1 hour of Discord propagation delay
- **Guild-specific deployment**: If `DISCORD_GUILD_IDS` is set, commands are also deployed to those specific guilds for instant availability

For development/testing, add your test server IDs for immediate command availability:

```bash
DISCORD_GUILD_IDS=123456789012345678,234567890123456789
```

## Configuration

| Variable                  | Type   | Default                       | Required | Description                                                                                       |
| ------------------------- | ------ | ----------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`           | string | -                             | Yes      | Discord bot token                                                                                 |
| `DISCORD_CLIENT_ID`       | string | -                             | Yes      | Discord application client ID                                                                     |
| `DISCORD_GUILD_IDS`       | string | -                             |          | Comma-separated guild IDs for instant command deployment (also deploys globally)                  |
| `SIGNING_SECRET`          | string | -                             | Yes      | Secret key for signing URLs (min 32 characters)                                                   |
| `FILES_DIRECTORY`         | string | `./files`                     |          | Directory to index for files                                                                      |
| `FILE_EXTENSIONS`         | string | `pdf,txt,doc,docx,zip,tar,gz` |          | Comma-separated list of file extensions to index                                                  |
| `WEB_SERVER_PORT`         | number | `3000`                        |          | Port for the web server                                                                           |
| `WEB_SERVER_HOST`         | string | `0.0.0.0`                     |          | Host address for the web server                                                                   |
| `WEB_SERVER_BASE_URL`     | string | `http://localhost:3000`       |          | Base URL for generating download links                                                            |
| `URL_EXPIRY_SEC`          | number | `600`                         |          | URL expiration time in seconds                                                                    |
| `CAPTCHA_CHALLENGE_COUNT` | number | `50`                          |          | Number of CAPTCHA challenges to present                                                           |
| `CAPTCHA_DIFFICULTY`      | number | `4`                           |          | CAPTCHA difficulty level                                                                          |
| `DOWNLOADS_PER_HR`        | number | `10`                          |          | Maximum downloads per user per hour                                                               |
| `RATE_LIMIT_STORAGE_DIR`  | string | `tmp/rate_limit`              |          | Directory to store rate limit state                                                               |
| `SEARCH_MIN_CHARS`        | number | `3`                           |          | Minimum character length for search queries                                                       |
| `SEARCH_THRESHOLD`        | number | `0.6`                         |          | Fuzzy search threshold (0-1, higher = more fuzzy)                                                 |
| `SCAN_INTERVAL_MINS`      | number | `15`                          |          | File index rescan interval in minutes (supports decimals, e.g., 0.5 for 30s; set to 0 to disable) |
| `LOG_LEVEL`               | string | `info`                        |          | Logging level (fatal, error, warn, info, debug, trace)                                            |
