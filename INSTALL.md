# Install Proton VPN for GL.iNet

This is the complete manual installation and recovery guide for the CLI and
the **VPN -> Proton VPN** web page. Checked against the installers and
GL-MT3000 firmware **4.11.0** on October 30, 2026.

## Supported target and limits

- GL.iNet **GL-MT3000**, firmware **4.11.0**, OpenWrt 21.02-SNAPSHOT,
  **aarch64_cortex-a53 / musl**.
- The client uses installed GL.iNet WireGuard, VPN, routing, DNS and kill-switch
  services. It does not replace them or create the first VPN tunnel.
- Other models, CPU ABIs, firmware releases and stock OpenWrt are not verified.
  The FFI code depends on the tested aarch64/musl ABI and versioned libraries.
- The CLI and web installers have been tested on the configured router.
  A complete factory-reset-to-working-VPN installation has **not** been tested.
  First-tunnel setup below follows the existing native integration contract and
  GL.iNet's documented dashboard workflow; it is not a tested factory-reset run.
- No installable `.ipk` release or package-feed entry is provided yet. Do not
  expect this project to appear in the router's Plug-ins list.

A reboot retains the installation and saved state. A factory reset removes
the addon, local Proton session, keys and native configuration. Resetting the
router does not revoke sessions or WireGuard registrations at Proton.
Firmware upgrades may also remove addon files or change the internal APIs;
check compatibility before reinstalling, even when keeping settings.

## 1. Prepare the router and PC

After a factory reset, complete GL.iNet's initial setup, set the administrator
password, and establish normal internet access and correct router time.
Connect the PC to the router's trusted LAN.

The examples use `192.168.8.1`; substitute your actual router address.
You need PowerShell, Git, OpenSSH `ssh`/`scp`, and access to the source repository.
No Git,
compiler, Node.js, Python or Playwright is needed on the router.

From **PowerShell on the PC**:

```powershell
$router = '192.168.8.1'
$project = 'C:\proton-openwrt'
```

Clone the repository (or set `$project` to an existing checkout):

```powershell
git clone https://github.com/glutio/proton-openwrt.git $project
```

Use a reviewed commit compatible with the target firmware; do not assume future commits support other firmware.

## 2. Transfer a clean source archive

From **PowerShell on the PC**:

```powershell
$archive = Join-Path $env:TEMP 'proton-openwrt.tar'
git -C $project archive --format=tar -o $archive HEAD
if ($LASTEXITCODE -ne 0) { throw 'Source archive failed.' }
scp -O $archive "root@${router}:/tmp/proton-openwrt.tar"
if ($LASTEXITCODE -ne 0) { throw 'Source upload failed.' }
ssh -t "root@$router"
```

Use the router's administrator password when prompted. `-O` selects legacy
SCP for the tested Dropbear installation. `git archive` includes committed
source, tests and docs, not untracked development dependencies or router state.
It does **not** include uncommitted changes.

After a reset, a previously authorized SSH key may no longer work; use the new
administrator password or reauthorize your public key. If SSH reports a changed
host key, first confirm that this really is your reset router. Only then remove
the old entry on the PC with `ssh-keygen -R $router`, reconnect, and verify the
new fingerprint. Do not disable SSH host-key checking.

## 3. Check compatibility and dependencies

The following commands run **inside the interactive router SSH shell**:

```sh
cat /etc/glversion
ubus call system board
opkg print-architecture
df -h /overlay /tmp
lua5.4 -e 'require("ffi"); require("cjson.safe")'
lua -e 'require("ubus"); require("cjson.safe")'
test -r /usr/lib/libcrypto.so.1.1 && test -r /usr/lib/libcurl.so.4
nginx -t
```

Stop if the model, firmware or ABI differs from the supported target, storage
is full, or any dependency/syntax check fails. The required runtime packages
were present on the tested router; their presence on an untouched factory
image has not been independently established.

