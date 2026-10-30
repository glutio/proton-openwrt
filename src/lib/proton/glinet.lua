local ffi = require("proton.posix")
local json = require("cjson.safe")
local store = require("proton.store")
local client = require("proton.client")
local servers = require("proton.servers")
local profile = require("proton.profile")
local crypto = require("proton.crypto")
ffi.cdef[[int mkstemp(char *);]]
local M = {}

local function quote(s)
    return "'" .. s:gsub("'", "'\\''") .. "'"
end

function M.call(module, func, params)
    local template = "/tmp/proton-rpc-XXXXXX"
    local path = ffi.new("char[?]", #template + 1)
    ffi.copy(path, template)
    local fd = ffi.C.mkstemp(path)
    assert(fd >= 0, "cannot create private RPC request")
    path = ffi.string(path)
    local ok, reply = pcall(function()
        local body = assert(json.encode({ module = module, func = func, params = params or {} }))
        local offset = 0
        while offset < #body do
            local n = tonumber(ffi.C.write(fd, body:sub(offset + 1), #body - offset))
            assert(n > 0, "cannot write private RPC request")
            offset = offset + n
        end
        ffi.C.close(fd)
        fd = -1
        local root = os.getenv("PROTON_ROOT") or "/usr/lib/proton-openwrt"
        local pipe = assert(io.popen("lua " .. quote(root .. "/gl_rpc.lua") .. " < " .. quote(path), "r"))
        local text = pipe:read("*a")
        local success = pipe:close()
        assert(success, "local GL.iNet RPC helper failed")
        local value = assert(json.decode(text), "invalid GL.iNet RPC response")
        if value.error then
            error("GL.iNet " .. module .. "." .. func .. " failed: "
                .. tostring(value.error.code or value.error.message))
        end
        assert(value.result ~= nil, "missing GL.iNet RPC result")
        return value.result == json.null and {} or value.result
    end)
    if fd >= 0 then ffi.C.close(fd) end
    os.remove(path)
    if not ok then error(reply, 0) end
    return reply
end

local function configs(group_id)
    return assert(M.call("wg-client", "get_config_list", { group_id = group_id }).peers,
        "missing native WireGuard profile list")
end

local function config(p, group_id)
    assert(#crypto.unb64(p.keys.private_key) == 32 and #crypto.unb64(p.peer.public_key) == 32,
        "invalid WireGuard key")
    assert(type(p.peer.ip) == "string" and p.peer.ip:match("^%d+%.%d+%.%d+%.%d+$"), "invalid peer IP")
    return {
        group_id = group_id, name = "Proton " .. p.server,
        private_key = p.keys.private_key, address_v4 = "10.2.0.2/32",
        address_v6 = "", dns = "10.2.0.1", allowed_ips = "0.0.0.0/0",
        public_key = p.peer.public_key, end_point = p.peer.ip .. ":51820",
        persistent_keepalive = 25, presharedkey_enable = false,
    }
end

local function matches(peer, expected)
    for _, key in ipairs({ "name", "private_key", "address_v4", "dns", "allowed_ips",
        "public_key", "end_point", "persistent_keepalive" }) do
        if peer[key] ~= expected[key] then return false end
    end
    return true
end

function M.prepare(state)
    local selected = assert(store.read(state, "selected.json"), "select a server first")
    selected = servers.select(client.discover(state), selected.id)
    local p = profile.native(state, selected)
    local saved = store.read(state, "glinet.json") or { peers = {} }
    if not saved.group_id then
        local groups = M.call("wg-client", "get_group_list").groups
        for _, group in ipairs(groups) do
            assert(group.group_name ~= "Proton CLI", "unmanaged Proton CLI group already exists")
        end
        M.call("wg-client", "add_group", { group_name = "Proton CLI" })
        for _, group in ipairs(M.call("wg-client", "get_group_list").groups) do
            if group.group_name == "Proton CLI" then saved.group_id = group.group_id end
        end
        assert(saved.group_id, "native group creation was not confirmed")
        store.write(state, "glinet.json", saved)
    end
    local expected = config(p, saved.group_id)
    local peers = configs(saved.group_id)
    local id = saved.peers[p.server]
    if id then
        for _, peer in ipairs(peers) do
            if peer.peer_id == id then
                assert(matches(peer, expected), "managed native profile was edited; refusing to overwrite it")
                return { server = p.server, group_id = saved.group_id, peer_id = id }
            end
        end
        error("managed native profile was removed; refusing to replace it silently")
    end
    local found
    for _, peer in ipairs(peers) do
        if matches(peer, expected) then found = peer.peer_id end
    end
    if not found then
        M.call("wg-client", "add_config", expected)
        for _, peer in ipairs(configs(saved.group_id)) do
            if matches(peer, expected) then found = peer.peer_id end
        end
    end
    assert(found, "native profile import was not confirmed")
    saved.peers[p.server] = found
    store.write(state, "glinet.json", saved)
    return { server = p.server, group_id = saved.group_id, peer_id = found }
end

local function tunnel(id)
    local found
    for _, t in ipairs(M.call("vpn-client", "get_tunnel").tunnels) do
        if t.via.type == "wireguard" and (id and t.tunnel_id == id or not id and t.enabled) then
            assert(not found, "multiple WireGuard tunnels; specify the tunnel ID")
            found = t
        end
    end
    return assert(found, "no matching WireGuard tunnel; this command reuses an existing tunnel")
end

function M.connect(state, id)
    local original = store.read(state, "gl-restore.json")
    local t = tunnel(id or original and original.tunnel_id)
    assert(not original or original.tunnel_id == t.tunnel_id,
        "restore the previous tunnel before managing another")
    local imported = M.prepare(state)
    if not original then
        store.write(state, "gl-restore.json", {
            tunnel_id = t.tunnel_id, enabled = t.enabled,
            via = { type = t.via.type, configs = t.via.configs },
        })
    end
    M.call("vpn-client", "set_tunnel", {
        tunnel_id = t.tunnel_id, enabled = true,
        via = { type = "wireguard", configs = {
            { group_id = imported.group_id, id_list = { imported.peer_id } },
        } },
    })
    imported.tunnel_id = t.tunnel_id
    imported.requested = true
    return imported
end

function M.restore(state)
    local original = assert(store.read(state, "gl-restore.json"), "no saved connection to restore")
    tunnel(original.tunnel_id)
    M.call("vpn-client", "set_tunnel", original)
    store.delete(state, "gl-restore.json")
    return { tunnel_id = original.tunnel_id, restore_requested = true }
end

function M.disconnect(state)
    local original = assert(store.read(state, "gl-restore.json"), "no Proton-managed tunnel to disconnect")
    local saved = assert(store.read(state, "glinet.json"), "no managed Proton profiles")
    local t = tunnel(original.tunnel_id)
    assert(#t.via.configs == 1 and t.via.configs[1].group_id == saved.group_id,
        "tunnel no longer uses the managed Proton group; refusing to disconnect another VPN")
    M.call("vpn-client", "set_tunnel", { tunnel_id = t.tunnel_id, enabled = false })
    return { tunnel_id = t.tunnel_id, disconnect_requested = true }
end

function M.status()
    return M.call("vpn-client", "get_status")
end

return M
