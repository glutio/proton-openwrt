# Install Proton VPN for GL.iNet

## Requirements

- GL.iNet **GL-MT3000**, firmware **4.11.0** (OpenWrt 21.02, aarch64/musl).
  Other models and firmware are untested; the Lua FFI code depends on this ABI.
- Internet access and correct router time.
- SSH access to the router (`ssh root@192.168.8.1`, admin password).

## Install or update

In an SSH session on the router:

```sh
curl -fsSL https://raw.githubusercontent.com/glutio/proton-openwrt/main/get.sh | sh
```

This downloads the latest release, checks dependencies, installs the CLI and
the web page, and reloads nginx. It does not restart networking or change any
VPN. Run the same command to update; your sign-in and profiles in
`/etc/proton-openwrt` are kept. For a specific release, end the command with
`| sh -s v0.1.0`.

Then reload the admin panel, open **VPN -> Proton VPN**, and sign in with your
Proton username, password and TOTP (if enabled). Only sign in over a trusted
connection: plain HTTP does not encrypt the password, even on a LAN.

## Connect

The page switches an **existing** WireGuard tunnel in GL.iNet's VPN Dashboard
to the selected Proton server, keeping that tunnel's routing policy, DNS and
kill switch. Pick a country, city and node, then **Connect / switch**.

With several WireGuard tunnels, or a disabled one, enter its ID under
**Advanced -> Existing tunnel ID**.

**No tunnel yet (e.g. after a factory reset):** create one once from SSH:

```sh
proton-openwrt select US
proton-openwrt prepare
```

This imports an inactive Proton profile under **VPN Client Profile ->
WireGuard -> Proton CLI**. In **VPN Dashboard**, use **Add VPN Tunnel**, select
that profile, choose your policy and enable it
([GL.iNet guide](https://docs.gl-inet.com/router/en/4/interface_guide/vpn_dashboard/)).
After that, use the Proton page normally.

**Disconnect** disables the managed tunnel. **Restore original VPN** puts back
the profile the tunnel used before the first Proton connection. **Sign out**
revokes the Proton session only; it does not disconnect.

## Remove

```sh
sh /usr/lib/proton-openwrt/remove-ui.sh
rm -rf /usr/lib/proton-openwrt /usr/bin/proton-openwrt
```

This leaves the active VPN and native profiles in place. To also delete the
saved session and keys, sign out first, then `rm -rf /etc/proton-openwrt`.
Registered WireGuard keys remain on your Proton account until removed there.

## Reset and backups

A factory reset removes the add-on, session and keys; reinstall and sign in
again. `/etc/proton-openwrt` contains tokens and private keys; protect any
backup that includes it like a password, and never attach it to issues.

## Manual install (offline or development)

Copy the source to the router (for example `scp -O` a `git archive` tarball),
extract it into a temporary directory, and run `sh install.sh && sh install-ui.sh`.
Both installers refuse to overwrite an existing installation; `get.sh` handles
updates. Exact dependency versions are in [dependencies.txt](docs/dependencies.txt).

## Troubleshooting

| Symptom | Action |
|---|---|
| `lua5.4`/`ffi`/`libcurl.so.4` check fails | Unsupported firmware; install only the missing package from GL.iNet's own feed (`opkg update; opkg install lua-ffi-lua5.4`), never generic OpenWrt feeds. |
| Proton menu missing | Fully reload the admin panel. |
| TLS or sign-in fails | Check router time and internet. Human verification (CAPTCHA) is not supported. |
| "Choose an existing WireGuard tunnel" | Create the first tunnel as described above. |
| "Multiple WireGuard tunnels exist" | Enter the tunnel ID under Advanced. |
| "Another Proton operation is running" | Wait for it to finish; do not delete the lock file. |
| Connected but traffic bypasses VPN | Check the tunnel's policy, DNS and kill switch in VPN Dashboard. |

Never include passwords, tokens, private keys or WireGuard configs in reports.

## Plug-ins page

Not available yet. It would need a signed `.ipk` feed whose key the router
trusts; GL.iNet's Plug-ins page has no key import, so a third-party feed still
needs SSH once. Listing in the default Plug-ins catalogue requires GL.iNet.