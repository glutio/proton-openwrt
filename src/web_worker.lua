local root = os.getenv("PROTON_ROOT") or "/usr/lib/proton-openwrt"
package.path = root .. "/lib/?.lua;" .. package.path
local json = require("cjson.safe")
local store = require("proton.store")
local web = require("proton.web")
local ffi = require("proton.posix")
ffi.cdef[[int ftruncate(int, long); long lseek(int, long, int);]]
local C = ffi.C
local state
local fd, valid = -1, false
local ok, result = pcall(function()
    assert(type(arg[2]) == "string" and arg[2]:match("^/tmp/proton%-web%.%w+$"), "invalid input path")
    fd = C.open(arg[2], 2 | 0x8000 | 0x80000)
    assert(fd >= 0, "cannot open private input")
    local st = ffi.new("struct proton_stat[1]")
    assert(C.fstat(fd, st) == 0 and st[0].uid == C.geteuid()
        and st[0].mode & 0xf000 == 0x8000 and st[0].mode & 0x3f == 0 and st[0].nlink == 1,
        "input must be a private regular file")
    valid = true
    local buffer = ffi.new("char[8193]")
    local size = tonumber(C.read(fd, buffer, 8193))
    assert(size >= 0 and size <= 8192, "request too large")
    local body = ffi.string(buffer, size)
    assert(C.ftruncate(fd, 0) == 0, "cannot erase private input")
    local params = assert(json.decode(body))
    state = store.open(os.getenv("PROTON_STATE_DIR") or "/etc/proton-openwrt")
    return web.handle(state, arg[1], params)
end)
if state then store.close(state) end
if not ok then result = { err_code = 1, err_msg = web.error(result) } end
if not valid then if fd >= 0 then C.close(fd) end; os.exit(1) end
assert(C.ftruncate(fd, 0) == 0 and C.lseek(fd, 0, 0) == 0, "cannot prepare response")
local output, offset = assert(json.encode(result)), 0
while offset < #output do
    local n = tonumber(C.write(fd, output:sub(offset + 1), #output - offset))
    assert(n > 0, "cannot write response")
    offset = offset + n
end
assert(C.close(fd) == 0)
print("ready")
