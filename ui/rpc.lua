local json = require("cjson.safe")
local M = {}

local function failure(stage)
    return { err_code = 1, err_msg = "Proton transport failed while " .. stage .. "." }
end

local function run(action, params)
    local body = json.encode(params or {})
    if not body or #body > 8192 then return failure("validating request") end
    local path = os.tmpname() -- mkstemp: private 0600 file
    local file = io.open(path, "w")
    if not file then os.remove(path); return failure("opening private input") end
    local written = file:write(body)
    file:close()
    if not written then os.remove(path); return failure("writing private input") end
    local process = ngx.pipe.spawn({ -- umask keeps state files private (nginx default is 022)
        "/bin/sh", "-c", 'umask 077; exec /usr/bin/lua5.4 /usr/lib/proton-openwrt/web_worker.lua "$0" "$1"', action, path,
    }, { stdout_read_timeout = 180000 })
    if not process then os.remove(path); return failure("starting worker") end
    local receipt = process:stdout_read_all()
    if not receipt:match("^ready%s*$") then os.remove(path); return failure("waiting for worker") end
    -- Full country server lists exceed the vendor command proxy's stdout transport.
    local output = io.open(path, "r")
    if not output then os.remove(path); return failure("reading worker response") end
    local reply = output:read("*a")
    output:close()
    os.remove(path)
    local result = json.decode(reply)
    if type(result) ~= "table" then return failure("decoding worker response") end
    return result
end

for _, action in ipairs({ "status", "countries", "cities", "servers", "refresh_catalog",
    "login", "logout", "connect", "disconnect", "restore" }) do
    local name = action
    M[name] = function(params) return run(name, params) end
end

return M
