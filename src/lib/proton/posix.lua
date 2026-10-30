local ffi = require("ffi")
ffi.cdef[[
int open(const char *, int, ...);
int close(int);
]]
return ffi