| Requirement | Verified package names |
|---|---|
| Lua 5.4, FFI and JSON | `lua5.4`, `lua-ffi-lua5.4`, `lua-cjson-lua5.4` |
| TLS/crypto and trust store | `libopenssl1.1`, `libcurl4`, `ca-bundle` |
| Native Lua 5.1 bridge | `lua`, `libubus-lua`, `lua-cjson` |
| Vendor VPN services | `gl-sdk4-wg-client`, `gl-sdk4-vpn-client`, `gl-sdk4-vpn-policy`, `gl-oui-rpc` |
| Native web interface | `nginx-ssl`, `gl-sdk4-ui-core` and the installed OUI menu/RPC loader |

Exact tested versions and probes are in [dependencies.txt](dependencies.txt).
If a package is genuinely missing, refresh the router's configured package
lists with `opkg update` and install **only that missing package** from the
matching GL.iNet firmware feed, for example `opkg install lua-ffi-lua5.4`.
Then repeat the failed check. Do not add generic OpenWrt feeds, replace vendor
VPN services, force incompatible libraries, or run a blanket `opkg upgrade`.
If the matching dependency is unavailable, stop; changing firmware libraries
is outside this installation procedure.

## 4. Install the CLI and native web page

Still **inside the router SSH shell**:

```sh
umask 077
stage=$(mktemp -d /tmp/proton-openwrt.XXXXXX) &&
tar -xf /tmp/proton-openwrt.tar -C "$stage" &&
cd "$stage" &&
sh install.sh &&
sh install-ui.sh
```

Do not continue if a command fails. Each attempt gets a separate staging
directory, so it does not mix files with an older source upload.

The backend installs under `/usr/lib/proton-openwrt`, with the command
`/usr/bin/proton-openwrt`. The web installer adds the native menu, view, RPC
and validator files and gracefully reloads nginx. No network restart or
router reboot is required; installation does not connect or reset an account.

The installers deliberately refuse to overwrite existing entry points.
If an installation already exists, use the update section instead.
If only the backend installed successfully, fix the reported web dependency
and run `sh install-ui.sh` from the same staging directory; do not rerun
`install.sh`. A partially copied installation must be inspected rather than
bypassing the overwrite checks.

Optional offline checks from this staging directory:

```sh
lua5.4 -e 'package.path="./lib/?.lua;"..package.path;dofile("tests/run.lua")'
lua tests/rpc.lua
sh tests/worker.sh
```

The Lua suite and RPC checks use fixtures/mocks; the worker check also reads
current status and exercises private-file transport. None log in or switch VPNs.

## 5. Sign in and discover servers

Reload the router's administration page, open **VPN -> Proton VPN**, and sign
in with the Proton username/password and TOTP when required. Only enter them
over a trusted connection: HTTP does not encrypt passwords, even on a LAN.
Installation does not configure HTTPS or certificate trust; a self-signed or
wrong-address certificate is not a fully trusted setup. The CLI reuses the
saved session (`proton-openwrt countries`, `proton-openwrt servers US`).

Countries load first, followed by cities and nodes as selected. USA is first;
other countries sort by displayed name and nodes by ascending load.
The first catalogue fetch can take about 9-10 seconds on the tested router.
Subsequent browsing uses a five-minute cache with background refresh.

## 6. Connect: existing tunnel or first-time setup

### An existing native WireGuard tunnel is available

Select country, city and node in the Proton page, then **Connect / switch**.
This intentionally changes the selected native VPN connection and may interrupt
traffic. With one enabled WireGuard tunnel, leave **Advanced -> Existing tunnel
ID** blank. For multiple tunnels or a disabled target tunnel, explicitly select
its existing numeric ID. Do not reuse the example router's historical IDs.

The addon snapshots that tunnel's profile references and enabled state before
its first handoff. It preserves the tunnel's native policy, DNS and kill-switch
settings; it does not configure a new routing policy.

### There is no native WireGuard tunnel after a clean reset

The addon cannot create the first tunnel. First import a profile without
connecting, from the router SSH shell:

```sh
proton-openwrt select US
proton-openwrt prepare
```

`select US` chooses an eligible server; `prepare` registers its key and imports
an inactive profile under **VPN Client Profiles -> WireGuard -> Proton CLI**.
It does not create a tunnel or change routing.

