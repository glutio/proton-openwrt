local json = require("cjson.safe")
local M = {}

local function quote(value) -- curl config string
    assert(not value:find("%c"), "invalid curl config value")
    return '"' .. value:gsub('[\\"]', "\\%0") .. '"'
end

function M.request(method, path, body, session)
    -- SessionHolder formats the API-core version, not the CLI package version.
    local app_version = "linux-vpn-cli@5.8.11+aarch64"
    assert(path:match("^/[a-zA-Z0-9/?=&._%%-]+$") and not path:find("..", 1, true), "invalid API path")
    assert(method == "GET" or method == "POST" or method == "DELETE", "invalid HTTP method")
    -- Options go through a private config file so tokens and passwords stay out of argv.
    local config = {
        "silent", "show-error", "dump-header = -", "proto = =https",
        "connect-timeout = 15", "max-time = 60", "max-filesize = 33554432",
        "url = " .. quote("https://vpn-api.proton.me" .. path),
        "request = " .. method,
        "user-agent = " .. quote("proton-openwrt/0.1 (Linux; OpenWrt/21.02)"),
        -- ProdEnvironment SPKI pins; CA and hostname checks stay enabled.
        "pinnedpubkey = " .. quote("sha256//CT56BhOTmj5ZIPgb/xD5mH8rY3BLo/MlhP7oPyJUEDo=;"
            .. "sha256//35Dx28/uzN3LeltkCBQ8RHK0tlNSa2kCpCRGNp34Gxc=;"
            .. "sha256//qYIukVc63DEITct8sFT7ebIq5qsWmuscaIKeJx+5J5A="),
        "header = " .. quote("Accept: application/json"),
        "header = " .. quote("Content-Type: application/json"),
        "header = " .. quote("x-pm-appversion: " .. app_version),
    }
    if session then
        config[#config + 1] = "header = " .. quote("x-pm-uid: " .. session.UID)
        config[#config + 1] = "header = " .. quote("Authorization: Bearer " .. session.AccessToken)
    end
    if body then config[#config + 1] = "data-binary = " .. quote(assert(json.encode(body))) end
    local name = os.tmpname()
    local file = assert(io.open(name, "w"))
    local written = file:write(table.concat(config, "\n"), "\n")
    local closed = file:close()
    if not written or not closed then os.remove(name); error("cannot write curl config") end
    local pipe = io.popen("curl -q -K " .. name .. " 2>&1")
    if not pipe then os.remove(name); error("cannot start curl") end
    local output = pipe:read(32 * 1024 * 1024 + 1) or ""
    local ok, _, code = pipe:close()
    os.remove(name)
    assert(#output <= 32 * 1024 * 1024, "HTTP response exceeds 32 MiB")
    assert(ok, "HTTPS transport failed (exit " .. tostring(code) .. ")")
    local status, headers
    repeat -- skip interim responses such as 100 Continue
        local block, rest = output:match("^(HTTP/.-\r\n)\r\n(.*)$")
        assert(block, "malformed HTTP response")
        status, headers, output = tonumber(block:match("^HTTP/%S+ (%d%d%d)")), block:lower(), rest
    until not output:find("^HTTP/")
    assert(status, "malformed HTTP status")
    local kind = headers:match("\ncontent%-type:[ \t]*([^\r\n]*)") or ""
    assert(kind:match("^application/json[ \t]*$") or kind:match("^application/json[ \t]*;"),
        "API returned non-JSON data (HTTP "
        .. tostring(status) .. ")")
    local decoded = json.decode(output)
    assert(type(decoded) == "table" and type(decoded.Code) == "number", "malformed API response")
    return status, decoded, headers:match("\nretry%-after:%s*(%d+)")
end

return M