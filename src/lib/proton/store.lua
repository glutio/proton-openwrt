local ffi = require("ffi")
local json = require("cjson.safe")
ffi.cdef[[int open(const char *, int, ...); int flock(int, int); int close(int);]]
local M = {}

local function file(state, n)
    assert(type(n) == "string" and n:match("^[a-z][a-z0-9_.-]*$"), "invalid state filename")
    return state.path .. "/" .. n
end

function M.open(path)
    os.execute("mkdir -p -m 700 '" .. path:gsub("'", "'\\''") .. "'")
    return { path = path }
end

-- flock is released by the kernel even if the process is killed.
function M.lock(state)
    local fd = ffi.C.open(file(state, "lock"), 0x80042, 384) -- O_RDWR|O_CREAT|O_CLOEXEC, 0600
    assert(fd >= 0, "cannot open state lock")
    if ffi.C.flock(fd, 6) ~= 0 then -- LOCK_EX|LOCK_NB
        ffi.C.close(fd)
        error("another client is using this state directory")
    end
    state.lockfd = fd
end

function M.read(state, n)
    local f = io.open(file(state, n))
    if not f then return nil end
    local value = json.decode(f:read("a"))
    f:close()
    assert(type(value) == "table", "invalid saved state")
    return value
end

function M.write_text(state, n, data)
    local path = file(state, n)
    local f = assert(io.open(path .. ".tmp", "w"))
    local ok = f:write(data) and f:close()
    assert(ok and os.rename(path .. ".tmp", path), "state write failed")
end

function M.write(state, n, value)
    M.write_text(state, n, assert(json.encode(value)))
end

function M.delete(state, n)
    os.remove(file(state, n))
end

function M.close(state)
    if state.lockfd then ffi.C.close(state.lockfd); state.lockfd = nil end
end

return M