(function () {
    "use strict";
    // Declarations copied from GL.iNet's VPN Client Profile view (its CSS is component-scoped), theme variables only.
    var R = "#proton-vpn-view ";
    var STYLE = [
        "#proton-vpn-view{padding:20px 0;color:var(--text-regular)}",
        R + ".client-body{position:relative;border-radius:5px;box-shadow:2px 6px 16px 6px var(--shadow);background-color:var(--background-card);overflow:hidden}",
        R + ".client-config-main{position:relative;padding:20px 20px 0;display:flex;flex-direction:column;min-height:320px}",
        R + ".provider-info-wrapper{width:100%;background-color:var(--background-title);border-radius:5px;padding:15px;margin-bottom:20px}",
        R + ".provider-info{display:flex;align-items:center;justify-content:space-between}",
        R + ".provider-info .info{margin-left:10px;text-align:right}",
        R + ".provider-info .label{margin-bottom:10px;font-size:12px}",
        R + ".provider-info-wrapper .label{color:var(--icon)}",
        R + ".provider-info a," + R + ".btn-text{color:var(--primary);cursor:pointer}",
        R + ".provider-logo{display:flex;align-items:center;justify-content:center;height:64px;min-width:240px;padding:0 16px;border:1px solid var(--border);border-radius:5px;font-size:20px;color:var(--text-regular);background-color:var(--background-card)}",
        R + ".provider-logo .litle{flex-shrink:0;width:30px;height:30px;border-radius:5px;color:#fff;font-size:24px;font-weight:700;display:flex;justify-content:center;align-items:center;margin-right:10px;background-color:#6d4aff}",
        R + ".provider-info-wrapper .other{display:flex;align-items:center;margin-top:20px}",
        R + ".provider-info-wrapper .other .label{margin-right:10px}",
        R + ".provider-info-wrapper .other .link{margin:0 0 0 auto;white-space:nowrap;font-size:12px}",
        R + ".provider-info-wrapper .other .publi-key{flex:1;margin-left:10px;color:var(--text-regular);word-break:break-word}",
        R + ".provider-info-wrapper .other .proton-connected{color:var(--success)}",
        R + ".option-btns{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px}",
        R + ".option-left," + R + ".option-right{display:flex;align-items:center;gap:16px;min-width:0}",
        R + ".option-btns .icon-setting{font-size:20px;cursor:pointer;color:var(--text-disabled)}",
        R + ".proton-location{color:var(--text-weak)}",
        R + ".proton-search{width:240px;max-width:100%}",
        R + ".proton-tips{margin-bottom:20px;justify-content:flex-start}" + R + ".proton-tips p{margin:0}",
        R + ".no-data{min-height:250px;display:flex;justify-content:center;align-items:center;border-top:1px solid var(--divider);border-bottom:1px solid var(--divider);color:var(--text-weak)}",
        R + ".list-table.el-table:before{height:0}",
        R + ".list-table .op-column .cell{padding-top:2px;padding-bottom:2px}",
        R + ".list-table .badge{display:inline-block;height:8px;width:8px;border-radius:50%;background-color:var(--background-badge)}",
        R + ".list-table .badge.is-connecting{background-color:var(--warning)}",
        R + ".list-table .badge.is-connected{background-color:var(--success)}",
        R + ".list-table .config-name{display:flex;flex-direction:column;align-items:flex-start;line-height:20px}",
        R + ".list-table .protocol-label{color:var(--text-disabled);font-size:12px;line-height:18px}",
        R + ".list-table .cell{word-break:normal}",
        R + ".update-btn{white-space:nowrap}",
        R + ".list-table .proton-row{cursor:pointer}",
        R + ".list-table .proton-row.is-selected>td{background-color:var(--primary-background)}",
        R + ".list-table .proton-row.is-selected .text-pre{font-weight:700}",
        R + ".dashboard-section{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:20px;min-height:80px;margin:auto -20px 0;background-color:var(--primary-background)}",
        R + ".dashboard-section .dashboard-desc{font-size:14px;color:var(--text-subtitle);margin:0;text-align:center}",
        R + ".btns{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:10px}",
        R + ".btns .btn-item{min-width:124px;height:36px;margin:0}",
        R + ".provider-auth-wrapper{width:100%;display:flex;flex-direction:column;align-items:center;margin:20px 0 40px}",
        R + ".provider-auth-wrapper .proton-warning{width:100%;max-width:550px;margin-bottom:20px}" + R + ".proton-warning p{margin:0}",
        R + ".provider-auth-wrapper .form-list{width:100%;max-width:360px;margin:10px auto 0;padding:0;list-style:none;color:var(--text-weak)}",
        R + ".provider-auth-wrapper .form-list>li{display:flex;align-items:center;justify-content:center;padding:14px 0}",
        R + ".provider-auth-wrapper .form-list>li>div:first-child{width:25%;margin-right:10px}",
        R + ".provider-auth-wrapper .form-list>li>div:last-child{flex:1;max-width:260px;min-width:160px}",
        R + ".provider-auth-wrapper .btns{width:100%;margin:20px 0}",
        R + ".provider-auth-wrapper .btns .first-auth-btn{width:100%;max-width:300px;min-height:36px;height:auto}",
        R + ".config-list{margin:0 0 20px;padding:0;list-style:none;color:var(--text-weak)}",
        R + ".config-list>li{min-height:50px;padding:10px;display:flex;justify-content:space-between;align-items:center}",
        R + ".config-list>li>div:first-child{width:40%}" + R + ".config-list>li>div:last-child{flex:1;max-width:220px;min-width:160px}",
        R + ".proton-overlay{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--text-regular);animation:proton-fade .2s .4s both}",
        R + ".proton-overlay:before{content:\"\";position:absolute;inset:0;z-index:-1;background-color:var(--background-card);opacity:.85}",
        R + ".proton-overlay .icon-loading," + R + ".loading-config .icon-loading{font-size:30px;color:var(--text-regular)}",
        "@keyframes proton-fade{from{opacity:0}to{opacity:1}}",
        R + ".drawer-main{height:100%;min-height:500px;display:flex;flex-direction:column}",
        R + ".sever-count{display:flex;align-items:center;justify-content:space-between;padding:14px 5px;color:var(--text-weak)}",
        R + ".sever-count>div:last-child{color:var(--text-regular)}",
        R + ".select-location{flex:1;min-height:0;border:1px solid var(--border);border-radius:5px;display:flex;flex-direction:column;overflow:hidden;padding-bottom:10px}",
        R + ".search-main{padding:15px;padding-bottom:10px;box-shadow:0 3px 10px 0 var(--shadow);border-radius:5px;position:relative;z-index:2}",
        R + ".checkbox-btns{margin-top:10px;display:flex;align-items:center;justify-content:flex-end}",
        R + ".checkbox-main{display:flex;align-items:center;color:var(--text-weak);cursor:pointer}",
        R + ".checkbox-main .checkbox{width:20px;height:20px;margin-left:10px;display:flex;justify-content:center;align-items:center;font-size:18px}",
        R + ".checkbox-main .checkbox:not(.icon-success){border:1px solid var(--border);border-radius:50%}",
        R + ".checkbox-main .icon-success{color:var(--secondary)}",
        R + ".select-location .main{flex:1;min-height:0;padding:15px;padding-bottom:0;overflow-y:auto}",
        R + ".select-location .loading-config{display:flex;justify-content:center;padding:40px 0}",
        R + ".tunnel-list{margin-top:20px;display:flex;flex-direction:column;gap:10px}",
        R + ".tunnel-list .tunnel-item{padding:14px 16px}",
        R + ".start-stop-client-wrapper .gl-tips p{margin:0}",
        R + ".proton-crumb{margin-bottom:15px;color:var(--text-weak)}",
        "@media screen and (max-width:780px){" + R + ".dashboard-section .dashboard-desc{display:none}"
            + R + ".proton-search{width:160px}}",
        "@media(max-width:480px){" + R + ".provider-info{align-items:flex-start;flex-direction:column;gap:10px}"
            + R + ".provider-info .info{margin-left:0;text-align:left}" + R + ".provider-logo{min-width:0;width:100%}"
            + R + ".provider-info-wrapper .other{flex-wrap:wrap;gap:8px 0}" + R + ".provider-info-wrapper .other .link{margin-left:0;flex-basis:100%}"
            + R + ".btns .btn-item{width:100%}}"
    ].join("");
    return {
        name: "ProtonVpn",
        data: function () {
            return {
                info: {}, countries: [], server: "", search: "",
                tunnel: "", username: "", password: "", totp: "", busy: false,
                error: "", notice: "", timer: null, alive: false,
                catalog: null, updating: false, catalogError: "", reloadPending: false,
                showDrawer: false, drawerCountry: "", drawerCities: [], drawerSearch: "",
                onlySelected: false, showAdvanced: false, showTunnel: false, tunnelPick: null,
                servers: [], listed: [], picks: {}
            };
        },
        computed: {
            countryOptions: function () {
                var names = typeof Intl.DisplayNames === "function"
                    ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
                return this.countries.map(function (c) {
                    return { country: c.country, servers: c.servers,
                        label: names ? names.of(c.country) : c.country };
                }).sort(function (a, b) {
                    if (a.country === "US" && b.country !== "US") return -1;
                    if (b.country === "US" && a.country !== "US") return 1;
                    return a.label.localeCompare(b.label, "en");
                });
            },
            filteredServers: function () {
                var query = this.search.trim().toLowerCase();
                return this.servers.filter(function (s) {
                    return !query || (s.name + " " + s.city).toLowerCase().includes(query);
                }).sort(function (a, b) { return a.load - b.load; });
            },
            countryNames: function () {
                var names = {};
                this.countryOptions.forEach(function (c) { names[c.country] = c.label; });
                return names;
            },
            pickList: function () {
                var picks = this.picks;
                return Object.keys(picks).map(function (key) { return picks[key]; });
            },
            validSelection: function () {
                var selected = this.server;
                return this.servers.some(function (s) { return s.name === selected; });
            },
            isConnected: function () {
                var c = this.info.connection;
                return !!(c && c.enabled && c.status === 1 && c.matches_configuration !== false
                    && (!this.info.managed || this.info.connected === true));
            },
            connectionText: function () {
                var c = this.info.connection;
                if (!c) return "No active VPN connection";
                if (this.info.managed) {
                    if (!c.enabled) return "Proton VPN disconnected";
                    return (this.isConnected ? "Connected: " : "Connecting: ") + c.name;
                }
                return "Existing VPN: " + c.name + (!c.enabled ? " (disabled)" : this.isConnected ? " (connected)" : " (transitioning)");
            }
        },
        watch: {
            isConnected: function (now) { if (now && this.notice.indexOf("Connection requested") === 0) this.notice = ""; }
        },
        mounted: async function () {
            this.alive = true;
            await this.refresh();
            if (this.info.authenticated) await this.reload();
            this.poll();
        },
        beforeDestroy: function () {
            this.alive = false;
            clearTimeout(this.timer);
        },
        methods: {
            nodeFeatures: function (server) {
                var labels = [];
                if (server.features & 1) labels.push("Secure Core");
                if (server.features & 2) labels.push("Tor");
                if (server.features & 4) labels.push("P2P");
                if (server.features & 8) labels.push("Streaming");
                if (server.features & 16) labels.push("IPv6 server");
                return labels.join(", ");
            },
            rpc: function (action, params) {
                return window.$rpcRequest("call", ["sid", "proton-vpn", action, params || {}], {
                    timeout: 190000, isCancel: false, ignoreCoreErrTips: true
                });
            },
            refresh: async function () {
                try { this.info = await this.rpc("status"); }
                catch (e) { this.error = e.message || "Router status is unavailable."; }
            },
            poll: function () {
                var self = this;
                if (!this.alive) return;
                this.timer = setTimeout(async function () {
                    await self.refresh();
                    if (self.reloadPending && !self.busy && self.alive) {
                        self.reloadPending = false;
                        await self.reload();
                    }
                    self.poll();
                }, 5000);
            },
            perform: async function (action, params) {
                var updating = action === "refresh_catalog";
                if (updating) {
                    this.updating = true;
                    this.catalogError = "";
                } else {
                    this.busy = true;
                    this.error = "";
                    this.notice = "";
                }
                try {
                    var response = await this.rpc(action, params);
                    var retries = 0;
                    while (response.busy && ["countries", "cities", "servers", "refresh_catalog"].includes(action)) {
                        if (!this.alive) return null;
                        if (retries++ >= 60) throw new Error("Proton is still busy. Refresh the catalogue when the other operation finishes.");
                        if (!updating) this.notice = "Loading the first catalogue; waiting for another Proton operation...";
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        if (!this.alive) return null;
                        response = await this.rpc(action, params);
                    }
                    return response;
                }
                catch (e) {
                    if (updating) this.catalogError = e.message || "Catalogue refresh failed; showing saved data.";
                    else this.error = e.message || "The operation failed.";
                    return null;
                }
                finally {
                    if (updating) this.updating = false;
                    else {
                        this.notice = "";
                        if (this.alive) await this.refresh();
                        this.busy = false;
                    }
                }
            },
            acceptCache: function (response) {
                if (!response.cache) return;
                if (!this.catalog || response.cache.fetched_at >= this.catalog.fetched_at) {
                    this.catalog = response.cache;
                }
                if (this.catalog.stale && !this.updating && this.alive) this.refreshCatalog(false);
            },
            refreshCatalog: async function (force) {
                if (!this.alive || this.updating) return;
                var response = await this.perform("refresh_catalog", { force: force === true });
                if (!response || !this.alive) return;
                this.catalog = response.cache;
                this.reloadPending = true;
            },
            reload: async function () {
                await this.loadCountries();
                await this.loadServers(this.listed);
            },
            loadCountries: async function () {
                if (!this.alive) return;
                var response = await this.perform("countries");
                if (!response || !this.alive) return;
                this.countries = Array.isArray(response.countries) ? response.countries : [];
                this.acceptCache(response);
            },
            login: async function () {
                var params = { username: this.username, password: this.password, totp: this.totp };
                this.username = this.password = this.totp = "";
                var result = await this.perform("login", params);
                params.password = params.totp = params.username = "";
                if (result) await this.reload();
            },
            logout: async function () {
                if (!window.confirm("Sign out of the Proton API? The current VPN and stored profiles will remain. Use Disconnect or Restore separately.")) return;
                if (await this.perform("logout")) {
                    this.countries = this.servers = this.listed = [];
                    this.server = "";
                    this.catalog = null;
                }
            },
            connect: async function () {
                var params = { server: this.server };
                if (this.tunnel) params.tunnel_id = Number(this.tunnel);
                if (await this.perform("connect", params)) {
                    this.notice = "Connection requested. Waiting for GL.iNet's native WireGuard handoff.";
                } else if (Array.isArray(this.info.tunnels) && this.info.tunnels.length > 1
                    && /Multiple|no longer exists/.test(this.error)) {
                    // Same as the native Start: with several tunnels, ask which one to use.
                    this.error = "";
                    this.tunnel = "";
                    this.tunnelPick = null;
                    this.showTunnel = true;
                }
            },
            startOnTunnel: async function () {
                if (!this.tunnelPick) return;
                this.tunnel = String(this.tunnelPick);
                this.showTunnel = false;
                await this.connect();
            },
            disconnect: async function () {
                if (!window.confirm("Disconnect Proton? Traffic will follow your existing GL.iNet default and kill-switch policies.")) return;
                if (await this.perform("disconnect")) this.notice = "Native disconnect requested. The original VPN can still be restored.";
            },
            restore: async function () {
                if (await this.perform("restore")) this.notice = "Original VPN restoration requested.";
            },
            // Lists every server of the applied cities. Nothing is imported until one is connected.
            loadServers: async function (picks) {
                var servers = [];
                for (var i = 0; i < picks.length; i++) {
                    var pick = picks[i];
                    var response = await this.perform("servers", { country: pick.country, city: pick.city });
                    if (!response || !this.alive) return;
                    this.acceptCache(response);
                    (Array.isArray(response.servers) ? response.servers : []).forEach(function (s) {
                        servers.push(Object.assign({ country: pick.country }, s));
                    });
                }
                this.listed = picks;
                this.servers = servers;
                if (!this.validSelection) this.server = "";
            },
            openDrawer: function () {
                var picks = {};
                this.listed.forEach(function (p) { picks[p.country + "|" + p.city] = p; });
                this.picks = picks;
                this.drawerCountry = "";
                this.drawerCities = [];
                this.drawerSearch = "";
                this.onlySelected = false;
                this.showDrawer = true;
            },
            pickCountry: async function (country) {
                this.drawerCountry = country;
                this.drawerCities = [];
                this.drawerSearch = "";
                if (!country || !this.alive) return;
                var response = await this.perform("cities", { country: country });
                if (!response || !this.alive || this.drawerCountry !== country) return;
                this.drawerCities = Array.isArray(response.cities) ? response.cities : [];
                this.acceptCache(response);
            },
            toggleCity: function (city) {
                var key = this.drawerCountry + "|" + city.city;
                var picks = Object.assign({}, this.picks);
                if (picks[key]) delete picks[key];
                else picks[key] = { country: this.drawerCountry, city: city.city, servers: city.servers };
                this.picks = picks;
            },
            applyDrawer: async function () {
                this.showDrawer = false;
                await this.loadServers(this.pickList);
            },
            isActiveServer: function (server) {
                var c = this.info.connection;
                var selected = this.info.selected;
                return !!(this.info.managed && c && c.enabled
                    && (c.name === "Proton " + server.name || selected && selected.name === server.name));
            },
            startServer: async function (server) {
                this.server = server.name;
                await this.connect();
            }
        },
        render: function (h) {
            var self = this;
            var info = this.info;
            var connected = this.isConnected;
            var authenticated = info.authenticated === true;
            var countryNames = this.countryNames;
            function countryName(code) { return countryNames[code] || code; }
            function time(seconds, options) { return new Date(seconds * 1000).toLocaleString([], options); }
            function tips(state, text, id) {
                return h("gl-tips", { class: "proton-tips", props: { state: state },
                    attrs: { role: state === "error" ? "alert" : "status", "data-testid": id } },
                    [h("p", { slot: "tips" }, text)]);
            }
            function loginOnEnter(e) {
                if (e.key === "Enter" && self.username && self.password && !self.busy) self.login();
            }
            function input(key, type, placeholder, onEnter) {
                return h("el-input", {
                    class: "inp",
                    props: { value: self[key], type: type || "text", showPassword: type === "password" },
                    attrs: { autocomplete: "off", placeholder: placeholder || "", "data-testid": key },
                    on: { input: function (value) { self[key] = value; } },
                    nativeOn: onEnter ? { keyup: onEnter } : undefined
                });
            }
            function button(label, action, disabled, id, primary) {
                return h("gl-button", {
                    class: "btn-item",
                    props: { type: primary ? "primary" : undefined, disabled: self.busy || disabled },
                    attrs: { "data-testid": id },
                    on: { click: action }
                }, label);
            }
            function menuItem(label, icon, action, disabled, id, divided) {
                return h("gl-dropdown-item", {
                    props: { disabled: self.busy || disabled, divided: divided },
                    attrs: { "data-testid": id },
                    on: { click: action }
                }, [h("span", { class: "iconfont " + icon }), " " + label + " "]);
            }

            var header = h("div", { class: "provider-info-wrapper" }, [
                h("div", { class: "provider-info" }, [
                    h("div", { class: "provider-logo", attrs: { "aria-label": "Proton VPN" } },
                        [h("span", { class: "litle", attrs: { "aria-hidden": "true" } }, "P"), "Proton VPN"]),
                    h("div", { class: "info" }, [
                        authenticated && this.catalog ? h("div", { class: "label", attrs: { "data-testid": "catalog-age" } },
                            "Server list updated " + time(this.catalog.fetched_at,
                                { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })) : null,
                        h("a", { attrs: { href: "#/vpndashboard" } }, "VPN Dashboard")
                    ])
                ]),
                h("div", { class: "other" }, [
                    h("span", { class: "label" }, "Status"),
                    h("span", { class: ["publi-key", { "proton-connected": connected }],
                        attrs: { "data-testid": "connection-status", "data-connected": String(!!info.connected) } },
                        this.connectionText + (info.last_handshake ? " · handshake "
                            + time(info.last_handshake, { hour: "2-digit", minute: "2-digit" }) : "")),
                    info.version ? h("span", { class: "label link", attrs: { "data-testid": "version" } },
                        "Version " + info.version) : null
                ])
            ]);

            var account = info.authenticated === false ? h("div", { class: "provider-auth-wrapper" }, [
                window.location.protocol === "http:" ? h("gl-tips", { class: "proton-warning", props: { state: "warning" } },
                    [h("p", { slot: "tips" }, "HTTP is not encrypted. Use HTTPS for password entry when available.")]) : null,
                h("ul", { class: "form-list" }, [
                    h("li", [h("div", "Username"), h("div", [input("username", "text", "", loginOnEnter)])]),
                    h("li", [h("div", "Password"), h("div", [input("password", "password", "", loginOnEnter)])]),
                    h("li", [h("div", "2FA code"), h("div", [input("totp", "text", "Six digits, if enabled", loginOnEnter)])])
                ]),
                h("div", { class: "btns" }, [
                    h("gl-button", {
                        class: "btn-item first-auth-btn",
                        props: { type: "primary", disabled: this.busy || !this.username || !this.password },
                        attrs: { "data-testid": "login" },
                        on: { click: this.login }
                    }, "Sign in")
                ])
            ]) : null;

            var table = !authenticated ? null : !this.servers.length ? h("div", { class: "no-data" }, "No Data")
                : h("gl-table", {
                    class: "list-table",
                    props: {
                        data: this.filteredServers, rowKey: "name", emptyText: "No Data",
                        maxHeight: Math.max(260, (window.innerHeight || 800) - 560),
                        rowClassName: function (scope) {
                            return scope.row.name === self.server ? "proton-row is-selected" : "proton-row";
                        }
                    },
                    on: { "row-click": function (row) { if (!self.busy) self.server = row.name; } }
                }, [
                    h("gl-table-column", { props: { align: "center", width: "50px" }, scopedSlots: {
                        default: function (scope) {
                            return [h("span", { class: ["badge", self.isActiveServer(scope.row)
                                ? (connected ? "is-connected" : "is-connecting") : ""] })];
                        }
                    } }),
                    h("gl-table-column", { props: { label: "Name" }, scopedSlots: {
                        default: function (scope) {
                            var features = self.nodeFeatures(scope.row);
                            return [h("div", { class: "config-name", attrs: { "data-testid": "server",
                                "data-name": scope.row.name, "data-load": scope.row.load } }, [
                                h("span", { class: "text-pre" }, scope.row.name),
                                features ? h("span", { class: "protocol-label" }, features) : null
                            ])];
                        }
                    } }),
                    h("gl-table-column", { props: { label: "Server Location" }, scopedSlots: {
                        default: function (scope) {
                            return [countryName(scope.row.country) + ", " + scope.row.city];
                        }
                    } }),
                    h("gl-table-column", { props: { label: "Load", width: "90px" }, scopedSlots: {
                        default: function (scope) { return [scope.row.load + "%"]; }
                    } }),
                    h("gl-table-column", { props: { align: "center", width: "100px", className: "op-column" }, scopedSlots: {
                        default: function (scope) {
                            var active = self.isActiveServer(scope.row);
                            return [h("gl-dropdown", { props: { placement: "left" } }, [
                                active ? menuItem("Stop", "icon-stop", self.disconnect, self.updating)
                                    : menuItem("Start", "icon-play", function () { self.startServer(scope.row); }, self.updating)
                            ])];
                        }
                    } })
                ]);

            var options = authenticated ? h("div", { class: "option-btns" }, [
                h("div", { class: "option-left" }, [
                    h("gl-button", {
                        class: "update-btn",
                        props: { disabled: this.busy || this.updating },
                        attrs: { "data-testid": "select-servers" },
                        on: { click: this.openDrawer }
                    }, "Update Servers"),
                    h("span", { class: "proton-location", attrs: { "data-testid": "location" } },
                        this.servers.length + " servers")
                ]),
                h("div", { class: "option-right" }, [
                    this.servers.length ? h("gl-search-input", {
                        class: "proton-search",
                        props: { value: this.search },
                        attrs: { placeholder: "Name / Location", "data-testid": "search" },
                        on: { input: function (value) { self.search = value; } }
                    }) : null,
                    h("gl-dropdown", { key: "actionDrop", props: { trigger: "hover" } }, [
                        h("span", { slot: "label", class: "iconfont icon-setting btn-icon",
                            attrs: { "data-testid": "settings", role: "button", "aria-label": "Settings" } }),
                        menuItem("Refresh server list", "icon-refresh", function () { self.refreshCatalog(true); },
                            this.updating, "countries"),
                        menuItem("Restore original VPN", "icon-reset", this.restore,
                            this.updating || !info.restore_available, "restore-menu", true),
                        menuItem(this.showAdvanced ? "Hide advanced" : "Advanced", "icon-setting",
                            function () { self.showAdvanced = !self.showAdvanced; }, false, "advanced", true),
                        menuItem("Sign out", "icon-sign-out-alt", this.logout, this.updating, "logout", true)
                    ])
                ])
            ]) : null;

            var drawerQuery = this.drawerSearch.trim().toLowerCase();
            var pickList = this.pickList;
            var pickedCountries = pickList.map(function (p) { return p.country; });
            var pickedCities = pickList.filter(function (p) { return p.country === self.drawerCountry; })
                .map(function (p) { return p.city; });
            var drawerCountries = this.countryOptions.filter(function (c) {
                return (!drawerQuery || (c.label + " " + c.country).toLowerCase().includes(drawerQuery))
                    && (!self.onlySelected || pickedCountries.indexOf(c.country) >= 0);
            });
            var drawerCities = this.drawerCities.filter(function (c) {
                return (!drawerQuery || c.city.toLowerCase().includes(drawerQuery))
                    && (!self.onlySelected || pickedCities.indexOf(c.city) >= 0);
            });
            var picked = pickList.reduce(function (sum, p) { return sum + p.servers; }, 0);
            var drawer = authenticated ? h("gl-drawer", {
                class: "provider-pull-config-wrapper",
                attrs: { visible: this.showDrawer, "show-close": true },
                on: { "update:visible": function (value) { self.showDrawer = value; } }
            }, [
                h("span", { slot: "title", class: "drawer-title" }, "Select Proton VPN Servers"),
                this.showDrawer ? h("div", { class: "drawer-main" }, [
                    h("div", { class: "sever-count" }, [h("div", "Server Select"), h("div", String(picked))]),
                    h("div", { class: "select-location" }, [
                        h("div", { class: "search-main" }, [
                            h("gl-search-input", {
                                props: { value: this.drawerSearch },
                                attrs: { placeholder: "Country / Region / City", "data-testid": "drawer-search" },
                                on: { input: function (value) { self.drawerSearch = value; } }
                            }),
                            h("div", { class: "checkbox-btns" }, [
                                h("span", { class: "checkbox-main",
                                    on: { click: function () { self.onlySelected = !self.onlySelected; } } }, [
                                    " Show only selected item ",
                                    h("i", { class: ["checkbox iconfont", { "icon-success": this.onlySelected }] })
                                ])
                            ])
                        ]),
                        h("div", { class: "main" }, this.drawerCountry ? [
                            h("div", { class: "proton-crumb" }, [
                                h("span", { class: "btn-text", attrs: { "data-testid": "all-countries" },
                                    on: { click: function () { if (!self.busy) self.pickCountry(""); } } }, "All countries"),
                                h("span", " / " + countryName(this.drawerCountry))
                            ]),
                            this.error ? tips("error", this.error) : null,
                            this.busy && !this.drawerCities.length
                                ? h("div", { class: "loading-config" }, [h("span", { class: "iconfont icon-loading" })])
                                : h("gl-checkbox-group", {
                                    key: "cities", class: "country-list",
                                    props: { value: pickedCities, min: "200px", matchCase: true },
                                    on: { change: function (value) {
                                        var city = self.drawerCities.filter(function (c) { return c.city === value; })[0];
                                        if (city) self.toggleCity(city);
                                    } }
                                }, drawerCities.map(function (c) {
                                    return h("gl-checkbox", { key: c.city, props: { value: c.city },
                                        attrs: { "data-testid": "city", "data-city": c.city } },
                                        " " + c.city + " (" + c.servers + ") ");
                                }))
                        ] : [
                            h("gl-checkbox-group", {
                                key: "countries", class: "country-list",
                                props: { value: pickedCountries, min: "200px", matchCase: true },
                                on: { change: function (value) { if (!self.busy) self.pickCountry(value); } }
                            }, drawerCountries.map(function (c) {
                                return h("gl-checkbox", { key: c.country, props: { value: c.country },
                                    attrs: { "data-testid": "country", "data-country": c.country } },
                                    " " + c.label + " (" + c.servers + ") ");
                            }))
                        ])
                    ])
                ]) : null,
                h("div", { slot: "footer", class: "btns" }, [
                    h("gl-button", { key: "cancelBtn", class: "btn-item", attrs: { "data-testid": "drawer-cancel" },
                        on: { click: function () { self.showDrawer = false; } } }, "Cancel"),
                    h("gl-button", { key: "applyBtn", class: "btn-item",
                        props: { type: "primary", disabled: this.busy },
                        attrs: { "data-testid": "drawer-apply" }, on: { click: this.applyDrawer } }, "Apply")
                ])
            ]) : null;

            var tunnelDialog = authenticated ? h("el-dialog", {
                class: "start-stop-client-wrapper",
                props: { visible: this.showTunnel },
                on: { "update:visible": function (value) { self.showTunnel = value; } }
            }, [
                h("span", { slot: "title" }, "Start VPN Client"),
                h("div", { class: "dialog-main" }, [
                    h("gl-tips", [h("p", { slot: "tips" }, [
                        "Choose the VPN tunnel that should use " + (this.server || "this server")
                            + ". Tunnels and their routing rules are managed in the ",
                        h("a", { attrs: { href: "#/vpndashboard" } }, "VPN Dashboard"), "."
                    ])]),
                    h("gl-radio-group", {
                        class: "tunnel-list", props: { value: this.tunnelPick, size: "small" },
                        on: { input: function (value) { self.tunnelPick = value; } }
                    }, (info.tunnels || []).map(function (t) {
                        return h("gl-radio", { key: t.tunnel_id, class: "tunnel-item", props: { label: t.tunnel_id },
                            attrs: { "data-testid": "tunnel-option" } }, t.name);
                    }))
                ]),
                h("div", { slot: "footer", class: "btns" }, [
                    h("gl-button", { class: "btn-item", on: { click: function () { self.showTunnel = false; } } }, "Cancel"),
                    h("gl-button", { class: "btn-item", props: { type: "primary", disabled: !this.tunnelPick },
                        attrs: { "data-testid": "tunnel-start" }, on: { click: this.startOnTunnel } }, "Start")
                ])
            ]) : null;

            return h("div", { attrs: { id: "proton-vpn-view" } }, [
                h("style", STYLE),
                h("gl-title", { attrs: { title: "Proton VPN" } }),
                h("div", { class: "client-body" }, [
                    this.busy || this.updating ? h("div", { class: "proton-overlay", attrs: { role: "status", "data-testid": "overlay" } }, [
                        h("span", { class: "iconfont icon-loading" }),
                        this.updating ? "Refreshing the server list from Proton..." : this.notice || "Working..."
                    ]) : null,
                    h("div", { class: "client-config-main" }, [
                        header,
                        account,
                        options,
                        authenticated && this.showAdvanced ? h("ul", { class: "config-list" }, [
                            h("li", [h("div", "Existing tunnel ID (optional)"), h("div", [input("tunnel", "number", "Automatic")])])
                        ]) : null,
                        this.error && !this.showDrawer ? tips("error", this.error, "error") : null,
                        this.catalogError ? tips("warning", "Refresh failed; saved locations remain available. "
                            + this.catalogError, "catalog-error") : null,
                        table,
                        info.authenticated === undefined ? null : h("div", { class: "dashboard-section" }, [
                            h("div", { class: "btns" }, [
                                authenticated ? button("Connect / switch", this.connect,
                                    !this.validSelection || this.updating, "connect", true) : null,
                                button("Disconnect", this.disconnect,
                                    this.updating || !info.managed || !info.connection || !info.connection.enabled, "disconnect"),
                                button("Restore original VPN", this.restore, this.updating || !info.restore_available, "restore")
                            ]),
                            h("p", { class: "dashboard-desc", attrs: { role: "status" } }, this.notice
                                || (authenticated ? "You're signed in to Proton VPN. Go to the VPN Dashboard to create and manage VPN tunnels."
                                    : "Sign in to Proton to list servers. Existing VPN connections are not changed."))
                        ])
                    ])
                ]),
                drawer,
                tunnelDialog
            ]);
        }
    };
}())
