# Archive

**Nothing in this folder is a source of truth.** These are superseded plans, one-off audits, and completed work orders, kept for historical context only. Do not use them to answer "how does the app work today" — that is [`../README.md`](../README.md) and the live references it points to.

| File | What it is | Status |
|------|-----------|--------|
| `implementation_plan.md` | The original build plan and early schema assumptions from project start | Superseded by `architecture.md` and `features.md` |
| `enhancements-batch-1-to-10.md` | A ten-item enhancement work order (collector pickers, expense placeholders, card heights, block grouping, fund close toggle, visit archiving, profile editing, contribution editing, admin contact display, extra categories) | **Shipped.** Behavior now documented in `features.md`. |
| `session_handling_analysis.md` | A point-in-time audit of session lifecycle, token refresh, navigation guards, and error resilience | Findings largely implemented in `AuthContext`; see `architecture.md` §2 for current behavior |
| `pwa-web-push-notifications-plan.md` | Design for PWA web push (service worker, subscription table, dispatch Edge Function) | **Not built.** Notifications remain Realtime + local `expo-notifications`. Read this before starting web push. |

Two former files were removed rather than archived because they only duplicated live docs:

- `platform-admin-setup.md` → merged into [`../platform-admin.md`](../platform-admin.md)
- `copilot-instructions.md` → its content lived in `.github/app-summary.md`, `../CLAUDE.md`, and `../architecture.md`

Both remain recoverable from git history.
