const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "ui", "proton-vpn.js"), "utf8");

function component(rpc, delay) {
    let state;
    const options = vm.runInNewContext(source, {
        window: {confirm: () => true},
        setTimeout: resolve => {
            delay(state);
            queueMicrotask(resolve);
        }
    });
    state = Object.assign(options.data(), options.methods, {alive:true,rpc});
    for (const name of Object.keys(options.computed)) {
        Object.defineProperty(state, name, {get: () => options.computed[name].call(state)});
    }
    return state;
}
// Values created inside the vm context have another realm's prototypes.
const plain = value => JSON.parse(JSON.stringify(value));
const noRetry = () => { throw new Error("unexpected retry"); };

test("Connected text and readiness reject stale profile state during handoff", () => {
    const options = vm.runInNewContext(source, {window:{}});
    const state = {info:{managed:true,connected:true,
        connection:{name:"Proton US#1",enabled:true,status:1,matches_configuration:false}}};
    const text = () => {
        state.isConnected = options.computed.isConnected.call(state);
        return options.computed.connectionText.call(state);
    };
    assert.equal(text(), "Connecting: Proton US#1");
    assert.equal(state.isConnected, false);
    state.info.connection.matches_configuration = true;
    assert.equal(text(), "Connected: Proton US#1");
    state.info.connection.status = 2;
    assert.equal(text(), "Connecting: Proton US#1");
    state.info.managed = false;
    state.info.connection.status = 1;
    state.info.connection.matches_configuration = false;
    assert.equal(text(), "Existing VPN: Proton US#1 (transitioning)");
    state.info.connection.matches_configuration = true;
    assert.equal(text(), "Existing VPN: Proton US#1 (connected)");
});

test("node capability labels decode official flags and ignore unknown or absent flags", () => {
    const options = vm.runInNewContext(source, {window:{}});
    const labels = features => options.methods.nodeFeatures({features});
    assert.equal(labels(0), "");
    assert.equal(labels(undefined), "");
    assert.equal(labels(2), "Tor");
    assert.equal(labels(12), "P2P, Streaming");
    assert.equal(labels(31), "Secure Core, Tor, P2P, Streaming, IPv6 server");
    assert.equal(labels(64), "");
});

test("USA is first and remaining countries sort by displayed name without changing cached order", () => {
    const options = vm.runInNewContext(source, {window:{}});
    const state = {countries:["AE","DE","CA","US","ZA","AL"].map(country => ({country,servers:7}))};
    const original = state.countries.slice();
    const countries = options.computed.countryOptions.call(state);
    assert.deepEqual(countries.map(c => c.country), ["US","AL","CA","DE","ZA","AE"]);
    assert.equal(countries[3].label, "Germany");
    assert.equal(countries[3].servers, 7);
    assert.deepEqual(state.countries, original);
    state.countries = state.countries.filter(c => c.country !== "US");
    assert.deepEqual(options.computed.countryOptions.call(state).map(c => c.country),
        ["AL","CA","DE","ZA","AE"]);
});

test("servers sort by ascending load without changing cached order, including filtered results", () => {
    const options = vm.runInNewContext(source, {window:{}});
    const state = {search:"",servers:[
        {name:"US#slow",city:"Chicago",load:82},
        {name:"US#fast",city:"Chicago",load:5},
        {name:"CA#empty",city:"Toronto",load:0},
        {name:"US#same",city:"Chicago",load:5}
    ]};
    const original = state.servers.slice();
    const filtered = () => options.computed.filteredServers.call(state);
    assert.deepEqual(filtered().map(s => s.load), [0,5,5,82]);
    assert.deepEqual(state.servers, original);
    state.search = " chicago ";
    assert.deepEqual(filtered().map(s => s.name), ["US#fast","US#same","US#slow"]);
    state.search = "missing";
    assert.equal(filtered().length, 0);
});

test("progressive country and city loading recover from lock contention", async () => {
    const calls = {countries:0,cities:0,servers:0};
    let waits = 0;
    const state = component(async action => {
        if (action === "status") return {authenticated:true};
        if (++calls[action] === 1) return {busy:true};
        if (action === "countries") return {countries:[{country:"US",servers:1}]};
        return {cities:[{city:"Test",servers:1}]};
    }, state => {
        waits++;
        assert(state.busy);
        assert.match(state.notice, /waiting/);
        assert.equal(state.error, "");
    });
    await state.loadCountries();
    assert.equal(state.countries.length, 1);
    assert.equal(calls.cities, 0);
    await state.pickCountry("US");
    assert.equal(state.drawerCountry, "US");
    assert.equal(state.drawerCities.length, 1);
    assert.equal(calls.servers, 0);
    assert.equal(waits, 2);
    assert.equal(state.error, "");
    assert.equal(state.notice, "");
    assert.equal(state.busy, false);
});

