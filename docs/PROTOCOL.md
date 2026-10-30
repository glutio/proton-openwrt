# Proton VPN protocol, traced from the official Linux CLI

This is a description of observed upstream implementation, not a published
stable API contract. The client never uses anonymous sessions for VPN resources.

## Pinned upstream references

The starting point is
[`ProtonVPN/proton-vpn-cli`](https://github.com/ProtonVPN/proton-vpn-cli/tree/7958dd7982a2dbbd4b1d089818ae9079a3fe8f7d).
Its `setup.py` declares the Proton core and VPN API-core dependencies; the CLI
does not implement its own HTTP authentication or key cryptography.

| Behavior | Exact upstream file and function |
|---|---|
| CLI login/TOTP entry point | [`commands/account.py`](https://github.com/ProtonVPN/proton-vpn-cli/blob/7958dd7982a2dbbd4b1d089818ae9079a3fe8f7d/proton/vpn/cli/commands/account.py#L58): `signin`, `_authenticate_2fa` |
| CLI initialization and account login | [`core/controller.py`](https://github.com/ProtonVPN/proton-vpn-cli/blob/7958dd7982a2dbbd4b1d089818ae9079a3fe8f7d/proton/vpn/cli/core/controller.py#L164): `Controller.__init__`, `Controller.login` (line 507) |
| CLI server selection/connect | [same controller](https://github.com/ProtonVPN/proton-vpn-cli/blob/7958dd7982a2dbbd4b1d089818ae9079a3fe8f7d/proton/vpn/cli/core/controller.py#L377): `find_logical_server`, `_connect` (line 627) |
| Client identity/header version | [`core/session_holder.py`](https://github.com/ProtonVPN/python-proton-vpn-api-core/blob/8e402462fe7f7e21dba58d5b18f46534cd9ad981/proton/vpn/core/session_holder.py#L130): `ClientTypeMetadata`, `SessionHolder._get_app_version_header_value`, `_get_version_metadata` |
| VPN login wrapper | [`core/api.py`](https://github.com/ProtonVPN/python-proton-vpn-api-core/blob/8e402462fe7f7e21dba58d5b18f46534cd9ad981/proton/vpn/core/api.py): `ProtonVPNAPI.login`, `submit_2fa_code` |
| VPN session wrapper, optional locale/timezone | [`session/session.py`](https://github.com/ProtonVPN/python-proton-vpn-api-core/blob/8e402462fe7f7e21dba58d5b18f46534cd9ad981/proton/vpn/session/session.py): `VPNSession.login`, `provide_2fa_code`, `_client_headers` |
| Authentication/refresh/scopes/errors | [`proton/session/api.py`](https://github.com/ProtonVPN/python-proton-core/blob/9bd4662ddde2d439e4e8c900f0431e23958bd512/proton/session/api.py): `Session.async_authenticate` (231), `async_validate_2fa_code` (371), `async_refresh` (425), `needs_twofa` (707), `_verify_modulus` (932), `async_api_request` (151) |
| HTTPS headers and JSON success codes | [`transports/aiohttp.py`](https://github.com/ProtonVPN/python-proton-core/blob/9bd4662ddde2d439e4e8c900f0431e23958bd512/proton/session/transports/aiohttp.py): `AiohttpTransport.async_api_request`, `_parse_json` |
| Base URL and TLS pins | [`environments.py`](https://github.com/ProtonVPN/python-proton-core/blob/9bd4662ddde2d439e4e8c900f0431e23958bd512/proton/session/environments.py): `ProdEnvironment.http_base_url`, `tls_pinning_hashes` |
| SRP arithmetic | [`srp/_pysrp.py`](https://github.com/ProtonVPN/python-proton-core/blob/9bd4662ddde2d439e4e8c900f0431e23958bd512/proton/session/srp/_pysrp.py): `User.process_challenge`, `verify_session`, `hash_k` |
| Expanded SHA-512 | [`srp/pmhash.py`](https://github.com/ProtonVPN/python-proton-core/blob/9bd4662ddde2d439e4e8c900f0431e23958bd512/proton/session/srp/pmhash.py): `PMHash.digest` |
| Password hashing and endianness | [`srp/util.py`](https://github.com/ProtonVPN/python-proton-core/blob/9bd4662ddde2d439e4e8c900f0431e23958bd512/proton/session/srp/util.py): `hash_password_3`, `bytes_to_long`, `long_to_bytes` |
| Account entitlement/certificate request | [`session/fetcher.py`](https://github.com/ProtonVPN/python-proton-vpn-api-core/blob/8e402462fe7f7e21dba58d5b18f46534cd9ad981/proton/vpn/session/fetcher.py): `VPNSessionFetcher.fetch_vpn_info`, `fetch_certificate` |
| Server discovery/load endpoints | [`servers/server_list_fetcher.py`](https://github.com/ProtonVPN/python-proton-vpn-api-core/blob/8e402462fe7f7e21dba58d5b18f46534cd9ad981/proton/vpn/session/servers/server_list_fetcher.py#L52): `MixinEndpointV1`, `ServerListFetcher.fetch`, `update_loads` |
| Server fields | [`servers/types.py`](https://github.com/ProtonVPN/python-proton-vpn-api-core/blob/8e402462fe7f7e21dba58d5b18f46534cd9ad981/proton/vpn/session/servers/types.py): `LogicalServer`, `PhysicalServer` |
| Ed25519 to WireGuard key conversion | [`session/key_mgr.py`](https://github.com/ProtonVPN/python-proton-vpn-api-core/blob/8e402462fe7f7e21dba58d5b18f46534cd9ad981/proton/vpn/session/key_mgr.py): `KeyHandler.__init__`, `ed25519_pk_str_asn1`, `x25519_sk_str` |
| Desktop tunnel and local agent | [`protocol/wireguard/wireguard.py`](https://github.com/ProtonVPN/python-proton-vpn-api-core/blob/8e402462fe7f7e21dba58d5b18f46534cd9ad981/proton/vpn/backend/networkmanager/protocol/wireguard/wireguard.py): `Wireguard`, `_on_state_changed`, `_start_local_agent_listener` calls |

### Why one supplemental upstream source is necessary

The desktop CLI creates a session certificate and maintains a local-agent
connection. Simply exporting that desktop setup is not equivalent to Proton's
standalone router configurations.

For **persistent** router registration only, the supplemental source is Proton's
own configuration generator in WebClients revision
`ad5f7c1dcc7e2f5536f1c4a417fa70554d83fb88`:

- [`WireGuardConfigurationSection.tsx`](https://github.com/ProtonMail/WebClients/blob/ad5f7c1dcc7e2f5536f1c4a417fa70554d83fb88/packages/components/containers/vpn/WireGuardConfigurationSection/WireGuardConfigurationSection.tsx):
  `getKeyPair`, `getX25519PrivateKey`, `queryCertificate`, `getFeatureValues`,
  `getExtendCallback`, `askForRevocation`.
- [`api.ts`](https://github.com/ProtonMail/WebClients/blob/ad5f7c1dcc7e2f5536f1c4a417fa70554d83fb88/packages/components/containers/vpn/WireGuardConfigurationSection/api.ts):
  `generateCertificate`, `deleteCertificates`.
- [`Certificate.ts`](https://github.com/ProtonMail/WebClients/blob/ad5f7c1dcc7e2f5536f1c4a417fa70554d83fb88/packages/components/containers/vpn/WireGuardConfigurationSection/Certificate.ts):
  `CertificateGenerationParams`, `CertificateDTO`.
- [`getConfigTemplate.ts`](https://github.com/ProtonMail/WebClients/blob/ad5f7c1dcc7e2f5536f1c4a417fa70554d83fb88/packages/components/containers/vpn/WireGuardConfigurationSection/getConfigTemplate.ts):
  `getConfigTemplate`.

No third-party Proton API implementation is used as a protocol authority.

## HTTPS and headers

Base URL: `https://vpn-api.proton.me`, from `ProdEnvironment`.

```text
Accept: application/json
Content-Type: application/json
x-pm-appversion: linux-vpn-cli@5.8.11+aarch64
User-Agent: proton-openwrt/0.1 (Linux; OpenWrt/21.02)
```

The application-version shape comes from CLI `ClientTypeMetadata(type="cli")`
and `SessionHolder`, using the **API-core** version, not the CLI package version.
This independent client uses the verified CLI-compatible API header, while its
User-Agent identifies the custom client. This is not an official supported app.
The implementation pins that known upstream version rather than guessing a
version from this project's release number.

Authenticated requests additionally send:

```text
x-pm-uid: <session UID>
Authorization: Bearer <access token>
```

The upstream optional `x-pm-locale`, `x-pm-timezone`, and discovery
`X-PM-netzone` headers are not required here and are omitted. No username,
password, or refresh token is sent in a URL.

CA/hostname verification stays enabled, **plus** libcurl's SPKI SHA-256 pin
check against the three production hashes in `ProdEnvironment`. There are no
redirects, insecure mode, alternate API hosts, or proxy/pinning fallbacks.
Pin rotation requires reviewing/updating the upstream pins.

The transport accepts JSON media types with optional parameters and requires a
JSON object with numeric `Code`. Both HTTP 2xx **and** `Code` 1000/1001 are
required. Non-JSON, malformed JSON, HTTP errors, and API error codes are not
treated as success. Errors do not dump bodies or tokens.

## Endpoints and payloads

All names below are taken from the pinned sources. Angle-bracket values are
placeholders, not literal payload content.

| Method/path | Request | Required response fields used here |
|---|---|---|
| `POST /auth/info` | `Username` | `Version`, `Modulus`, `Salt`, `ServerEphemeral`, `SRPSession` |
| `POST /auth` | `Username`, `ClientEphemeral`, `ClientProof`, `SRPSession` | `ServerProof`, `UID`, `AccessToken`, `RefreshToken`, `Scopes`; optional `2FA` |
| `POST /auth/2fa` | `TwoFactorCode` | `Scopes` |
| `POST /auth/refresh` | `ResponseType: "token"`, `GrantType: "refresh_token"`, `RefreshToken`, `RedirectURI: "http://protonmail.ch"` | rotated `AccessToken`, `RefreshToken`, `Scopes`; existing UID is retained |
| `DELETE /auth` | no body | success code; HTTP 401 also means the session is already unavailable |
| `GET /vpn/v2` | authenticated, no body | `VPN.MaxTier`, `Delinquent` |
| `GET /vpn/v1/logicals?SecureCoreFilter=all&WithState=true` | authenticated, no body | `LogicalServers[]` |
| `POST /vpn/v1/certificate` | described below | persistent `Mode`, `SerialNumber`, `ExpirationTime`; optional `RefreshTime` |
| `DELETE /vpn/v1/certificate` | `ClientPublicKey` | success code |

The CLI's library also defines `GET /vpn/v1/loads` and newer v2/binary-status
discovery. This small client retains the verified complete v1 endpoint instead
of implementing Proton's newer v2/binary-status protocol. The web UI now has a
separate five-minute metadata cache; this does not change the upstream API,
account endpoint or fresh connection-time validation. See `UI.md`.

### SRP login

1. `/auth/info` returns base64 salt and server ephemeral, plus a clear-signed
   OpenPGP modulus. Support only Proton authentication versions 3 and 4.
2. Verify the modulus signature **before** using it. The pinned OpenPGP primary
   key fingerprint is `248097092b458509c508dac0350585c4e9518f26`.
   The Lua verifier deliberately supports only the observed v4
   EdDSA/Ed25519 + SHA-256 clear-signed modulus format, not arbitrary OpenPGP.
   The signature is verified with the raw point from that pinned primary key.
   Unsupported algorithms/formats fail closed; there is no unsigned fallback.
3. Use generator 2 and a random 256-bit client secret with its high bit set.
   SRP integers and 256-byte padded values are **little-endian**.
4. Proton's expanded hash `H(m)` concatenates SHA-512 of `m || 0`, `m || 1`,
   `m || 2`, and `m || 3`, where each suffix is a single byte.
5. Append ASCII `proton` to the ten-byte salt; encode in bcrypt's alphabet.
   Hash the UTF-8 password, truncated to 72 **bytes**, with `$2y$10$`.
   The password-derived exponent is `x = LE(H(bcrypt_result || modulus))`.
6. Compute SRP-6a using Proton's `k = LE(H(PAD(g) || PAD(N)))`,
   `u = LE(H(PAD(A) || PAD(B)))`, and
   `S = (B - k * g^x)^(a + u*x) mod N`.
   Reject `B mod N == 0` and `u == 0`.
7. `ClientProof = H(PAD(A) || PAD(B) || PAD(S))`.
   The expected server proof is `H(PAD(A) || ClientProof || PAD(S))`.
   Send the base64 client values to `/auth`. Verify the returned `ServerProof`
   using constant-time byte comparison before trusting/saving its tokens.

All modular exponentiation uses OpenSSL's constant-time Montgomery routine;
the application does not implement its own big-integer arithmetic.

### TOTP and scopes

The initial `Scopes` may contain `twofactor`: that token is authenticated but
**not ready for VPN resources**. If the `2FA.Enabled` bitmask includes TOTP
(bit 1), read six digits from the terminal and POST `/auth/2fa` with that
session's UID/access token. Replace scopes with the returned list.

Require `vpn` and reject remaining `twofactor` before discovery/registration.
Do not infer authorization merely from the existence of an access token.
FIDO2-only authentication fails explicitly; no browser/session-token import
workaround is provided. If post-auth TOTP/scope completion fails, attempt to
revoke the incomplete session and do not save it.

### Refresh and errors

HTTP 401 on a VPN request triggers one refresh and one replay. Both rotated
tokens are saved atomically before replay. A state-directory lock prevents two
local processes from consuming the same refresh token concurrently.

| Condition | Handling |
|---|---|
| HTTP 403 | Surface missing scope/authorization; do not loop through refresh |
| HTTP 429 | Surface rate limit and numeric `Retry-After`; no automatic retry storm |
| HTTP 422 + code 9001, or code 12087 | Surface human verification; no bypass |
| Bad proof/missing fields | Fail before persisting unverified credentials |
| Refresh HTTP 400/401/422, excluding human verification | Delete rejected saved session; require login |
| Network/TLS/JSON/5xx/409 errors | Return error; no unbounded retry or assumed success |
| Lost certificate POST response | Preserve pending key; refuse automatic duplicate creation |

The generic core fallback header `Other` passed the ping test but an actual
login received HTTP 422/code 9001. After tracing and matching the CLI's actual
header format, direct login and authenticated discovery succeeded. This is an
observation, not a guarantee that human verification can never recur.

### Server discovery and selection

Read account `MaxTier` and reject `Delinquent > 2`, as `VPNAccount` does.
Never persist the `/vpn/v2` response, which also includes unrelated VPN
credentials. Filter logical servers by `Status == 1` and `Tier <= MaxTier`;
filter their physical `Servers[]` by enabled status, valid IPv4 `EntryIP`, and
base64 32-byte `X25519PublicKey`. Keep `Label` for registration.

Logical fields consumed: `ID`, `Name`, `ExitCountry`, `City`, `Tier`, `Features`,
`Status`, `Score`, `Load`, `Servers`. Physical fields: `ID`, `Status`, `EntryIP`,
`X25519PublicKey`, optional `Domain`, `Label`. Countries are deduplicated
**exit-country** codes. Lower score wins, then lower load, then name.
Physical endpoint IDs are sorted for deterministic selection.

The same pinned `servers/types.py`, `ServerFeatureEnum` and
`LogicalServer.__unpack_bitmap_features`, define `Features` as a bitmap:
Secure Core `1`, Tor `2`, P2P `4`, Streaming `8`, IPv6 `16`. The web adapter
retains only nonnegative integer values and labels only these verified bits.
Unknown bits are ignored. IPv6 describes the Proton server, not an enabled
feature of this client's IPv4 profiles; WireGuard eligibility still comes
from the physical-endpoint checks above, not a feature bit.

### Persistent WireGuard registration

Generate a 32-byte Ed25519 seed locally. Derive the raw Ed25519 public key and
the X25519 private scalar by hashing the seed with SHA-512, taking its first
32 bytes, and clamping bits as in `KeyHandler.__init__`.

The desktop key handler exposes an ASN.1-wrapped Ed25519 public key. The
supplemental router generator instead submits **raw** base64 Ed25519 public key
bytes; this client follows that persistent-registration path:

```json
{
  "ClientPublicKey": "<base64 raw Ed25519 public key>",
  "Mode": "persistent",
  "DeviceName": "GL-MT3000",
  "Features": {
    "platform": "Router",
    "peerName": "<logical server name>",
    "peerIp": "<physical EntryIP>",
    "peerPublicKey": "<physical X25519PublicKey>",
    "Bouncing": "<physical Label, omitted when absent>"
  }
}
```

Do not submit an unrelated `wg genkey` public key as the Ed25519 identity.
No private key leaves the router. No server-generated-key endpoint is used.
The response contains a certificate and metadata, not our private key.
The persistent response must identify `Mode: "persistent"` and have a serial
number and future expiration. Store expiry for the operator; do not assume
indefinite validity. Renewal repeats registration with the same public key
and features plus `Renew: true`. Revocation deletes by `ClientPublicKey`.

The profile uses the derived X25519 private key, physical server public key,
`EntryIP:51820`, address `10.2.0.2/32`, DNS `10.2.0.1`, default IPv4 allowed IPs,
and 25-second keepalive. IPv6 is deliberately omitted and must be governed by
GL.iNet's existing settings. No desktop local-agent certificate session is run.

## Source and cryptographic maintenance

The Lua implementation is written for this project; it is not a packaged copy
of Proton's Python client. The public signed-modulus fixture is attributed in
`tests/fixtures.lua`; the Python oracle independently computes public deterministic
SRP client and server results. Consult the pinned upstream licenses before
redistributing upstream code. Review pins/header version/format support whenever
upgrading the protocol reference.
