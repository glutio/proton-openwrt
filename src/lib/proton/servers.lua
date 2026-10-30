local M = {}

local function ipv4(ip)
    if type(ip) ~= "string" then return false end
    local a, b, c, d = ip:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
    for _, v in ipairs({ a, b, c, d }) do
        if #v > 3 or tonumber(v) > 255 or tostring(tonumber(v)) ~= v then return false end
    end
    return d ~= nil
end

local function publickey(key)
    -- Canonical base64 for 32 bytes: one padding character and two zero pad bits.
    return type(key) == "string" and #key == 44
        and key:match("^[A-Za-z0-9+/]+[AEIMQUYcgkosw048]=$") ~= nil
end

local function safe(value, max)
    return type(value) == "string" and #value > 0 and #value <= max and not value:find("[%c]")
end

function M.eligible(logicals, max_tier)
    local out = {}
    for _, logical in ipairs(logicals) do
        if logical.Status == 1 and type(logical.Tier) == "number" and logical.Tier <= max_tier
            and safe(logical.ID, 512) and safe(logical.Name, 128)
            and type(logical.ExitCountry) == "string" and logical.ExitCountry:match("^[A-Z][A-Z]$")
            and type(logical.Servers) == "table" then
            local peers = {}
            for _, peer in ipairs(logical.Servers) do
                if peer.Status == 1 and ipv4(peer.EntryIP) and publickey(peer.X25519PublicKey)
                    and safe(peer.ID, 512) then
                    peers[#peers + 1] = {
                        id = peer.ID, ip = peer.EntryIP, public_key = peer.X25519PublicKey,
                        domain = safe(peer.Domain, 255) and peer.Domain or nil,
                        label = safe(peer.Label, 128) and peer.Label or nil,
                    }
                end
            end
            if #peers > 0 then
                table.sort(peers, function(a, b) return a.id < b.id end)
                out[#out + 1] = {
                    id = logical.ID, name = logical.Name, country = logical.ExitCountry,
                    city = safe(logical.City, 128) and logical.City or "",
                    tier = logical.Tier, features = logical.Features,
                    load = tonumber(logical.Load) or 100,
                    score = tonumber(logical.Score) or 1000000000, peers = peers,
                }
            end
        end
    end
    table.sort(out, function(a, b)
        if a.score ~= b.score then return a.score < b.score end
        if a.load ~= b.load then return a.load < b.load end
        return a.name < b.name
    end)
    return out
end

function M.countries(servers)
    local counts, out = {}, {}
    for _, server in ipairs(servers) do counts[server.country] = (counts[server.country] or 0) + 1 end
    for country, count in pairs(counts) do out[#out + 1] = { country = country, servers = count } end
    table.sort(out, function(a, b) return a.country < b.country end)
    return out
end

function M.select(servers, selector)
    assert(type(selector) == "string" and #selector > 0, "server name, ID, or country is required")
    for _, server in ipairs(servers) do
        if server.id == selector or server.name:upper() == selector:upper()
            or server.country == selector:upper() then
            return server
        end
    end
    error("no eligible server matches selection")
end

return M