test("stale catalogue refresh is single-flight while saved locations remain usable", async () => {
    let finish, pending, refreshes = 0;
    let stale = true;
    const state = component(async (action, params) => {
        const cache = {fetched_at:stale ? 1000 : 1400,expires_at:stale ? 1300 : 1700,stale};
        if (action === "status") return {authenticated:true};
        if (action === "refresh_catalog") {
            refreshes++;
            assert.equal(params.force, false);
            return new Promise(resolve => { finish = () => { stale = false; resolve({cache:{fetched_at:1400,expires_at:1700,stale:false}}); }; });
        }
        if (action === "countries") return {cache,countries:[{country:"US",servers:1}]};
        if (action === "cities") return {cache,cities:[{city:"Test",servers:1}]};
        return {cache,servers:[{name:"US#1",city:"Test",load:1}]};
    }, noRetry);
    const refresh = state.refreshCatalog;
    state.refreshCatalog = (...args) => (pending = refresh.apply(state, args));
    await state.loadCountries();
    assert(state.updating && !state.busy);
    await state.pickCountry("US");
    state.toggleCity(state.drawerCities[0]);
    await state.applyDrawer();
    assert.equal(state.servers.length, 1);
    state.server = "US#1";
    state.search = "US";
    assert.equal(refreshes, 1);
    assert.equal(state.drawerCities.length, 1);
    finish();
    await pending;
    assert(!state.updating && state.reloadPending && !state.catalog.stale);
    await state.reload();
    assert.equal(state.server, "US#1");
    assert.equal(state.search, "US");
    assert.equal(state.drawerCities.length, 1);
    assert.equal(refreshes, 1);
});

test("failed background refresh keeps the last catalogue and reports a separate error", async () => {
    let pending;
    const state = component(async action => {
        if (action === "status") return {authenticated:true};
        if (action === "refresh_catalog") throw new Error("upstream unavailable");
        return {cache:{fetched_at:1000,expires_at:1300,stale:true},countries:[{country:"US",servers:1}]};
    }, noRetry);
    const refresh = state.refreshCatalog;
    state.refreshCatalog = (...args) => (pending = refresh.apply(state, args));
    await state.loadCountries();
    await pending;
    assert.equal(state.countries.length, 1);
    assert.equal(state.error, "");
    assert.equal(state.catalogError, "upstream unavailable");
    assert(!state.updating && !state.reloadPending);
});

test("changing country in the drawer clears the previous cities and search but keeps picks", async () => {
    const state = component(async action => action === "status" ? {} :
        {cities:[{city:"Toronto",servers:1}]}, noRetry);
    Object.assign(state, {drawerCountry:"US",drawerCities:[{city:"Chicago",servers:2}],drawerSearch:"old"});
    state.toggleCity(state.drawerCities[0]);
    await state.pickCountry("CA");
    assert.equal(state.drawerSearch, "");
    assert.equal(state.drawerCities[0].city, "Toronto");
    assert.deepEqual(plain(state.pickList), [{country:"US",city:"Chicago",servers:2}]);
    state.toggleCity(state.drawerCities[0]);
    state.toggleCity(state.drawerCities[0]);
    assert.equal(state.pickList.length, 1);
});

test("lists emptied during refresh clear the selection when Lua returns an empty object", async () => {
    const state = component(async action => action === "status" ? {} :
        {countries:{},cities:{},servers:{}}, noRetry);
    Object.assign(state, {server:"US#1",servers:[{name:"US#1"}],countries:[{country:"US",servers:1}],
        listed:[{country:"US",city:"Test",servers:1}]});
    await state.pickCountry("US");
    assert.equal(state.drawerCities.length, 0);
    await state.reload();
    assert.equal(state.countries.length, 0);
    assert.equal(state.servers.length, 0);
    assert.equal(state.server, "");
    assert.equal(state.error, "");
});

