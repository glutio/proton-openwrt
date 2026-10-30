# Testing

Validated on a GL.iNet GL-MT3000, firmware 4.11.0 (OpenWrt 21.02-SNAPSHOT).

## Automated tests

On the router, from a staged source copy:

```sh
cd /tmp/proton-openwrt
lua5.4 -e 'package.path="./lib/?.lua;"..package.path;dofile("tests/run.lua")'
lua tests/rpc.lua
sh tests/worker.sh
```

`tests/run.lua` (**30 tests**, Lua 5.4) uses mocks only; it never logs in,
registers keys or switches VPNs. Coverage: strict base64, signed-modulus
verification, deterministic SRP (ASCII/UTF-8/long passwords) checked against an
independent Python/bcrypt oracle, unsafe SRP challenge rejection, TOTP scope
promotion and FIDO2-only rejection, single refresh/replay, API errors and rate
limits, server eligibility filtering, Ed25519/WireGuard keys, per-server
registration, lost-registration recovery and renewal, native import/readback,
edited-profile refusal, switching and restoring the original fallback list,
handoff readiness, catalogue cache TTL/isolation, web input validation and
atomic private storage/locking.

`tests/rpc.lua` covers the Lua 5.1 RPC transport. `tests/worker.sh` checks
private response-file handling and symlink refusal.

Frontend unit tests (development machine, Node.js):

```sh
cd tests
node --test ui-unit.cjs
```

Optional browser checks render the installed page in headless Chrome against
the router's read-only RPC (`node ui.cjs component <ssh-key>`) or measure cache
and lock behavior (`node contention.cjs <ssh-key>`). They need Node.js, Chrome
and `npm ci` in `tests`; nothing is installed on the router.

## Live validation

Performed with a real Proton account:

- Authenticated discovery, token refresh, and automatic 401 refresh/replay.
- Persistent key registration and renewal.
- Inactive native profile import with all other configuration unchanged.
- Connect, direct server-to-server switch, disconnect and restore through both
  the CLI and the web page, verified by matching kernel keys, fresh handshakes,
  interface-bound HTTPS and the native VPN Dashboard.
- Restore returned the original profile list, rules, DNS and kill switch.

`connect`/`restore` acknowledge a native request; GL.iNet completes the
handoff asynchronously. The page shows Connected only once the active peer
matches the configured profile and, for Proton profiles, the kernel key and
handshake match. IPv6 is unchanged and was not leak-tested.