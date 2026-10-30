#!/bin/sh
set -eu
input=$(mktemp /tmp/proton-web.XXXXXX)
target=$(mktemp /tmp/proton-worker-target.XXXXXX)
trap 'rm -f "$input" "$target"' 0 1 2 15
export PROTON_ROOT="$PWD"
printf '{}' > "$input"
test "$(lua5.4 web_worker.lua status "$input")" = ready
lua - "$input" <<'LUA'
local f=assert(io.open(arg[1]));local r=require("cjson").decode(f:read("*a"));f:close()
assert(type(r.authenticated)=="boolean")
LUA

printf 'unchanged' > "$target"
rm -f "$input"
ln -s "$target" "$input"
if lua5.4 web_worker.lua status "$input"; then
    echo "Worker accepted a symlink." >&2; exit 1
fi
test "$(cat "$target")" = unchanged
rm -f "$input"
printf '{}' > "$input"
chmod 600 "$input"
lua5.4 - "$input" "$target" <<'LUA'
package.path=os.getenv("PROTON_ROOT").."/lib/?.lua;"..package.path
local input,target=arg[1],arg[2]
require("proton.web").handle=function()
    assert(os.remove(input))
    assert(os.execute("ln -s "..target.." "..input))
    return {checked=true}
end
arg={"test",input}
dofile("web_worker.lua")
LUA
test "$(cat "$target")" = unchanged
echo "PASS: worker response, symlink refusal and held descriptor after filename replacement"
