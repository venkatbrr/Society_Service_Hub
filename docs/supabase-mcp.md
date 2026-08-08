# Supabase MCP Server

Client-agnostic setup for the official [Supabase MCP server](https://github.com/supabase-community/supabase-mcp), scoped to this project (`mbzvcaoulawdugfearmj`).

The server is a plain stdio MCP process — **nothing about it is Claude-specific**. Every MCP-capable tool (Claude Code, Cursor, VS Code Copilot, Windsurf, Cline, Zed, Claude Desktop, JetBrains AI, custom SDK agents) launches the same command. Only the config file each tool reads differs, so the per-client files in this repo are thin wrappers around one canonical block.

---

## 1. Canonical server definition

```json
{
  "command": "npx",
  "args": [
    "-y",
    "@supabase/mcp-server-supabase@latest",
    "--project-ref=mbzvcaoulawdugfearmj"
  ]
}
```

**There is deliberately no `env` block.** The server reads `SUPABASE_ACCESS_TOKEN` from the inherited process environment (see §2), which works identically in every client and keeps the token out of every config file. Adding `"env": {"SUPABASE_ACCESS_TOKEN": "${env:SUPABASE_ACCESS_TOKEN}"}` is actively harmful — see §7.

`--project-ref` pins the server to this one project. Without it the server also exposes account-level tools that can list and create other projects — leave it in.

**Access mode: full read-write.** `--read-only` is deliberately *not* set, so `execute_sql` can write and `apply_migration` is available. See §6.

---

## 2. One-time setup

### Create a personal access token

1. Go to <https://supabase.com/dashboard/account/tokens>
2. **Generate new token**, name it something traceable (e.g. `mcp-local-dev`)
3. Copy it — it is shown once

The token carries your full Supabase account permissions. Treat it like a password.

### Store it as an OS environment variable

Every config file in this repo references `SUPABASE_ACCESS_TOKEN` rather than embedding the token, so the secret lives in exactly one place and none of the configs are secrets.

Windows (PowerShell, user-level — persists across reboots):

```powershell
[Environment]::SetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'sbp_xxxxxxxxxxxx', 'User')
```

macOS / Linux — add to `~/.zshrc` or `~/.bashrc`:

```bash
export SUPABASE_ACCESS_TOKEN="sbp_xxxxxxxxxxxx"
```

Then **fully restart** the editor/terminal. GUI editors read the environment at process start, so a reload-window is usually not enough — quit and relaunch.

---

## 3. Per-client config

| Client | Config file | Status |
|--------|-------------|--------|
| Claude Code | [`.mcp.json`](../.mcp.json) | ✅ in repo |
| Cursor | [`.cursor/mcp.json`](../.cursor/mcp.json) | ✅ in repo |
| VS Code (Copilot / Agent mode) | [`.vscode/mcp.json`](../.vscode/mcp.json) | ✅ in repo |
| Antigravity | `~/.gemini/config/mcp_config.json` | ✅ configured (global) |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | paste §1 under `mcpServers` |
| Cline / Roo | `cline_mcp_settings.json` (MCP Servers → Configure) | paste §1 under `mcpServers` |
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` | paste §1 under `mcpServers` |
| Zed | `settings.json` → `context_servers` | paste §1 |
| Custom SDK agent | Register as a stdio server with the same command/args | — |

Notes on the three checked-in files:

- All are project-scoped, so they apply automatically when the repo is opened. They contain no secrets and are safe to commit.
- VS Code uses `"servers"` (not `"mcpServers"`) and needs `"type": "stdio"`. It resolves `${env:VAR}`.
- Claude Code resolves `${VAR}`; it will prompt once to approve a project-scoped server on first launch.
- None of them declare `env` — all four rely on process-environment inheritance, which behaves the same everywhere and needs no client-specific expansion syntax. See §7 for why adding one back is a trap.

**Antigravity** is global-only — it has no project-scoped MCP file, so its entry lives in `~/.gemini/config/mcp_config.json` alongside whatever other servers are registered there. Because that config is global, the Supabase server is visible in *every* project you open in Antigravity, not just this one — `--project-ref` still confines it to `mbzvcaoulawdugfearmj`. Antigravity also keeps an empty `~/.gemini/antigravity-ide/mcp_config.json`; the `config/` one is the live file.

---

## 4. Tools this exposes

| Group | Representative tools |
|-------|---------------------|
| Database | `list_tables`, `list_extensions`, `list_migrations`, `apply_migration`, `execute_sql` |
| Development | `get_project_url`, `get_anon_key`, `generate_typescript_types` |
| Debugging | `get_logs` (Postgres, PostgREST, auth, edge functions), `get_advisors` (security + performance lint) |
| Edge Functions | `list_edge_functions`, `get_edge_function`, `deploy_edge_function` |
| Branching | `create_branch`, `merge_branch`, `reset_branch`, `rebase_branch` (paid plans) |
| Docs | `search_docs` — queries the live Supabase docs GraphQL API |

Storage tools are off by default. To enable them, add an explicit feature list:

```
"--features=database,docs,debugging,development,functions,branching,storage"
```

`get_advisors` is the high-value one for this repo — it flags tables with RLS disabled and missing-index/unindexed-FK problems across the whole schema.

---

## 5. Relationship to the existing migration workflow

The MCP server **supplements** the workflow in [`CLAUDE.md`](CLAUDE.md) §Deploying Database Changes; it does not replace it.

Keep doing this for schema changes:

1. Write the SQL file in `supabase/migrations/`
2. `npm run db:push`
3. `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj`
4. `npx tsc --noEmit`

The migration file in git stays the source of truth. `apply_migration` writes a migration directly to the remote database **without** creating a local file, which silently desyncs `supabase/migrations/` from the deployed schema — avoid it for anything you intend to keep.

Use the MCP tools instead for the things the CLI makes tedious: inspecting live schema and RLS policies, ad-hoc queries, reading logs after a failed request, and running the security/performance advisors.

---

## 6. Troubleshooting

### `Please provide a personal access token (PAT) ...` and the process exits 1

The client's process environment predates the `SUPABASE_ACCESS_TOKEN` variable. GUI editors snapshot the environment at launch, so **fully quit and relaunch** — a window reload, "Restart MCP Server", or opening a new terminal inside the editor is not enough. On Windows check no `Code`/`Cursor`/`Antigravity` processes survive in Task Manager before relaunching.

**Do not "fix" this by adding an `env` block with `${env:SUPABASE_ACCESS_TOKEN}`.** When the client's own environment lacks the variable, that expression expands to an *empty string*, and an explicitly-empty `env` entry **overrides** the value the child process would otherwise inherit — so it converts a problem that a restart would fix into one that survives every restart. This is what caused the first VS Code failure here.

To confirm the server itself is healthy independent of any client, run a handshake in a shell that has the variable:

```powershell
$env:SUPABASE_ACCESS_TOKEN = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1.0"}}}' |
  npx -y @supabase/mcp-server-supabase@latest --project-ref=mbzvcaoulawdugfearmj
```

A JSON response instead of the PAT error means the config is fine and only the client needs restarting. A healthy server exposes 20 tools.

### Verify the token itself

```powershell
$t = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')
Invoke-RestMethod -Uri 'https://api.supabase.com/v1/projects' -Headers @{ Authorization = "Bearer $t" } |
  Select-Object id, name, region
```

`mbzvcaoulawdugfearmj` must appear. If the call 401s, the token is bad; if the project is absent, the token belongs to a different Supabase account.

---

## 7. Security notes

- **Point it at a development project, not production, wherever possible.** In read-write mode a malformed statement reaches the live database directly; the client's tool-approval prompt is the only guardrail.
- **Prompt injection is a real risk in read-write mode.** The server reads rows out of your database and hands them to a model. Untrusted user-generated content — which this app has plenty of (posts, complaints, provider notes) — can carry instructions. Review every `execute_sql` and `apply_migration` call before approving it.
- To harden later, add `--read-only` to the `args` array in each config. Inspection, logs, advisors, and type generation all keep working; only writes are blocked.
- Rotate the token at <https://supabase.com/dashboard/account/tokens> if it is ever pasted into a file, a chat, or a screenshot.
- The token is account-wide, not project-wide. `--project-ref` limits the *server*, not the credential.
