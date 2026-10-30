const assert = require("node:assert/strict");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const key = process.argv[2];
assert(key, "Supply the SSH identity file for the test router.");
const args = ["-i", key, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "root@192.168.8.1"];
const ssh = command => promisify(execFile)("ssh", [...args, command], {timeout:150000});
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
let directory, released = false, done;
function hold() {
    const holder = spawn("ssh", [...args, `set -e
umask 077
dir=$(mktemp -d /tmp/proton-lock-test.XXXXXX)
trap 'rm -f "$dir/release"; rmdir "$dir"' 0
mkfifo "$dir/release"
timeout -k 1 60 lua5.4 - "$dir" <<'LUA'
package.path='/usr/lib/proton-openwrt/lib/?.lua;'..package.path
local store=require('proton.store')
local state=store.open('/etc/proton-openwrt')
store.lock(state)
local cached=assert(store.read(state,'catalog.json'))
cached.fetched_at=os.time()-301
store.write(state,'catalog.json',cached)
print('LOCKED:'..arg[1]);io.stdout:flush()
local release=assert(io.open(arg[1]..'/release'));release:read('*l');release:close()
store.close(state)
LUA`]);
    done = new Promise((resolve, reject) => {
        holder.on("error", reject);
        holder.on("close", code => code === 0 ? resolve() : reject(new Error("Test lock holder failed.")));
    });
    done.catch(() => {});
    let output = "";
    return new Promise((resolve, reject) => {
        holder.stdout.on("data", data => {
            output += data;
            const found = output.match(/LOCKED:(\/tmp\/proton-lock-test\.\w+)/);
            if (found) { directory = found[1]; resolve(); }
        });
        done.then(() => { if (!directory) reject(new Error("Test lock was not acquired.")); }, reject);
    });
}
async function release() {
    await ssh(`timeout -k 1 3 sh -c 'echo done > "$1/release"' sh ${quote(directory)}`);
    await done;
    released = true;
}
(async () => {
    try {
        async function rpc(action, params) {
            assert(["status", "countries", "cities", "servers", "refresh_catalog"].includes(action),
                "Only discovery and catalogue refresh requests are allowed.");
            const body = JSON.stringify({jsonrpc:"2.0",id:1,method:"call",params:["","proton-vpn",action,params || {}]});
            const {stdout} = await ssh("curl -fsS -w '\\n%{time_total}' http://127.0.0.1/rpc -H 'glinet: 1' -H 'Host: 192.168.8.1' -H 'Content-Type: application/json' --data " + quote(body));
            const split = stdout.lastIndexOf("\n");
            const response = JSON.parse(stdout.slice(0, split));
            assert(!response.error && response.result && !response.result.err_code,
                JSON.stringify(response.error || response.result));
            if (action !== "status") console.log(`${action}: ${stdout.slice(split + 1)}s; ${Buffer.byteLength(stdout.slice(0, split))} bytes; busy=${!!response.result.busy}`);
            return response.result;
        }
        assert(!(await rpc("refresh_catalog", {})).busy);
        await hold();
        const source = fs.readFileSync(path.join(__dirname, "..", "ui", "proton-vpn.js"), "utf8");
        let waits = 0;
        const options = vm.runInNewContext(source, {
            window: {},
            setTimeout: (resolve, delay) => { waits++; return setTimeout(resolve, delay); }
        });
        const state = Object.assign(options.data(), options.methods, {alive:true});
        let allowRefresh, updating;
        const gate = new Promise(resolve => { allowRefresh = resolve; });
        const refresh = state.refreshCatalog;
        state.refreshCatalog = (...args) => (updating = refresh.apply(state, args));
        state.rpc = async (action, params) => {
            if (action === "refresh_catalog") await gate;
            const response = await rpc(action, params);
            if (response.busy && !released) await release();
            return response;
        };
        await state.loadCountries();
        assert(!released && state.countries.length > 0 && state.catalog.stale);
        assert.equal(state.country, "");
        assert.equal(state.servers.length, 0);
        state.country = "US";
        await state.loadCities();
        assert(!released && state.cities.length > 0 && state.updating && !state.busy);
        state.city = state.cities.some(c => c.city === "Chicago") ? "Chicago" : state.cities[0].city;
        await state.loadServers();
        assert(!released && state.servers.length > 0);
        assert(state.servers.every(s => s.city === state.city));
        state.server = state.servers[0].name;
        allowRefresh();
        await updating;
        assert(released && waits > 0);
        assert(state.reloadPending && !state.catalog.stale);
        const selected = state.server;
        await state.loadCountries();
        assert.equal(state.server, selected);
        assert.equal(state.error, "");
        assert.equal(state.busy, false);
        console.log(`PASS: cached browsing bypassed actual account lock; stale refresh recovered; ${state.countries.length} countries, ${state.cities.length} cities, ${state.servers.length} nodes in ${state.city}; selection preserved. No VPN mutation requested.`);
    } finally {
        if (directory && !released) await release().catch(() => {});
    }
})().then(() => process.exit(0), error => { console.error(error.message); process.exit(1); });
