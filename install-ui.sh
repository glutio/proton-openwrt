#!/bin/sh
set -eu
umask 077
cd "$(dirname "$0")"
test "$(id -u)" = 0 || { echo "Run as root." >&2; exit 1; }
test -r /usr/lib/proton-openwrt/lib/proton/client.lua
test -x /usr/bin/lua5.4
test -r /usr/lib/lua/oui/rpc.lua
for path in /usr/share/oui/menu.d/proton-vpn.json \
    /usr/share/gl-validator.d/proton-vpn.lua /usr/lib/oui-httpd/rpc/proton-vpn \
    /www/views/gl-sdk4-ui-proton-vpn.common.js /www/views/gl-sdk4-ui-proton-vpn.common.js.gz \
    /usr/lib/proton-openwrt/web_worker.lua \
    /usr/lib/proton-openwrt/remove-ui.sh; do
    test ! -e "$path" || { echo "Refusing to overwrite $path" >&2; exit 1; }
done
lua -e 'require("cjson.safe"); assert(loadfile("ui/rpc.lua")); assert(loadfile("ui/validator.lua"))'
lua5.4 -e 'assert(loadfile("src/web_worker.lua")); assert(loadfile("src/lib/proton/web.lua"))'
nginx -t
cp src/lib/proton/glinet.lua src/lib/proton/web.lua /usr/lib/proton-openwrt/lib/proton/
cp src/cli.lua src/web_worker.lua /usr/lib/proton-openwrt/
cp remove-ui.sh /usr/lib/proton-openwrt/
cp ui/rpc.lua /usr/lib/oui-httpd/rpc/proton-vpn
cp ui/validator.lua /usr/share/gl-validator.d/proton-vpn.lua
cp ui/menu.json /usr/share/oui/menu.d/proton-vpn.json
cp ui/proton-vpn.js /www/views/gl-sdk4-ui-proton-vpn.common.js
gzip -c ui/proton-vpn.js > /www/views/gl-sdk4-ui-proton-vpn.common.js.gz
chmod 644 /usr/lib/proton-openwrt/cli.lua /usr/lib/proton-openwrt/web_worker.lua \
    /usr/lib/proton-openwrt/lib/proton/glinet.lua /usr/lib/proton-openwrt/lib/proton/web.lua \
    /usr/lib/oui-httpd/rpc/proton-vpn /usr/share/gl-validator.d/proton-vpn.lua \
    /usr/share/oui/menu.d/proton-vpn.json /www/views/gl-sdk4-ui-proton-vpn.common.js \
    /www/views/gl-sdk4-ui-proton-vpn.common.js.gz
chmod 700 /usr/lib/proton-openwrt/remove-ui.sh
nginx -s reload
echo "Installed VPN -> Proton VPN. Reload the router web UI. No VPN or account state was changed."
