# GL.iNet native integration

## Verified firmware and minimum components

Target: GL-MT3000, firmware 4.11.0 / OpenWrt 21.02-SNAPSHOT. Native APIs are
internal vendor interfaces, not a promised cross-version public API.

The integration adds only:

- `src/lib/proton/glinet.lua`: procedural import, connect, disconnect, status, restore.
- `src/gl_rpc.lua`: a Lua 5.1 subprocess for the already installed ubus binding.
- `profile.native`: independent persistent registrations cached per server.

The Proton client remains Lua 5.4. No HTTP administrator login, new daemon,
vendor UI bundle modification, direct UCI write, `wg set`, firewall/DNS script, or new
connection manager is introduced.

## Authorities

Vendor documentation:

- [VPN Client Profile](https://docs.gl-inet.com/router/en/4/interface_guide/vpn_client_profile/).
- [VPN Dashboard, firmware 4.9+](https://docs.gl-inet.com/router/en/4/interface_guide/vpn_dashboard/).

Exact installed call-site authorities, read from the target:

| File | Relevant functions/behavior |
|---|---|
| `/www/views/gl-sdk4-ui-vpn-client.common.js.gz` | `getGroupList`, `getConfigList`, `addGroup`; `WgConfigs.submitData`, `handleSubmitEidt`, `addConfg`, `setConfg` construct manual profile requests |
| `/www/views/gl-sdk4-ui-vpndashboard.common.js.gz` | `getTunnelList`, `setTunnel`; use-settings `validate` constructs `via.configs`; tunnel-configs `handleApply` sends `tunnel_id` |
| `/usr/lib/lua/oui/rpc.lua` | `M.call`, `valid_rpc`, `glc_call`: vendor request validation and dispatch |
| `/usr/share/gl-validator.d/wg-client.lua` | `add_group`, `add_config`, `set_config` validators |
| `/usr/share/gl-validator.d/vpn-client.lua` | `set_tunnel` validators |
| `/usr/lib/oui-httpd/rpc/wg-client.so` | Installed native profile backend; not decompiled |
| `/usr/lib/oui-httpd/rpc/vpn-client` | Installed tunnel backend, compiled Lua; not decompiled |

SHA-256 of the installed compressed profile UI, compressed dashboard UI, and
plain RPC dispatcher respectively:

```text
dda56e3287a5d9505d617c98514581ccdb6b62bcb9e3b5e0d577d02b9d1ed4a0
60a0e0d20b7810adbf8a927796771239eee9807b499d7ca3b3b7c2a9ba89b038
046cc1c3d788e908e796fc0b2689b8705466fb3aa34b18e81e88791b3a65e736
```

Package versions are in `dependencies.txt`.

## Root-local RPC transport

The UI uses its authenticated JSON-RPC `call` method. Root-local clients can
reach the same vendor modules with the existing ubus bridge:

```sh
ubus call gl-session call \
  '{"module":"vpn-client","func":"get_status","params":{}}'
```

The adapter uses the Lua ubus binding, not command-line JSON. Requests are
written to a random `mkstemp` file under `/tmp` (mode `0600`), supplied on the
helper's stdin, and removed after the response. Keys are never process
arguments, stdout from the CLI, or shell command text. This bridge requires
local root access; no remotely reusable router administrator session is stored.

The envelope is `{"result": ...}` or `{"error": {"code": ..., ...}}`.
Missing/malformed results and RPC errors fail the command; error codes are
surfaced without dumping profile contents. Transport/error behavior was
verified using native status and a nonexistent read-only method.

## Native request contracts

All methods use `gl-session.call` with the module/function below. Group,
profile and tunnel IDs are vendor-assigned integers.

| Module / function | Params | Relevant result |
|---|---|---|
| `wg-client.get_group_list` | `{}` | `groups[]`: `group_id`, `group_name`, `group_type`, `peer_count`; provider records may also contain credentials, so responses are not logged |
| `wg-client.add_group` | `{"group_name":"Proton CLI"}` | Acknowledgement; resolve the new ID through `get_group_list` |
| `wg-client.get_config_list` | `{"group_id": GROUP_ID}` | `peers[]`, including `peer_id` and editable profile fields/private key; never print this response |
| `wg-client.add_config` | Profile object below | Acknowledgement; verify stored fields/ID with `get_config_list` |
| `vpn-client.get_tunnel` | `{}` | `tunnels[]`, `default_tunnels[]`, `global_enabled`, `max_tunnels` |
| `vpn-client.set_tunnel` | `tunnel_id`, replacement `via`, `enabled` | Native update acknowledgement; not proof of a handshake |
| `vpn-client.get_status` | `{}` | `status_list[]`: tunnel/group/peer IDs, name, interface, enabled/status, addresses, byte counters; `mode` |

Manual profile fields, matching `WgConfigs.submitData`:

```text
group_id: GROUP_ID
name: "Proton " + logical server name
private_key: generated WireGuard scalar, base64
address_v4: "10.2.0.2/32"
address_v6: ""
dns: "10.2.0.1"
allowed_ips: "0.0.0.0/0"
public_key: physical server X25519 public key, base64
end_point: physical EntryIP + ":51820"
persistent_keepalive: 25
presharedkey_enable: false
```

The endpoint field is **`end_point`**, not `endpoint`. Comma-separated strings,
not arrays, represent DNS and AllowedIPs. The backend stores custom groups as
`groups` and profiles as `peers` sections in `/etc/config/wireguard`.
The adapter does not write those sections itself.

Connection request, with symbolic ID placeholders:

```text
{
  tunnel_id: EXISTING_TUNNEL_ID,
  enabled: true,
  via: {
    type: "wireguard",
    configs: [{group_id: MANAGED_GROUP_ID, id_list: [MANAGED_PEER_ID]}]
  }
}
```

This reuses the tunnel and its native interface/policy identity. `from`, `to`,
`killswitch`, `options`, tunnel priority, default-traffic behavior and global
settings are omitted deliberately, rather than replaying potentially stale
copies. The vendor UI also makes partial `set_tunnel` requests for switches
and tunnel options.

Before the first change, `gl-restore.json` durably saves the original
`tunnel_id`, `enabled`, and full `via.configs` list, including fallback profiles.
Further server switches do not overwrite that snapshot. `restore` sends those
fields back through the same API and clears the snapshot only after an
acknowledged request. Failed requests retain it. Neither operation deletes
any profile. Concurrent edits of the tunnel's profile selection in the UI
during a CLI-managed session are not coordinated.

## CLI and dashboard

```sh
proton-openwrt select 'US-NY#101'
proton-openwrt prepare             # inactive import only
proton-openwrt connect             # switches one enabled WireGuard tunnel
proton-openwrt status
proton-openwrt select 'US-NY#102'   # example; use an available listed server
proton-openwrt connect
proton-openwrt restore
```

Specify `connect TUNNEL_ID` if selection is ambiguous or the desired existing
tunnel is disabled. A fresh tunnel/routing policy is not created.

The profiles appear in **VPN Client Profiles -> WireGuard -> Proton CLI**;
the existing **VPN Dashboard** consumes the same native tunnel/status objects.
`requested: true` means the vendor accepted a request, not that connectivity
has been verified. Handoff is asynchronous: native metadata can identify the
requested profile before the kernel has finished replacing its WireGuard key.
Allow the transition to complete before attributing traffic to the new server.

Each server gets a separate Proton persistent registration, preserving its
physical `Bouncing` label and previously generated keys. Repeated preparation
reuses the key and imported peer. Near-expired certificates renew on use with
the same registration features. Cached registrations consume Proton account
slots; they are not revoked just because a different server is selected.

Externally edited/removed managed profiles and retired cached endpoints
produce errors instead of overwriting user changes. Native key/profile cleanup
is manual. Do not delete the private cache before revoking unneeded keys in
Proton and removing unused profiles in GL.iNet.

An ambiguous Proton registration retains its key in `native-profiles.json`
and blocks automatic duplicate registration. For recovery, revoke the pending
entry's `keys.public_key` using the already implemented authenticated
`DELETE /vpn/v1/certificate`, then remove only that pending cache entry.
Do not delete keys before revocation. No GL.iNet profile is imported until
Proton registration has been confirmed.

## Rollback and verification

Switching changes the live connection. Normal rollback is:

```sh
proton-openwrt restore
proton-openwrt status
```

If the CLI is unavailable, the original group/profiles remain in GL.iNet's
dashboard and can be selected there. Never restore all UCI files or reload
network/firewall services as the normal switching mechanism.

After an authorized switch, verify native status, the intended endpoint/key,
and actual traffic after the asynchronous handoff:

```sh
proton-openwrt status
wg show wgclient1 public-key
wg show wgclient1 endpoints
wg show wgclient1 latest-handshakes
wg show wgclient1 transfer
curl -4 --interface wgclient1 --connect-timeout 10 --max-time 25 \
  -o /dev/null -w 'HTTP %{http_code}\n' https://protonvpn.com
curl -4 --interface wgclient1 --connect-timeout 10 --max-time 25 \
  https://api.ipify.org
```

Use the interface returned by native status, not a hardcoded name on another
router. Require the selected native peer, a recent nonzero handshake, and
successful **interface-bound** HTTPS. A normal unbound request could silently
use a different tunnel or WAN under the preserved routing policy. The router's
own service traffic may intentionally follow a different path from LAN
clients. IPv6 behavior is unchanged and is not validated by these IPv4 tests.

See `TESTING.md` for what was validated live.
