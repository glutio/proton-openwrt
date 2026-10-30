local json = require("cjson")
local ubus = require("ubus")
local bus
local ok, reply = pcall(function()
    local request = json.decode(io.read("*a"))
    assert(type(request) == "table" and type(request.module) == "string"
        and type(request.func) == "string" and type(request.params) == "table",
        "invalid local RPC request")
    bus = assert(ubus.connect(), "cannot connect to ubus")
    return assert(bus:call("gl-session", "call", request), "gl-session call failed")
end)
if bus then bus:close() end
if not ok then reply = { error = { message = tostring(reply) } } end
io.write(json.encode(reply), "\n")
