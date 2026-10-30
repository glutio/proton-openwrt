local http = require("proton.http")
local store = require("proton.store")
local srp = require("proton.srp")
local servers = require("proton.servers")
local M = {}

local function text(s)
    return type(s) == "string" and #s > 0 and #s <= 16384 and not s:find("[%c]")
end

local function valid_scopes(s)
    if type(s) ~= "table" then return false end
    for k, v in pairs(s) do
        if type(k) ~= "number" or not text(v) then return false end
    end
    return true
end

local function tokens(s)
    assert(type(s) == "table" and text(s.UID) and text(s.AccessToken)
        and text(s.RefreshToken) and valid_scopes(s.Scopes), "invalid token response/state")
    return { UID = s.UID, AccessToken = s.AccessToken, RefreshToken = s.RefreshToken, Scopes = s.Scopes }
end

local function has_scope(session, scope)
    for _, value in ipairs(session.Scopes) do if value == scope then return true end end
    return false
end

local function require_vpn_scope(session)
    assert(not has_scope(session, "twofactor") and has_scope(session, "vpn"),
        "authenticated VPN scope required (2FA must be completed)")
end

function M.error_string(e)
    if type(e) ~= "table" then return tostring(e) end
    return string.format("%s: %s HTTP %d, Proton code %s%s", e.kind, e.path, e.status,
        tostring(e.code), e.retry_after and (", Retry-After " .. e.retry_after .. " seconds") or "")
end

local function raw(method, path, body, session)
    local status, data, retry = http.request(method, path, body, session)
    assert(type(status) == "number" and type(data) == "table" and type(data.Code) == "number",
        "malformed HTTP result")
    if status < 200 or status >= 300 or (data.Code ~= 1000 and data.Code ~= 1001) then
        local kind = "api"
        if status == 401 then kind = "authentication"
        elseif status == 403 then kind = "scope"
        elseif status == 429 then kind = "rate_limit" end
        if data.Code == 9001 or data.Code == 12087 then kind = "human_verification" end
        error({ kind = kind, path = path, status = status, code = data.Code, retry_after = retry }, 0)
    end
    return data
end

local function session(state)
    return tokens(assert(store.read(state, "session.json"), "not logged in; run login first"))
end

local function save(state, value)
    require_vpn_scope(value)
    store.write(state, "session.json", tokens(value))
end

function M.session_uid(state)
    local saved = session(state)
    require_vpn_scope(saved)
    return saved.UID
end

function M.refresh(state)
    local saved = session(state)
    local ok, response = pcall(raw, "POST", "/auth/refresh", {
        ResponseType = "token", GrantType = "refresh_token",
        RefreshToken = saved.RefreshToken, RedirectURI = "http://protonmail.ch",
    }, saved)
    if not ok then
        if type(response) == "table" and (response.status == 400 or response.status == 401
            or response.status == 422) and response.kind ~= "human_verification" then
            store.delete(state, "session.json")
            store.delete(state, "catalog.json")
        end
        error(response, 0)
    end
    response.UID = saved.UID
    local updated = tokens(response)
    save(state, updated)
    return updated
end

function M.request(state, method, path, body)
    local saved = session(state)
    require_vpn_scope(saved)
    local ok, result = pcall(raw, method, path, body, saved)
    if ok then return result end
    if type(result) ~= "table" or result.status ~= 401 then error(result, 0) end
    -- One refresh/replay only, with the rotated refresh token already persisted.
    return raw(method, path, body, M.refresh(state))
end

function M.discover(state)
    local account = M.request(state, "GET", "/vpn/v2")
    assert(type(account.VPN) == "table" and type(account.VPN.MaxTier) == "number",
        "missing account VPN entitlement")
    assert(type(account.Delinquent) == "number", "missing account delinquency")
    assert(account.Delinquent <= 2, "VPN account is delinquent")
    local result = M.request(state, "GET", "/vpn/v1/logicals?SecureCoreFilter=all&WithState=true")
    assert(type(result.LogicalServers) == "table" and #result.LogicalServers > 0,
        "missing or empty logical server list")
    local eligible = servers.eligible(result.LogicalServers, account.VPN.MaxTier)
    assert(#eligible > 0, "no eligible WireGuard endpoints")
    return eligible
end

function M.login(state, username, password, code_reader)
    assert(text(username) and #username <= 320, "invalid username")
    assert(not store.read(state, "session.json"), "already logged in; log out first")
    local info = raw("POST", "/auth/info", { Username = username })
    local payload, verify = srp.prove(password, info)
    payload.Username = username
    local response = raw("POST", "/auth", payload)
    assert(type(response.ServerProof) == "string", "missing SRP server proof")
    verify(response.ServerProof)
    local authenticated = tokens(response)
    local ok, err = pcall(function()
        if has_scope(authenticated, "twofactor") then
            local twofa = response["2FA"]
            assert(type(twofa) == "table" and ((tonumber(twofa.Enabled) or 0) & 1) ~= 0,
                "this account requires unsupported FIDO2-only authentication")
            assert(code_reader, "TOTP required")
            local code = code_reader()
            assert(type(code) == "string" and code:match("^%d%d%d%d%d%d$"), "expected six-digit TOTP")
            local answer = raw("POST", "/auth/2fa", { TwoFactorCode = code }, authenticated)
            assert(valid_scopes(answer.Scopes), "missing 2FA scopes")
            authenticated.Scopes = answer.Scopes
        end
        require_vpn_scope(authenticated)
    end)
    if not ok then
        pcall(raw, "DELETE", "/auth", nil, authenticated)
        error(err, 0)
    end
    save(state, authenticated)
    return M.discover(state)
end

function M.select(state, selector)
    local selected = servers.select(M.discover(state), selector)
    store.write(state, "selected.json", selected)
    return selected
end

function M.logout(state)
    local saved = store.read(state, "session.json")
    if saved then
        local ok, result = pcall(raw, "DELETE", "/auth", nil, tokens(saved))
        if not ok and (type(result) ~= "table" or result.status ~= 401) then error(result, 0) end
    end
    for _, n in ipairs({ "session.json", "selected.json", "catalog.json" }) do store.delete(state, n) end
end

return M
