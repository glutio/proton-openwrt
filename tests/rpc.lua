local json = require("cjson.safe")
local rpc = dofile("ui/rpc.lua")
local function test(reply)
    local path
    ngx = { pipe = { spawn = function(args)
        coroutine.yield()
        path = args[5]
        assert(args[1] == "/bin/sh" and args[3]:find("umask 077", 1, true) and args[4] == "login" and path:match("^/tmp/lua_%w+$"))
        assert(not table.concat(args, " "):find("test-password", 1, true))
        local f = assert(io.open(path)); local request = assert(json.decode(f:read("*a"))); f:close()
        assert(request.password == "test-password")
        return { stdout_read_all = function()
            coroutine.yield()
            if not reply then return "" end
            local f = assert(io.open(path, "w")); assert(f:write(reply)); f:close()
            return "ready\n"
        end }
    end } }
    local thread = coroutine.create(function()
        return rpc.login({username="test-user",password="test-password"})
    end)
    local result
    repeat
        local ok, value = coroutine.resume(thread)
        assert(ok, tostring(value))
        result = value
    until coroutine.status(thread) == "dead"
    local f = io.open(path)
    if f then f:close(); os.remove(path); error("private input was not removed") end
    return result
end
assert(test('{"authenticated":true}').authenticated)
assert(test("not JSON").err_code == 1)
assert(test(nil).err_code == 1)
assert(#test(assert(json.encode({servers={{name=string.rep("X",100000)}}}))).servers[1].name == 100000)
print("PASS: Lua 5.1 yielding RPC, large file responses, secret-free arguments and request cleanup")