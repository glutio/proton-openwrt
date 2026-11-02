local root = os.getenv("PROTON_ROOT") or "/usr/lib/proton-openwrt"
package.path = root .. "/lib/?.lua;" .. package.path
local json = require("cjson.safe")
local store = require("proton.store")
local web = require("proton.web")
local path = arg[2]
assert(type(path) == "string" and path:match("^/tmp/lua_%w+$"), "invalid input path")
local f = assert(io.open(path))
local body = f:read(8193) or ""
f:close()
assert(io.open(path, "w")):close() -- erase the request; it may hold a password
local state
local ok, result = pcall(function()
    assert(#body <= 8192, "request too large")
    local params = assert(json.decode(body), "invalid request")
    state = store.open(os.getenv("PROTON_STATE_DIR") or "/etc/proton-openwrt")
    return web.handle(state, arg[1], params)
end)
if state then store.close(state) end
if not ok then result = { err_code = 1, err_msg = web.error(result) } end
f = assert(io.open(path, "w"))
assert(f:write(assert(json.encode(result))))
f:close()
print("ready")