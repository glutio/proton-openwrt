# Native GL.iNet Proton page

Verified on GL-MT3000 firmware **4.11.0**, October 30, 2026.

## Extension choice and minimum components

Proton is a **VPN -> Proton VPN** submenu page, alongside the existing VPN
pages. It is not a new tile inside the built-in provider picker.

The installed provider path has no exposed external-provider registration
hook: `/usr/lib/oui-httpd/rpc/wg_client` takes `provider_list` from the compiled
`gl.wg_client` module; `get_provider_server_list` and `generate_provider_config`
dispatch through that registry. `/etc/init.d/init_new_provider.sh` initializes
known providers. The generic provider form also retains provider credentials,
which is inappropriate for this integration.

Instead, the installed OUI file-based menu/view/RPC mechanisms work without
patching vendor bundles, compiled modules, or other providers:

| Component | Purpose / installed location |
|---|---|
| `ui/menu.json` | Additive `/usr/share/oui/menu.d/proton-vpn.json` |
| `ui/proton-vpn.js` | Vue 2 render component, `/www/views/gl-sdk4-ui-proton-vpn.common.js` and `.gz` |
| `ui/rpc.lua`, `ui/validator.lua` | Authenticated module `/usr/lib/oui-httpd/rpc/proton-vpn` and its validator |
| `src/web_worker.lua`, `src/lib/proton/web.lua` | Private request transport, validation, public-data allowlists and calls to the existing backend |
| `install-ui.sh`, `remove-ui.sh` | Installation/removal; no VPN restart |

Installed authorities:

- `/www/js/app.ab987315.js.gz`: route loader fetches
  `/views/gl-sdk4-ui-${view}.common.js`, evaluates the component and loads it
  into the existing router. The addon returns component options directly;
  no frontend build or extra Vue installation is needed.
- `/usr/share/oui/menu.d/`: existing VPN and addon menu declarations.
- `/usr/share/gl-ngx/oui-rpc.lua`: `rpc_method_call` requires native admin
  session/ACL access before dispatch. No no-auth entry is added.
- `/usr/lib/lua/oui/rpc.lua`: `M.call`, `valid_rpc`, module-file loading.
- `/usr/share/gl-ngx/oui-init.lua`: `ngx.pipe.spawn` and its command proxy.
- `/usr/share/gl-ngx/oui-access.lua`: existing HTTP access/Host checks.

These are observed internal firmware interfaces, not a cross-version
compatibility promise. The tradeoff is one removable native submenu rather
than a first-class provider tile requiring vendor changes.

## Behavior and privacy

Open the router web interface, expand **VPN**, and choose **Proton VPN**.
The page reuses the saved session immediately; installation and page loading
do not log out, log in, change profiles, or connect.

The page first loads only countries, with USA first and the rest sorted by
their displayed English names rather than codes. Choose a country to load its cities,
then a city to load its nodes. Optionally filter by node name, select a node,
and click **Connect / switch server**. Nodes are sorted by lowest load first;
load percentages reflect the displayed catalogue age. Existing registrations/native profiles are
reused. The optional tunnel ID resolves installations with multiple tunnels.
The existing VPN Dashboard displays the active **Proton CLI** group/profile.

The compact layout keeps Sign out beside the title, country/city on one row,
and connection actions together below the node list. Optional tunnel selection
is under Advanced. Catalogue controls and a static last-update timestamp live
in the footer; no elapsed-seconds counter is displayed.
The node list shows 12 rows, and connected status is green.
The panel reuses the firmware's native card, inherited font, theme colors and
locally installed icon fonts. Icons are decorative; button and field labels
remain text. No fonts, icon packages or other frontend dependencies are added.

Node labels show Proton's advertised Secure Core, Tor, P2P, Streaming and
IPv6-server flags. Every listed endpoint has passed the existing WireGuard
endpoint checks. The heading identifies this client's WireGuard/IPv4 transport:
an IPv6-server label describes the server, not IPv6 support in these profiles.
Other protocols are not inferred. Flags arrive with the normal catalogue fetch.

**Disconnect Proton** only disables the tunnel while it still references the
managed Proton group. It retains the original connection snapshot.
**Restore original VPN** restores the original enabled state and complete
fallback list through GL.iNet, without requiring Proton authentication.
Routing rules, DNS options, kill switch and other tunnel settings are not
replaced. Actual native handoffs are asynchronous.

Status polls every five seconds only while the page is mounted. A Proton
connection is reported connected only when the native connected status,
active group/peer's match with the tunnel's configured profile selection,
intended interface public key, and intended peer's nonzero handshake match.
This rejects an old profile's connected status while a handoff is pending.
The dashboard consumes native status over WebSocket while this page polls RPC;
their visible updates can still arrive at different times.
The last verified handshake is displayed; an old handshake alone is not
treated as proof of new traffic. HTTPS connectivity was separately tested.

Login supports the existing SRP/TOTP implementation. Enter a current six-digit
TOTP with the password if enabled. A missing code requires a fresh submission;
there is no pending-authentication service. Username/password/TOTP are cleared
from the form immediately on submission and never put in URLs, browser storage,
or subprocess arguments. Password/TOTP are transiently handled by the browser,
as explicitly allowed. On HTTP, the sign-in form warns that transport is
unencrypted; that warning is not shown while the saved session is in use.
TLS configuration is intentionally left unchanged.

**Sign out** revokes the API session but does not stop the VPN, revoke cached
WireGuard keys, or delete native profiles. Use Disconnect/Restore separately.
Existing-session reauthentication must use the same Proton account when
retaining its imported profiles; switching accounts with that existing cache
is not supported.

The addon uses the existing `Admin-Token` session through `window.$rpcRequest`,
not a separate public endpoint or authentication scheme. For example, native
POST `/rpc` receives:

