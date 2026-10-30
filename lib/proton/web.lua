local store = require("proton.store")
local client = require("proton.client")
local servers = require("proton.servers")
local gl = require("proton.glinet")
local M = {}

local function reject(message)
    error({ kind = "input", message = message }, 0)
end

local function text(value, limit)
    return type(value) == "string" and #value > 0 and #value <= limit and not value:find("[%c]")
end

local function read_command(command)
    local pipe = assert(io.popen(command, "r"))
    local value = pipe:read("*a")
    pipe:close()
    return value
end

local function tunnel_matches(active, tunnels)
    for _, t in ipairs(tunnels) do
        if t.tunnel_id == active.tunnel_id and t.enabled == true and t.via.type == "wireguard" then
            for _, config in ipairs(t.via.configs or {}) do
                if config.group_id == active.group_id then
                    for _, id in ipairs(config.id_list or {}) do
                        if id == active.peer_id then return true end
                    end
                end
            end
        end
    end
    return false
end

local function cached(state)
    local uid = client.session_uid(state)
    local value = store.read(state, "catalog.json")
    if value and value.uid == uid then return value end
end

local function cache_info(value)
    local now = os.time()
    return { fetched_at = value.fetched_at, expires_at = value.fetched_at + 300,
        stale = now < value.fetched_at or now >= value.fetched_at + 300 }
end

local function save_catalog(state, discovered)
    local list = {}
    for _, s in ipairs(discovered) do
        list[#list + 1] = { name = s.name, country = s.country,
            city = s.city ~= "" and s.city or "Unspecified", load = s.load, tier = s.tier,
            features = type(s.features) == "number" and s.features >= 0 and math.tointeger(s.features) or nil }
    end
    local value = { uid = client.session_uid(state), fetched_at = os.time(), servers = list }
    store.write(state, "catalog.json", value)
    return value
end

local function refresh_catalog(state, force)
    local value = cached(state)
    if value and not force and not cache_info(value).stale then return value end
    local locked, err = pcall(store.lock, state)
    if not locked then
        if type(err) == "string" and err:find("another client", 1, true) then return nil end
        error(err, 0)
    end
    value = cached(state)
    if value and not force and not cache_info(value).stale then return value end
    return save_catalog(state, client.discover(state))
end

function M.status(state)
    local session = store.read(state, "session.json")
    local selected = store.read(state, "selected.json")
    local original = store.read(state, "gl-restore.json")
    local saved = store.read(state, "glinet.json")
    local result = {
        authenticated = session ~= nil, restore_available = original ~= nil,
        managed = false, connected = false,
    }
    if selected then
        result.selected = { name = selected.name, country = selected.country }
    end
    local status = gl.status()
    local tunnels = gl.call("vpn-client", "get_tunnel").tunnels or {}
    for _, active in ipairs(status.status_list or {}) do
        if not result.connection or original and active.tunnel_id == original.tunnel_id then
            result.connection = {
                name = active.peer_name or active.name, tunnel_id = active.tunnel_id,
                enabled = active.enabled, status = active.status, interface = active.via,
                rx_bytes = active.rx_bytes, tx_bytes = active.tx_bytes,
            }
            result.connected, result.key_matches, result.last_handshake = false, nil, nil
            result.managed = saved ~= nil and active.group_id == saved.group_id
            if active.via and active.via:match("^wgclient%d+$") then
                result.connection.matches_configuration = tunnel_matches(active, tunnels)
            end
            if result.managed and result.connection.matches_configuration then
                local profiles = store.read(state, "native-profiles.json") or {}
                for name, id in pairs(saved.peers) do
                    local p = profiles[name]
                    if id == active.peer_id and p and p.certificate then
                        local public = read_command("wg show " .. active.via .. " public-key 2>/dev/null")
                            :gsub("%s+$", "")
                        result.key_matches = public == p.keys.wireguard_public_key
                        local handshakes = read_command("wg show " .. active.via .. " latest-handshakes 2>/dev/null")
                        for line in handshakes:gmatch("[^\n]+") do
                            local peer, when = line:match("^(%S+)%s+(%d+)")
                            if peer == p.peer.public_key then result.last_handshake = tonumber(when) end
                        end
                        result.connected = active.enabled == true and active.status == 1
                            and result.key_matches and (result.last_handshake or 0) > 0
                    end
                end
            end
            if original and active.tunnel_id == original.tunnel_id then break end
        end
    end
    return result
end