test("Apply lists every server of the picked cities and imports nothing", async () => {
    const calls = [];
    const state = component(async (action, params) => {
        if (action === "status") return {authenticated:true};
        assert.equal(action, "servers");
        calls.push(plain(params));
        const count = params.city === "Chicago" ? 250 : 2;
        return {servers:Array.from({length:count}, (_, i) => ({name:params.country + "#" + params.city + i,city:params.city,load:i % 100}))};
    }, noRetry);
    state.openDrawer();
    state.drawerCountry = "US";
    state.toggleCity({city:"Chicago",servers:250});
    state.drawerCountry = "CA";
    state.toggleCity({city:"Toronto",servers:2});
    await state.applyDrawer();
    assert.deepEqual(calls, [{country:"US",city:"Chicago"},{country:"CA",city:"Toronto"}]);
    assert.equal(state.servers.length, 252);
    assert.equal(state.servers[251].country, "CA");
    assert.equal(state.showDrawer, false);
    state.server = "CA#Toronto1";
    state.openDrawer();
    assert.equal(state.pickList.length, 2, "Reopening the drawer shows the listed cities.");
    state.drawerCountry = "US";
    state.toggleCity({city:"Chicago",servers:250});
    await state.applyDrawer();
    assert.equal(state.servers.length, 2);
    assert.equal(state.server, "CA#Toronto1", "A still-listed selection is kept.");
    state.openDrawer();
    state.drawerCountry = "CA";
    state.toggleCity({city:"Toronto",servers:2});
    await state.applyDrawer();
    assert.equal(state.servers.length, 0);
    assert.equal(state.server, "");
});

test("a failed server request keeps the previous list", async () => {
    const state = component(async action => {
        if (action === "status") return {};
        throw new Error("upstream unavailable");
    }, noRetry);
    Object.assign(state, {servers:[{name:"US#1"}],server:"US#1",drawerCountry:"US"});
    state.toggleCity({city:"Test",servers:1});
    await state.applyDrawer();
    assert.equal(state.servers.length, 1);
    assert.equal(state.listed.length, 0);
    assert.equal(state.server, "US#1");
    assert.equal(state.error, "upstream unavailable");
});

test("an ambiguous tunnel opens the tunnel picker, whose choice is sent with the retry", async () => {
    const web = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "proton", "web.lua"), "utf8");
    for (const message of ["Multiple WireGuard tunnels exist; enter the desired tunnel ID.",
        "That VPN tunnel no longer exists; choose another tunnel."]) {
        assert(web.includes(message), "The page matches this backend message.");
        const sent = [];
        const state = component(async (action, params) => {
            if (action === "status") return {authenticated:true,tunnels:[{tunnel_id:1},{tunnel_id:2}]};
            sent.push(plain(params));
            if (!params.tunnel_id) throw new Error(message);
            return {requested:true};
        }, noRetry);
        await state.startServer({name:"US#1"});
        assert(state.showTunnel);
        assert.equal(state.error, "");
        state.tunnelPick = 2;
        await state.startOnTunnel();
        assert.deepEqual(sent, [{server:"US#1"},{server:"US#1",tunnel_id:2}]);
        assert(!state.showTunnel);
        assert.match(state.notice, /Connection requested/);
    }
});

test("discovery contention has a bounded wait", async () => {
    let waits = 0;
    const state = component(async action => action === "status" ? {} : {busy:true}, () => {
        if (++waits > 100) throw new Error("unbounded retry loop");
    });
    assert.equal(await state.perform("countries"), null);
    assert.match(state.error, /still busy/);
    assert.equal(state.busy, false);
});

test("leaving the page cancels pending discovery recovery", async () => {
    let calls = 0;
    const state = component(async () => { calls++; return {busy:true}; },
        state => { state.alive = false; });
    assert.equal(await state.perform("servers", {country:"US"}), null);
    assert.equal(calls, 1);
    assert.equal(state.busy, false);
});

test("a finished request does not start server discovery after leaving the page", async () => {
    let calls = 0;
    const state = component(async action => {
        calls++;
        assert.equal(action, "countries");
        state.alive = false;
        return {countries:[{country:"US",servers:1}]};
    }, noRetry);
    await state.loadCountries();
    assert.equal(calls, 1);
});

test("mutations and ordinary discovery errors are never retried", async () => {
    for (const action of ["connect", "disconnect", "restore", "login", "logout", "countries", "cities", "servers", "refresh_catalog"]) {
        let attempts = 0;
        const state = component(async method => {
            if (method === "status") return {};
            attempts++;
            throw new Error("operation failed");
        }, noRetry);
        assert.equal(await state.perform(action, {}), null);
        assert.equal(attempts, 1);
        assert.equal(action === "refresh_catalog" ? state.catalogError : state.error, "operation failed");
    }
});
