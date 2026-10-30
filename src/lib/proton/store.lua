local ffi = require("proton.posix")
local json = require("cjson.safe")
local crypto = require("proton.crypto")
ffi.cdef[[
int mkdir(const char *, unsigned int);
int openat(int, const char *, int, ...);
int fsync(int);
long read(int, void *, size_t);
long write(int, const void *, size_t);
int renameat(int, const char *, int, const char *);
int unlinkat(int, const char *, int);
int flock(int, int);
unsigned int geteuid(void);
struct proton_stat {
    unsigned long dev, ino;
    unsigned int mode, nlink, uid, gid;
    unsigned long rdev, pad1;
    long size;
    int blksize, pad2;
    long blocks;
    long atime, atime_nsec, mtime, mtime_nsec, ctime, ctime_nsec;
    unsigned int unused[2];
};
int fstat(int, struct proton_stat *);
]]
local C = ffi.C
local M = {}
local NOFOLLOW, CLOEXEC, DIRECTORY = 0x8000, 0x80000, 0x4000

local function check(fd, directory)
    assert(fd >= 0, "cannot open private state (errno " .. ffi.errno() .. ")")
    local st = ffi.new("struct proton_stat[1]")
    assert(C.fstat(fd, st) == 0, "state stat failed")
    local kind = directory and 0x4000 or 0x8000
    if st[0].uid ~= C.geteuid() or st[0].mode & 0xf000 ~= kind or st[0].mode & 0x3f ~= 0 then
        C.close(fd)
        error("state must be owned by this user, private, and not a symlink")
    end
    return fd
end

local function name(n)
    assert(type(n) == "string" and n:match("^[a-z][a-z0-9_.-]*$"), "invalid state filename")
    return n
end

function M.open(path)
    assert(type(path) == "string" and path:sub(1, 1) == "/" and not path:find("\0", 1, true),
        "state path must be absolute")
    local created = C.mkdir(path, 448)
    assert(created == 0 or ffi.errno() == 17, "cannot create private state directory")
    local fd = check(C.open(path, NOFOLLOW | CLOEXEC | DIRECTORY), true)
    return { fd = fd, path = path }
end

function M.lock(state)
    local fd = check(C.openat(state.fd, "lock", NOFOLLOW | CLOEXEC | 2 | 64, ffi.cast("unsigned int", 384)))
    if C.flock(fd, 6) ~= 0 then
        C.close(fd)
        error("another client is using this state directory")
    end
    state.lockfd = fd
end

function M.read(state, n)
    local fd = C.openat(state.fd, name(n), NOFOLLOW | CLOEXEC)
    if fd < 0 and ffi.errno() == 2 then return nil end
    fd = check(fd)
    local chunks, total = {}, 0
    local buffer = ffi.new("char[8192]")
    while true do
        local size = tonumber(C.read(fd, buffer, 8192))
        if size < 0 or total + size > 32 * 1024 * 1024 then
            C.close(fd)
            error("state read failed or file too large")
        end
        if size == 0 then break end
        total = total + size
        chunks[#chunks + 1] = ffi.string(buffer, size)
    end
    C.close(fd)
    local value = json.decode(table.concat(chunks))
    assert(type(value) == "table", "invalid saved state")
    return value
end

function M.write_text(state, n, data)
    name(n)
    assert(type(data) == "string", "state output must be a string")
    local temp = "tmp-" .. crypto.hex(crypto.random(16))
    local fd = check(C.openat(state.fd, temp, NOFOLLOW | CLOEXEC | 1 | 64 | 128,
        ffi.cast("unsigned int", 384)))
    local ok, err = pcall(function()
        local offset = 0
        while offset < #data do
            local size = tonumber(C.write(fd, data:sub(offset + 1), #data - offset))
            assert(size > 0, "state write failed")
            offset = offset + size
        end
        assert(C.fsync(fd) == 0, "state fsync failed")
        assert(C.close(fd) == 0, "state close failed")
        fd = -1
        assert(C.renameat(state.fd, temp, state.fd, n) == 0, "atomic state replacement failed")
        assert(C.fsync(state.fd) == 0, "state directory fsync failed")
    end)
    if fd >= 0 then C.close(fd) end
    if not ok then
        C.unlinkat(state.fd, temp, 0)
        error(err, 0)
    end
end

function M.write(state, n, value)
    M.write_text(state, n, assert(json.encode(value)))
end

function M.delete(state, n)
    assert(C.unlinkat(state.fd, name(n), 0) == 0 or ffi.errno() == 2, "state removal failed")
    assert(C.fsync(state.fd) == 0, "state removal fsync failed")
end

function M.close(state)
    if state.lockfd then C.close(state.lockfd); state.lockfd = nil end
    if state.fd then C.close(state.fd); state.fd = nil end
end

return M
