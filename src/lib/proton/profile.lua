local crypto = require("proton.crypto")
local client = require("proton.client")
local store = require("proton.store")
local M = {}

local function register(state, p, renew)
    local r = client.request(state, "POST", "/vpn/v1/certificate", {
        ClientPublicKey = p.keys.public_key, Mode = "persistent",
        DeviceName = "GL-MT3000", Features = p.features, Renew = renew or nil,
    })
    assert(r.Mode == "persistent" and type(r.SerialNumber) == "string" and #r.SerialNumber > 0
        and type(r.ExpirationTime) == "number" and r.ExpirationTime > os.time(),
        "invalid persistent-certificate response")
    return { SerialNumber = r.SerialNumber, ExpirationTime = r.ExpirationTime, RefreshTime = r.RefreshTime }
end

function M.native(state, selected)
    local profiles = store.read(state, "native-profiles.json") or {}
    local p = profiles[selected.name]
    if not p then
        local peer = selected.peers[1]
        local features = { platform = "Router", peerName = selected.name,
            peerIp = peer.ip, peerPublicKey = peer.public_key, Bouncing = peer.label }
        p = { keys = crypto.keypair(), peer = peer, features = features, server = selected.name }
        profiles[selected.name] = p
        -- Retain the key before a POST whose result could be lost.
        store.write(state, "native-profiles.json", profiles)
        p.certificate = register(state, p)
        store.write(state, "native-profiles.json", profiles)
    end
    assert(p.certificate, "unfinished native registration; retained key is in native-profiles.json")
    local available = false
    for _, peer in ipairs(selected.peers) do
        if peer.ip == p.peer.ip and peer.public_key == p.peer.public_key and peer.label == p.peer.label then
            available = true
        end
    end
    assert(available, "saved physical endpoint is unavailable; select another server")
    if p.certificate.ExpirationTime <= os.time() + 60 then
        p.certificate = register(state, p, true)
        store.write(state, "native-profiles.json", profiles)
    end
    return p
end

return M