```json
{"jsonrpc":"2.0","id":1,"method":"call","params":["SID","proton-vpn","servers",{"country":"US","city":"Chicago"}]}
```

Methods: `status`, `countries`, `cities`, `servers`, `refresh_catalog`, `login`, `logout`, `connect`,
`disconnect`, `restore`. Login accepts `username`, `password`, optional `totp`;
connect accepts `server` and optional numeric `tunnel_id`. Tokens, private keys,
raw native configurations and raw errors are never returned. Server records
contain only name/city/load/tier and numeric feature flags; status is also explicitly allowlisted.

`countries` returns `{countries:[{country,servers}],cache}`; `cities` takes a
two-letter `country` and returns `{cities:[{city,servers}],cache}`. `servers`
takes `country`/`city` and returns `{servers:[{name,city,load,tier,features}],cache}`.
An omitted city still supports already-open pre-upgrade pages; the new page
always requests one city. Missing cities use the `Unspecified` bucket.

The private `/etc/proton-openwrt/catalog.json` cache contains only the current
session UID, fetch timestamp, and allowlisted name/country/city/load/tier/features fields.
No API tokens, private keys, physical peer data or account response are cached
there. The directory remains `0700`, file `0600`; successful writes are atomic.
Cache access requires a saved VPN-scope session with the same UID. Logout
(including CLI logout) or rejected refresh credentials remove it; a different
session cannot reuse it. Web login reuses its initial discovery to populate it.

`cache` contains Unix `fetched_at`, `expires_at` (fetch + 300 seconds), and
`stale`. Clock rollback also makes the cache stale. Fresh and stale reads do
not acquire the account lock or call Proton. Stale data is rendered first;
the browser then issues a separate `refresh_catalog` request. It rechecks
freshness under the existing exclusive lock before fetching, preventing
duplicate refreshes. The refresh button sends `{force:true}`. No timer
downloads catalogues: refresh is lazy on stale browsing/page opening or explicit.

The footer shows a static fetch date/time, background progress and refresh errors;
saved selectors remain usable while refresh runs. Successful refresh queues
list updates on the next five-second status poll, preserving valid selections
and search. Transient fetch failures retain the previous cache without extending
its TTL. Connect always uses fresh entitlement/physical-endpoint validation,
never cached authorization. No VPN operation is retried automatically.

Only a cold miss or refresh can contend for the account lock. Those read-only
operations return `{busy:true}`; the page retries once per second, up to 60
times. Cached browsing remains available even then. Leaving the page stops
recovery and prevents abandoned follow-up requests. The CLI's exclusive
mutation locking is unchanged.

Lua 5.1 RPC creates a root-private `mktemp` file, mode `0600`, and supplies only
its path/action to Lua 5.4. The worker validates and holds the original file
descriptor, truncates credential input before authentication, writes sanitized
JSON through that descriptor, and prints only a small completion marker.
This handles the full US list without carrying it on the vendor command
proxy's stdout. Ordinary completion/error removes the file. The held descriptor
prevents recreating/following a replaced filename after a timeout.
Cosocket operations stay outside Lua 5.1 `pcall`, which cannot yield here.
Proton state uses the existing private store and exclusive mutation lock.

## Installation

Use **[INSTALL.md](../INSTALL.md)** for the single installation, update, removal
and factory-reset recovery procedure. The backend must be installed before
the web addon. Both installers use the same staged source archive.

The addon installer checks syntax and gracefully reloads nginx, not networking.
It refuses existing entry points and updates only this project's own modules;
no vendor bundles are patched. Removal leaves the backend, private state,
native profiles and active VPN intact. Removal/reinstallation were verified
without changing the active connection or saved login.

## Tests and limitations

On the staged router source:

```sh
cd /tmp/proton-openwrt
lua5.4 -e 'package.path="./src/lib/?.lua;"..package.path;dofile("tests/run.lua")'
lua tests/rpc.lua
sh tests/worker.sh
sh -n install-ui.sh
sh -n remove-ui.sh
```

Development-only browser checks need Node.js, installed Chrome and the pinned
Playwright dependency; none are installed on the router:

```powershell
cd proton-openwrt\tests
npm ci --ignore-scripts --no-fund --no-audit
node ui.cjs open "$env:TEMP\proton-openwrt-browser"
# Sign in to the router in that isolated window; run from another terminal:
npm run test:ui
```

`npm test` runs focused progressive browsing, refresh and contention tests.
The installed component can also be rendered in headless Chrome using the
router's own Vue runtime and SSH-bridged, read-only native RPC:

```powershell
node ui.cjs component <ssh-key>
```

This component check uses an isolated transient browser, no admin/Proton
credentials and no authentication bypass exposed to LAN browsers. The SSH
process uses the existing root-local bridge; the test cannot connect,
disconnect, restore, log in or log out. It supplements, rather than replaces,
the authenticated native-route checks above.

To reproduce cache/lock behavior against the actual router:

```powershell
node contention.cjs <ssh-key>
```

That test warms the catalogue, ages only its timestamp while holding the real
account lock, then confirms immediate country/city/node reads and busy
background refresh. It releases the lock, refreshes the cache and checks
selection preservation. The test records real HTTP timings/response sizes;
it never requests VPN or account mutations.

These checks use real saved-session discovery and mock only frontend
login/logout to preserve the account. They never click real connection buttons.
Close the isolated browser and remove that test profile after use.

Real login/logout were deliberately not repeated. The existing backend's
SRP/TOTP tests and mocked browser form tests cover those paths. English-only
labels, no provider-picker tile, no CAPTCHA/human verification, no FIDO2-only
login and existing IPv4-profile limitations remain. No IPv6- or DNS-leak
protection claim is added.
