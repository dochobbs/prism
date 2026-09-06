# Architecture

## Product identity and compatibility

The public repository is `https://github.com/dochobbs/prism`; package metadata,
app bundle/display name, menus, report exports, and default synthesis instruction
use Prism. Clone into `prism`; an existing checkout need not change folders.

The Electron internal app name `Clinical Council`, macOS bundle identifier
`md.hobbs.clinical-council`, `persist:council-*` partitions, and `council` local
protocol/IPC names deliberately remain stable. Changing these is not cosmetic:
it can change profile or security boundaries. Existing logins and encrypted key
settings continue using the existing userData location. Only the exact shipped
legacy system instruction is upgraded; custom instructions are preserved.
Historical verification receipts retain the names and paths actually tested.

## Runtime

The trusted local renderer owns query entry and result viewing. Three sandboxed
WebContentsViews each use their own `persist:council-<provider>` session. There is
no fourth browser for synthesis. Gemini Flash runs through a main-process API
request; remote views never receive a preload or application IPC.

The main process owns navigation, bounded DOM adapter execution and run state.
Only the local top-level renderer can invoke IPC. HTTPS navigation is permitted
inside remote views, including identity redirects; external protocols are denied.
Automation only executes on the exact configured service hosts. Popups remain in
the app and retain the provider session. Browser device permissions default off.

Queries and captured answers are held in memory until the user explicitly exports
a Markdown report. Browser services and their profiles may retain their own chat
history and cached content. Local execution does not mean queries stay offline.

All three views prewarm at startup. Dispatch waits for the loaded service's usable
composer. OE and DOX reset through their public entry pages in the existing
authenticated partitions; GPT uses its native new-conversation control without
navigating to a generic root. Every reset verifies an empty conversation and
composer before dispatch. Service URLs persist locally to retain workspace context. This
does not guarantee a provider's own account/workspace behavior; that is live-tested.

An immutable session ID and question own requested providers, activity, captures,
and synthesis provenance. Asking another provider adds to this session without
resending to completed/in-flight providers. New session invalidates late results,
clears in-memory captures, and immediately starts resetting all service pages.
Dispatch joins any pending reset rather than sending into the previous conversation.

Generation monitoring runs independently of the selected tab. Live services lays
out checkbox-selected pages side by side; clicking a service tab shows only that
service at full size. This is real rendering, not a spoofed visibility API. Inspecting
local settings/results may still hide service views; OE background behavior needs
live verification. No claim of guaranteed concurrent foreground focus is made.

Adapters use bounded answer containers and preserve HTTPS references. Explicit
answer-local completion controls can trigger immediate capture; otherwise a
two-second nonbusy text-stability fallback applies. This fallback is not proof of
completion. Ambiguous anonymous prose blocks are rejected, not truncated to the
last block or replaced with whole-page history. No private endpoints, cookie
scraping, or access-control bypasses are used.

When all requested sources finish, two/three-source sessions start one Gemini API
call; one-source sessions do not. An explicit ready subset can be synthesized
earlier, with omitted services recorded. Later captures retain the earlier result
until replacement. Synthesis inputs are snapshotted; source identities are OE,
GPT and DOX. Shared citation counts are application-derived distinct-service URL
matches, not independent evidence. No independent paper verification is claimed.

The system instruction, merge template and preferences are editable in Settings
and stored locally. The main process holds the API key; persistent storage uses
Electron safeStorage. The renderer receives only configuration status, never the
secret. Runtime diagnosis writes bounded readiness/visibility booleans to
`runtime-status.json` in app userData, excluding clinical text and credentials.

The responsive renderer is a potential shared phone surface. Mobile execution
requires a separate decision: authenticated Mac companion or standalone mobile
host. Neither a phone backend nor remote access has been added implicitly.