In the native **VPN -> VPN Dashboard**, use **Add VPN Tunnel**, select the
imported Proton profile, choose the intended client-source and destination
policy, and apply. Review native tunnel options, DNS and kill-switch behavior
before enabling the tunnel. This is the one-time native setup, not an action
the addon automates. See GL.iNet's
[VPN Dashboard guide](https://docs.gl-inet.com/router/en/4/interface_guide/vpn_dashboard/)
for the wizard and policy choices.

After the native tunnel is configured and enabled, use the Proton page to
connect/switch normally. If it is disabled, supply its ID under Advanced.
The first addon-managed handoff snapshots this newly configured tunnel; it
cannot restore a VPN configuration that was erased by the factory reset.

### Verify the connection

```sh
proton-openwrt status
```

Check the Proton page and native VPN Dashboard, then test internet traffic
from a client covered by the intended VPN policy. The addon's green Connected
status checks native connection state, the active profile's match with the
tunnel's configured profile selection, expected keys and a nonzero peer
handshake. The native dashboard receives WebSocket updates and this page polls
RPC, so their visible updates need not arrive simultaneously.
An acknowledged connect request or an old handshake alone is not
proof that new application traffic is traversing the VPN.

**Disconnect** retains the original snapshot; **Restore original VPN** restores
the pre-handoff profile selection and enabled state. **Sign out** only revokes
the Proton API session; it does not disconnect the tunnel or revoke its
independently registered WireGuard keys.

## 7. Updating an existing installation

Do not run the fresh backend installer over an existing installation.
Keep the current account and active VPN; do not factory-reset to update.

Transfer an archive of the reviewed new commit as in section 2. In an
interactive router shell, extract it to a new staging directory as in section 4,
but **do not run either installer yet**. Close open Proton page tabs and stop
issuing CLI operations while updating.

For a **web-page-only update**, use:

```sh
sh /usr/lib/proton-openwrt/remove-ui.sh
sh install-ui.sh
```

This removal/reinstallation path has been tested without changing the saved
session or active VPN. The web installer also copies this project's `cli.lua`,
`glinet.lua` and `web.lua`; it is not a general backend upgrade mechanism.

For changes to other backend modules, there is currently **no general upgrade
installer**. Do not assume reinstalling just the web page upgrades all code.
Follow release-specific upgrade instructions or have the runtime files updated
with a reviewed deployment procedure. Do not delete private state to bypass
installer checks. Reload the browser after the update.

## 8. Reset, backup and removal

Before a planned reset, record your firmware and intended native VPN policies.
Do not expect addon installation to restore erased router settings.
For the simplest recovery, reinstall on the same supported firmware and sign
in again, then create the native tunnel if necessary.

Private state is in `/etc/proton-openwrt`, directory mode `0700`, files `0600`.
It contains reusable tokens and private keys, not just preferences. Any backup
containing it must be protected like a password. Do not put it in Git, attach
it to issues, or copy it to a replacement router as a generic configuration.
Native profile/tunnel IDs may differ after reset; restoring this directory
alone is not a supported recovery method. Full router-backup restoration with
this addon has not been verified.

Reset/removal does not revoke remote Proton WireGuard registrations. Unneeded
registrations and native profiles require separate Proton/GL.iNet cleanup.
Do not discard key records before deciding how those profiles will be retired.

To remove **only the web page**, in the router shell:

```sh
sh /usr/lib/proton-openwrt/remove-ui.sh
```

This leaves the CLI, saved state, native profiles and active VPN intact.
It is not a disconnect or account logout. Restore/disconnect first if that is
your intention. There is no complete backend/state/profile uninstall command;
those have separate lifecycles and must not be blindly deleted together.

## Troubleshooting

| Symptom | Action |
|---|---|
| SSH permission denied after reset | Use the new administrator password; reauthorize the public key if desired. |
| SSH host-key mismatch | Confirm router identity, then remove the obsolete host entry as described in section 2. |
| `lua5.4` missing or `ffi` / JSON cannot load | Check the package table and matching firmware feed; do not substitute Lua 5.1 for the API client. |
| `libcrypto.so.1.1` / `libcurl.so.4` missing | Stop and establish firmware compatibility; do not symlink another ABI/version in its place. |
| Installer says a path already exists | Determine whether CLI, UI or a partial install exists; use section 7, not forced overwrite or state deletion. |
| Proton menu missing | Check that `install-ui.sh` completed, then fully reload the administration page; login to the router as administrator. |
| TLS/SRP fails | Check router time, internet and CA bundle. Do not disable TLS, signature or pin verification. |
| `no matching WireGuard tunnel` | Follow first-time native tunnel setup in section 6, or provide the existing disabled tunnel's ID. |
| Multiple WireGuard tunnels | Supply the desired existing tunnel ID; do not guess an ID from another installation. |
| Another Proton operation is running | Let the existing login/refresh/mutation finish. Do not delete the lock file. Cached browsing remains available. |
| First catalogue is slow | Allow the initial authenticated fetch; later browsing is cached. Refresh failures retain the previous catalogue. |
| Connected but intended traffic does not use VPN | Check client-source/destination policy and native DNS/kill-switch options in VPN Dashboard; the addon does not replace them. |

Further references: [README.md](README.md) for CLI commands,
[UI.md](UI.md) for native web integration, [GLINET.md](GLINET.md) for tunnel
contracts and restoration, and [TESTING.md](TESTING.md) for verified results
and remaining limitations. Do not include tokens, passwords, private keys or
raw WireGuard configurations in troubleshooting reports.

## Can this become a Plug-ins package?

**Yes, as a packaging/distribution project, not an already available feature.**
GL.iNet's [Plug-ins page](https://docs.gl-inet.com/router/en/4/interface_guide/plugins/)
manages OpenWrt packages. Read-only inspection of the tested firmware found:

- `/www/views/gl-sdk4-ui-plugins.common.js.gz` lists and installs packages by
  name using `plugins.get_list` / `plugins.install_package`.
- Its source-management dialog adds named repository URLs using
  `plugins.get_config` / `plugins.set_config`; this is not restricted to
  selecting a built-in VPN provider.
- No local `.ipk` upload control was found in that page's bundle. Installing a
  standalone downloaded package through SSH is different from installing it
  through the native Plug-ins list.
- `/etc/opkg.conf` enables `option check_signature`. A new signed feed needs
  its public signing key trusted by the router. No signing-key import control
  was found in the Plug-ins page.

The smallest proposed implementation is one **`proton-openwrt` `.ipk`** containing
both the existing CLI and native UI, built with an OpenWrt package recipe and
the matching SDK. It should:

1. Declare the real runtime/vendor dependencies and target architecture.
   Despite being Lua/shell/JavaScript, this client is not architecture-neutral:
   its FFI requires the tested aarch64/musl ABI. Do not label it `Architecture: all`.
   Check supported firmware/model as well; architecture alone is insufficient.
2. Let the package manager own installed files and upgrades. Do not invoke the
   current fresh-install scripts after the package has already extracted those
   same files. Refuse or explicitly migrate a manual installation without
   overwriting unowned files or losing saved state.
3. Use install/remove hooks only for safe integration such as checking/reloading
   nginx on the running router, not during SDK image construction. Installation,
   updates and removal must never log in, change a tunnel, or wipe
   `/etc/proton-openwrt` or native profiles. Test these lifecycles separately.
4. Publish versioned packages and a signed, HTTPS-accessible package index,
   with a documented way to establish trust in its public signing key.
   A source repository is not itself such a feed.
5. Choose an explicit redistribution license before a public release; the
   repository currently has no license file. Validate a clean factory install,
   dependencies, first-tunnel setup, update and removal on the supported device.

With an accessible feed and its key already trusted, the intended GUI flow is:
add the software source once, update package lists, search `proton-openwrt`,
and click Install. This flow has **not** been tested with a project package;
none has been built or published. A custom feed still needs trust bootstrap,
which may require one-time SSH. Appearing in the default list without adding a
source/key would require distribution through an already configured, trusted
feed, for example GL.iNet's.

Packaging would simplify installation and upgrades, not remove the native
first-tunnel requirement or broaden firmware support automatically. The sensible
first milestone is a tested `.ipk`; the signed feed and GUI installation follow.

Packaging authorities:
[OpenWrt package format and policy](https://openwrt.org/docs/guide-developer/package-policies),
[package recipes and hooks](https://openwrt.org/docs/guide-developer/packages),
[repository signature verification](https://openwrt.org/docs/guide-user/security/release_signatures),
and [GL.iNet SDK](https://github.com/gl-inet/sdk).