function M.handle(state, action, params)
    if type(params) ~= "table" then reject("Invalid request.") end
    if action == "status" then return M.status(state) end
    if action == "refresh_catalog" then
        if params.force ~= nil and type(params.force) ~= "boolean" then reject("Invalid refresh request.") end
        local value = refresh_catalog(state, params.force)
        return value and { cache = cache_info(value) } or { busy = true }
    end
    if action == "countries" or action == "cities" or action == "servers" then
        if action ~= "countries" and (type(params.country) ~= "string"
            or not params.country:match("^[A-Z][A-Z]$")) then reject("Select a country.") end
        if action == "servers" and params.city ~= nil and not text(params.city, 128) then
            reject("Select a city.")
        end
        local value = cached(state) or refresh_catalog(state, false)
        if not value then return { busy = true } end
        local result = { cache = cache_info(value) }
        if action == "countries" then
            result.countries = servers.countries(value.servers)
        elseif action == "cities" then
            local counts, out = {}, {}
            for _, s in ipairs(value.servers) do
                if s.country == params.country then counts[s.city] = (counts[s.city] or 0) + 1 end
            end
            for city, count in pairs(counts) do out[#out + 1] = { city = city, servers = count } end
            table.sort(out, function(a, b) return a.city < b.city end)
            result.cities = out
        else
            local out = {}
            for _, s in ipairs(value.servers) do
                if s.country == params.country and (params.city == nil or s.city == params.city) then
                    out[#out + 1] = { name = s.name, city = s.city, load = s.load, tier = s.tier,
                        features = s.features }
                end
            end
            result.servers = out
        end
        return result
    end
    store.lock(state)
    if action == "login" then
        if store.read(state, "session.json") then reject("Already signed in; the existing session was kept.") end
        if not text(params.username, 320) or type(params.password) ~= "string"
            or #params.password == 0 or #params.password > 1024 or params.password:find("\0", 1, true) then
            reject("Enter a username and password.")
        end
        if params.totp ~= nil and (type(params.totp) ~= "string"
            or params.totp ~= "" and not params.totp:match("^%d%d%d%d%d%d$")) then
            reject("TOTP must contain six digits.")
        end
        local list = client.login(state, params.username, params.password, function()
            if not params.totp or params.totp == "" then
                error({ kind = "totp_required" }, 0)
            end
            return params.totp
        end)
        save_catalog(state, list)
        return { authenticated = true }
    elseif action == "logout" then
        client.logout(state)
        return { authenticated = false }
    elseif action == "connect" then
        if not text(params.server, 128) then reject("Select a server.") end
        if params.tunnel_id ~= nil and (type(params.tunnel_id) ~= "number"
            or params.tunnel_id <= 0 or params.tunnel_id % 1 ~= 0) then reject("Invalid tunnel ID.") end
        client.select(state, params.server)
        return gl.connect(state, params.tunnel_id)
    elseif action == "disconnect" then
        return gl.disconnect(state)
    elseif action == "restore" then
        return gl.restore(state)
    end
    reject("Unknown operation.")
end

function M.error(err)
    if type(err) == "table" then
        if err.kind == "input" then return err.message end
        if err.kind == "totp_required" then return "Enter your current six-digit TOTP and submit login again." end
        if err.kind == "human_verification" then return "Proton requires human verification, which this client cannot complete." end
        if err.kind == "authentication" then return "Proton authentication failed; sign in again." end
        if err.kind == "scope" then return "The Proton session lacks the required VPN permission." end
        if err.kind == "rate_limit" then return "Proton rate-limited the request; try again later." end
        if err.kind == "api" then
            return string.format("Proton rejected the request (HTTP %d, code %d).",
                tonumber(err.status) or 0, tonumber(err.code) or 0)
        end
    end
    local message = type(err) == "string" and err or ""
    for _, known in ipairs({
        { "another client", "Another Proton operation is running; try again when it finishes." },
        { "not logged in", "Sign in to Proton first." },
        { "FIDO2", "FIDO2-only authentication is not supported." },
        { "no eligible server", "The selected server is unavailable or not included in your plan." },
        { "multiple WireGuard", "Multiple WireGuard tunnels exist; enter the desired tunnel ID." },
        { "no matching WireGuard", "Choose an existing WireGuard tunnel in GL.iNet's VPN Dashboard first." },
        { "no saved connection", "There is no original connection saved to restore." },
        { "no Proton-managed", "There is no Proton-managed connection to disconnect." },
        { "refusing to disconnect", "The tunnel now uses another VPN; it was not disconnected." },
        { "managed native profile", "The managed profile was edited or removed in GL.iNet; it was not overwritten." },
        { "saved physical endpoint", "The cached physical endpoint is unavailable; choose another server." },
        { "unfinished native registration", "Proton registration was interrupted; its pending key was retained on the router." },
    }) do
        if message:find(known[1], 1, true) then return known[2] end
    end
    return "The router could not complete the Proton operation. No secret diagnostic data was returned."
end

return M
