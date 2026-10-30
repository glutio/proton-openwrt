#!/bin/sh
# Install or update: curl -fsSL https://raw.githubusercontent.com/glutio/proton-openwrt/main/get.sh | sh
set -eu
REPO=glutio/proton-openwrt
test "$(id -u)" = 0 || { echo "Run as root." >&2; exit 1; }
VERSION=${1:-$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" | sed 's#.*/##')}
case "$VERSION" in v[0-9]*) ;; *) echo "Cannot determine release version." >&2; exit 1 ;; esac
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
curl -fsSL "https://github.com/$REPO/archive/refs/tags/$VERSION.tar.gz" | tar -xzf - -C "$dir"
cd "$dir"/proton-openwrt-*
if [ -e /usr/lib/proton-openwrt ]; then
    # Update: replace code only; sign-in and profiles in /etc/proton-openwrt are kept.
    if [ -e /usr/lib/proton-openwrt/remove-ui.sh ]; then sh /usr/lib/proton-openwrt/remove-ui.sh; fi
    rm -rf /usr/lib/proton-openwrt /usr/bin/proton-openwrt
fi
sh install.sh
sh install-ui.sh
echo "$VERSION" > /usr/lib/proton-openwrt/version
echo "Proton VPN $VERSION installed. Reload the admin panel and open VPN -> Proton VPN."
