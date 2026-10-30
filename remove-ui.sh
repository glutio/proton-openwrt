#!/bin/sh
set -eu
test "$(id -u)" = 0 || { echo "Run as root." >&2; exit 1; }
nginx -t
rm -f /usr/share/oui/menu.d/proton-vpn.json \
    /usr/share/gl-validator.d/proton-vpn.lua /usr/lib/oui-httpd/rpc/proton-vpn \
    /www/views/gl-sdk4-ui-proton-vpn.common.js /www/views/gl-sdk4-ui-proton-vpn.common.js.gz \
    /usr/lib/proton-openwrt/web_worker.lua /usr/lib/proton-openwrt/lib/proton/web.lua \
    /usr/lib/proton-openwrt/remove-ui.sh
nginx -s reload
echo "Removed the web addon. Proton CLI, session, profiles and active VPN were left intact."
