(function () {
    "use strict";
    return {
        name: "ProtonVpn",
        data: function () {
            return {
                info: {}, countries: [], cities: [], servers: [], country: "", city: "", server: "", search: "",
                tunnel: "", username: "", password: "", totp: "", busy: false,
                error: "", notice: "", timer: null, alive: false,
                catalog: null, updating: false, catalogError: "", reloadPending: false
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
            validSelection: function () {
                var selected = this.server;
                return this.filteredServers.some(function (s) { return s.name === selected; });
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
            if (this.info.authenticated) await this.loadCountries();
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
                        await self.loadCountries();
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
            loadCountries: async function () {
                if (!this.alive) return;
                var response = await this.perform("countries");
                if (!response || !this.alive) return;
                this.countries = Array.isArray(response.countries) ? response.countries : [];
                this.acceptCache(response);
                if (this.country && this.countries.some((c) => c.country === this.country)) {
                    await this.loadCities(true);
                } else {
                    this.country = this.city = this.server = "";
                    this.cities = [];
                    this.servers = [];
                }
            },
            loadCities: async function (preserve) {
                var city = preserve ? this.city : "";
                var server = preserve ? this.server : "";
                var country = this.country;
                this.cities = [];
                this.city = this.server = "";
                this.servers = [];
                if (!preserve) this.search = "";
                if (!country || !this.alive) return;
                var response = await this.perform("cities", { country: country });
                if (!response || !this.alive || this.country !== country) return;
                this.cities = Array.isArray(response.cities) ? response.cities : [];
                this.acceptCache(response);
                if (city && this.cities.some(c => c.city === city)) {
                    this.city = city;
                    this.server = server;
                    await this.loadServers(true);
                }
            },
            loadServers: async function (preserve) {
                var server = preserve ? this.server : "";
                var country = this.country, city = this.city;
                this.servers = [];
                this.server = "";
                if (!preserve) this.search = "";
                if (!country || !city || !this.alive) return;
                var response = await this.perform("servers", { country: country, city: city });
                if (!response || !this.alive || this.country !== country || this.city !== city) return;
                this.servers = Array.isArray(response.servers) ? response.servers : [];
                this.acceptCache(response);
                this.server = this.servers.some(s => s.name === server) ? server : "";
            },
            login: async function () {
                var params = { username: this.username, password: this.password, totp: this.totp };
                this.username = this.password = this.totp = "";
                var result = await this.perform("login", params);
                params.password = params.totp = params.username = "";
                if (result) await this.loadCountries();
            },
            logout: async function () {
                if (!window.confirm("Sign out of the Proton API? The current VPN and stored profiles will remain. Use Disconnect or Restore separately.")) return;
                if (await this.perform("logout")) {
                    this.countries = this.cities = this.servers = [];
                    this.country = this.city = this.server = "";
                    this.catalog = null;
                }
            },
            connect: async function () {
                var params = { server: this.server };
                if (this.tunnel) params.tunnel_id = Number(this.tunnel);
                if (await this.perform("connect", params)) {
                    this.notice = "Connection requested. Waiting for GL.iNet's native WireGuard handoff.";
                }
            },
            disconnect: async function () {
                if (!window.confirm("Disconnect Proton? Traffic will follow your existing GL.iNet default and kill-switch policies.")) return;
                if (await this.perform("disconnect")) this.notice = "Native disconnect requested. The original VPN can still be restored.";
            },
            restore: async function () {
                if (await this.perform("restore")) this.notice = "Original VPN restoration requested.";
            }
        },
        render: function (h) {
            var self = this;
            var connected = this.isConnected;
            function field(label, node) { return h("label", { class: "proton-field" }, [h("span", label), node]); }
            function icon(name) {
                return h("i", { class: ["proton-icon", name], attrs: { "aria-hidden": "true" } });
            }
            var actionIcons = {
                connect: "iconfont icon-play", disconnect: "iconfont icon-stop",
                restore: "el-icon-refresh-left", login: "el-icon-user",
                logout: "el-icon-switch-button", countries: "el-icon-refresh"
            };
            function input(key, type, placeholder) {
                return h("input", {
                    attrs: { type: type || "text", autocomplete: "off", placeholder: placeholder || "", "data-testid": key },
                    domProps: { value: self[key] },
                    on: { input: function (e) { self[key] = e.target.value; } }
                });
            }
            function button(label, action, disabled, id) {
                return h("gl-button", {
                    props: { type: id === "connect" || id === "login" ? "primary" : undefined,
                        disabled: self.busy || disabled },
                    attrs: { "data-testid": id },
                    on: { click: action }
                }, [icon(actionIcons[id]), label]);
            }
            var account = this.info.authenticated === false ? h("div", { class: "proton-account" }, [
                    window.location.protocol === "http:" ? h("p", { class: "proton-warning" },
                        "HTTP is not encrypted. Use HTTPS for password entry when available.") : null,
                    h("div", { class: "proton-location-row" }, [
                        field("Username", input("username")),
                        field("Password", input("password", "password"))
                    ]),
                    field("TOTP (if enabled)", input("totp", "text", "Six-digit current code")),
                    button("Sign in", this.login, !this.username || !this.password, "login")
                ]) : null;
            return h("div", { attrs: { id: "proton-vpn-view" } }, [
                h("style", "#proton-vpn-view{padding:20px 0;font-family:inherit;color:var(--text-regular,#141427)}#proton-vpn-view p{margin:8px 0}"
                    + "#proton-vpn-view .proton-icon{display:inline-block;margin-right:6px;font-size:14px;line-height:1;vertical-align:-1px}"
                    + "#proton-vpn-view .proton-status,#proton-vpn-view .proton-actions,#proton-vpn-view .proton-footer{display:flex;align-items:center;gap:10px;flex-wrap:wrap}"
                    + "#proton-vpn-view .proton-status{justify-content:space-between;margin-bottom:12px;padding:8px 10px;border-radius:4px;background:var(--background-subtitle,#f2f2f7)}"
                    + "#proton-vpn-view .proton-status a{font-size:13px;color:var(--text-button,#5272f7)}"
                    + "#proton-vpn-view .proton-field{display:block;min-width:0;margin:0 0 10px}#proton-vpn-view .proton-field>span{display:flex;align-items:center;margin-bottom:4px;font-size:13px;font-weight:500;color:var(--text-weak,#333366)}"
                    + "#proton-vpn-view input,#proton-vpn-view select{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--border,#d2d2d6);border-radius:4px;background:var(--background-controller,#fff);color:inherit;font:inherit}"
                    + "#proton-vpn-view input:focus,#proton-vpn-view select:focus{border-color:var(--primary,#5272f7);outline:2px solid var(--primary-background,#eef1fe);outline-offset:1px}"
                    + "#proton-vpn-view input:disabled,#proton-vpn-view select:disabled{background:var(--background-disabled,#ebebf0);color:var(--text-disabled,#a0a0a3)}"
                    + "#proton-vpn-view .proton-location-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}"
                    + "#proton-vpn-view button{margin:0}#proton-vpn-view .proton-actions{margin:12px 0 0}#proton-vpn-view .proton-account{margin-bottom:16px}"
                    + "#proton-vpn-view .proton-advanced{font-size:13px}#proton-vpn-view summary{cursor:pointer}#proton-vpn-view .proton-advanced .proton-field{max-width:340px;margin-top:8px}"
                    + "#proton-vpn-view .proton-card>.footer{height:auto;min-height:50px;padding:10px 20px}"
                    + "#proton-vpn-view .proton-footer{width:100%;justify-content:space-between;font-size:12px}#proton-vpn-view .proton-meta{display:flex;gap:12px;flex-wrap:wrap;color:var(--text-subtitle,#555557)}"
                    + "#proton-vpn-view .proton-warning{padding:8px;background:#fff3cd;color:#594300;font-size:13px}#proton-vpn-view .proton-error{color:#b00020}"
                    + "#proton-vpn-view .proton-connected{color:#15803d}#proton-vpn-view .proton-card{position:relative}"
                    + "#proton-vpn-view .proton-overlay{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;border-radius:inherit;background:rgba(255,255,255,.8);font-size:16px;font-weight:500;color:var(--text-title,#1f1f3d);animation:proton-fade .2s .4s both}"
                    + "#proton-vpn-view .proton-overlay i{font-size:32px;color:var(--primary,#5272f7)}@keyframes proton-fade{from{opacity:0}to{opacity:1}}"
                    + "@media(max-width:540px){#proton-vpn-view .proton-location-row{grid-template-columns:1fr;gap:0}}"),
                h("gl-title", { attrs: { title: "Proton VPN" } }, [
                    this.info.authenticated ? button("Sign out", this.logout, this.updating, "logout") : null
                ]),
                h("gl-card", { class: "proton-card" }, [
                this.busy || this.updating ? h("div", { class: "proton-overlay", attrs: { role: "status", "data-testid": "overlay" } }, [
                    h("i", { class: "el-icon-loading" }),
                    this.updating ? "Refreshing the server list from Proton..." : this.notice || "Working..."
                ]) : null,
                account,
                h("div", { class: "proton-status" }, [
                    h("span", { class: { "proton-connected": connected }, attrs: { "data-testid": "connection-status",
                        "data-connected": String(!!this.info.connected) } },
                        [icon(connected ? "iconfont icon-shield-check-solid-full" : "iconfont icon-remote-connection"),
                            this.connectionText]),
                    h("a", { attrs: { href: "#/vpndashboard" } }, "VPN Dashboard")
                ]),
                this.info.authenticated ? h("div", [
                    h("div", { class: "proton-location-row" }, [
                        field([icon("iconfont icon-globe-regular-full"), "Country"], h("select", {
                            attrs: { disabled: this.busy, "data-testid": "country" },
                            domProps: { value: this.country },
                            on: { change: function (e) { self.country = e.target.value; self.loadCities(); } }
                        }, [h("option", { domProps: { value: "" } }, "Select...")].concat(this.countryOptions.map(function (c) {
                            return h("option", { domProps: { value: c.country } }, c.label + " (" + c.servers + ")");
                        })))),
                        field([icon("el-icon-location-outline"), "City"], h("select", {
                            attrs: { disabled: this.busy || !this.country, "data-testid": "city" },
                            domProps: { value: this.city },
                            on: { change: function (e) { self.city = e.target.value; self.loadServers(); } }
                        }, [h("option", { domProps: { value: "" } }, "Select...")].concat(this.cities.map(function (c) {
                            return h("option", { domProps: { value: c.city } }, c.city + " (" + c.servers + ")");
                        }))))
                    ]),
                    field([icon("iconfont icon-search"), "Search nodes"], input("search", "search", "Server name")),
                    field([icon("iconfont icon-network-server"),
                        "Nodes" + (this.city ? " (" + this.filteredServers.length + ")" : "") + " - WireGuard / IPv4"], h("select", {
                        attrs: { size: 12, disabled: this.busy || !this.city, "data-testid": "server" },
                        domProps: { value: this.server },
                        on: { change: function (e) { self.server = e.target.value; } }
                    }, this.filteredServers.map(function (s) {
                        var features = self.nodeFeatures(s);
                        return h("option", { key: s.name, attrs: { "data-load": s.load },
                            domProps: { value: s.name } },
                            s.name + " - load " + s.load + "%" + (features ? " - " + features : ""));
                    }))),
                    h("details", { class: "proton-advanced" }, [
                        h("summary", [icon("iconfont icon-setting"), "Advanced"]),
                        field("Existing tunnel ID (optional)", input("tunnel", "number", "Automatic"))
                    ])
                ]) : null,
                h("div", { class: "proton-actions" }, [
                    this.info.authenticated ? button("Connect / switch", this.connect,
                        !this.validSelection || this.updating, "connect") : null,
                    button("Disconnect", this.disconnect,
                        this.updating || !this.info.managed || !this.info.connection || !this.info.connection.enabled, "disconnect"),
                    button("Restore original VPN", this.restore, this.updating || !this.info.restore_available, "restore")
                ]),
                this.notice ? h("p", { attrs: { role: "status" } }, this.notice) : null,
                this.error ? h("p", { class: "proton-error", attrs: { role: "alert", "data-testid": "error" } }, this.error) : null,
                h("footer", { slot: "footer", class: "proton-footer" }, [
                    h("div", { class: "proton-meta" }, [
                        this.info.version ? h("span", { attrs: { "data-testid": "version" } }, "Version " + this.info.version) : null,
                        this.info.authenticated && this.catalog ? h("span", { attrs: { "data-testid": "catalog-age" } },
                            "Catalogue updated " + new Date(this.catalog.fetched_at * 1000).toLocaleString([], {
                                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                            })) : null,
                        this.info.last_handshake ? h("span", "Handshake " + new Date(this.info.last_handshake * 1000)
                            .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })) : null,
                    ]),
                    this.info.authenticated ? button("Refresh catalogue", () => self.refreshCatalog(true),
                        this.updating, "countries") : null,
                    this.catalogError ? h("p", { class: "proton-error", attrs: { "data-testid": "catalog-error" } },
                        "Refresh failed; saved locations remain available. " + this.catalogError) : null
                ])
            ])]);
        }
    };
}())
