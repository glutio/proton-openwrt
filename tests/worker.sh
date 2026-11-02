#!/bin/sh
set -eu
input=$(mktemp /tmp/lua_XXXXXX)
trap 'rm -f "$input"' 0 1 2 15
export PROTON_ROOT="$PWD/src"
printf '{}' > "$input"
test "$(lua5.4 src/web_worker.lua status "$input")" = ready
lua - "$input" <<'LUA'
local f=assert(io.open(arg[1]));local r=require("cjson").decode(f:read("*a"));f:close()
assert(type(r.authenticated)=="boolean")
LUA
if lua5.4 src/web_worker.lua status /etc/passwd 2>/dev/null; then
    echo "Worker accepted a path outside /tmp/lua_*." >&2; exit 1
fi
echo "PASS: worker request/response and input path check"