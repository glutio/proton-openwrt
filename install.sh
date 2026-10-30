#!/bin/sh
set -eu
umask 077
cd "$(dirname "$0")"
test "$(id -u)" = 0 || { echo "Run as root." >&2; exit 1; }
lua5.4 -e 'require("ffi"); require("cjson.safe")'
lua -e 'require("ubus"); require("cjson")'
test -r /usr/lib/libcrypto.so.1.1
test -r /usr/lib/libcurl.so.4
if [ -e /usr/lib/proton-openwrt ]; then
    echo "/usr/lib/proton-openwrt already exists; refusing to overwrite." >&2
    exit 1
fi
if [ -e /usr/bin/proton-openwrt ] || [ -L /usr/bin/proton-openwrt ]; then
    echo "/usr/bin/proton-openwrt already exists; refusing to overwrite." >&2
    exit 1
fi
mkdir -m 755 /usr/lib/proton-openwrt
mkdir -m 755 /usr/lib/proton-openwrt/lib /usr/lib/proton-openwrt/bin
cp -R src/lib/proton /usr/lib/proton-openwrt/lib/
cp src/cli.lua src/gl_rpc.lua /usr/lib/proton-openwrt/
cp src/bin/proton-openwrt /usr/lib/proton-openwrt/bin/
chmod 755 /usr/lib/proton-openwrt/bin/proton-openwrt
ln -s /usr/lib/proton-openwrt/bin/proton-openwrt /usr/bin/proton-openwrt
echo "Installed. No GL.iNet network or VPN configuration was changed."
