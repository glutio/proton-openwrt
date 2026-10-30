const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "ui", "proton-vpn.js"), "utf8");

function component(rpc, delay) {
    let state;
    const options = vm.runInNewContext(source, {
        window: {},
        setTimeout: resolve => {
            delay(state);
            queueMicrotask(resolve);
        }
    });
    state = Object.assign(options.data(), options.methods, {alive:true,rpc});
    return state;
}

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

test("nodes sort by ascending load without changing cached order, including filtered results", () => {
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

test("progressive country, city and node loading recover from lock contention", async () => {
    const calls = {countries:0,cities:0,servers:0};
    let waits = 0;
    const state = component(async action => {
        if (action === "status") return {authenticated:true};
        if (++calls[action] === 1) return {busy:true};
        if (action === "countries") return {countries:[{country:"US",servers:1}]};
        if (action === "cities") return {cities:[{city:"Test",servers:1}]};
        return {servers:[{name:"US#1",city:"Test",load:1}]};
    }, state => {
        waits++;
        assert(state.busy);
        assert.match(state.notice, /waiting/);
        assert.equal(state.error, "");
    });
    await state.loadCountries();
    assert.equal(state.country, "");
    assert.equal(calls.cities, 0);
    assert.equal(calls.servers, 0);
    state.country = "US";
    await state.loadCities();
    assert.equal(state.country, "US");
    assert.equal(state.city, "");
    assert.equal(calls.servers, 0);
    state.city = "Test";
    await state.loadServers();
    assert.equal(state.server, "");
    assert.equal(state.servers.length, 1);
    assert.equal(waits, 3);
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
    }, () => { throw new Error("unexpected retry"); });
    const refresh = state.refreshCatalog;
    state.refreshCatalog = (...args) => (pending = refresh.apply(state, args));
    await state.loadCountries();
    assert(state.updating && !state.busy);
    state.country = "US";
    await state.loadCities();
    state.city = "Test";
    await state.loadServers();
    state.server = "US#1";
    state.search = "US";
    assert.equal(refreshes, 1);
    assert.equal(state.servers.length, 1);
    finish();
    await pending;
    assert(!state.updating && state.reloadPending && !state.catalog.stale);
    await state.loadCountries();
    assert.equal(state.city, "Test");
    assert.equal(state.server, "US#1");
    assert.equal(state.search, "US");
    assert.equal(refreshes, 1);
});

test("failed background refresh keeps the last catalogue and reports a separate error", async () => {
    let pending;
    const state = component(async action => {
        if (action === "status") return {authenticated:true};
        if (action === "refresh_catalog") throw new Error("upstream unavailable");
        return {cache:{fetched_at:1000,expires_at:1300,stale:true},countries:[{country:"US",servers:1}]};
    }, () => { throw new Error("unexpected retry"); });
    const refresh = state.refreshCatalog;
    state.refreshCatalog = (...args) => (pending = refresh.apply(state, args));
    await state.loadCountries();
    await pending;
    assert.equal(state.countries.length, 1);
    assert.equal(state.error, "");
    assert.equal(state.catalogError, "upstream unavailable");
    assert(!state.updating && !state.reloadPending);
});

test("changing country clears the previous city, node and search", async () => {
    const state = component(async action => action === "status" ? {} :
        {cities:[{city:"Toronto",servers:1}]}, () => { throw new Error("unexpected retry"); });
    Object.assign(state, {country:"CA",city:"Chicago",server:"US#1",search:"old",servers:[{name:"US#1"}]});
    await state.loadCities();
    assert.equal(state.city, "");
    assert.equal(state.server, "");
    assert.equal(state.search, "");
    assert.equal(state.servers.length, 0);
    assert.equal(state.cities[0].city, "Toronto");
});

test("a location removed during refresh clears choices when Lua returns an empty object", async () => {
    const state = component(async action => action === "status" ? {} :
        {countries:{},cities:{},servers:{}}, () => { throw new Error("unexpected retry"); });
    state.country = "US";
    state.city = "Test";
    state.server = "US#1";
    await state.loadServers(true);
    assert.equal(state.servers.length, 0);
    assert.equal(state.server, "");
    await state.loadCities(true);
    assert.equal(state.cities.length, 0);
    assert.equal(state.city, "");
    await state.loadCountries();
    assert.equal(state.countries.length, 0);
    assert.equal(state.country, "");
    assert.equal(state.error, "");
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
    }, () => { throw new Error("unexpected retry"); });
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
        }, () => { throw new Error("unexpected retry"); });
        assert.equal(await state.perform(action, {}), null);
        assert.equal(attempts, 1);
        assert.equal(action === "refresh_catalog" ? state.catalogError : state.error, "operation failed");
    }
});
