local json = require("cjson.safe")
local crypto = require("proton.crypto")
local modulus = require("proton.modulus")
local srp = require("proton.srp")
local Client = require("proton.client")
local Http = require("proton.http")
local Store = require("proton.store")
local Servers = require("proton.servers")
local Profile = require("proton.profile")
local GL = require("proton.glinet")
local Web = require("proton.web")
local fixture = dofile("tests/fixtures.lua")
local count = 0
local originals = { read = Store.read, write = Store.write, delete = Store.delete,
    write_text = Store.write_text, request = Http.request, prove = srp.prove,
    client_request = Client.request, discover = Client.discover,
    gl_call = GL.call, gl_prepare = GL.prepare, native = Profile.native,
    lock = Store.lock, popen = io.popen, login = Client.login,
    time = os.time, gl_connect = GL.connect }
local function test(name, fn)
    local ok, err = pcall(fn)
    Store.read, Store.write, Store.delete = originals.read, originals.write, originals.delete
    Store.write_text = originals.write_text
    Http.request, srp.prove = originals.request, originals.prove
    Client.request, Client.discover = originals.client_request, originals.discover
    GL.call, GL.prepare, Profile.native = originals.gl_call, originals.gl_prepare, originals.native
    Store.lock, io.popen, Client.login = originals.lock, originals.popen, originals.login
    os.time, GL.connect = originals.time, originals.gl_connect
    assert(ok, name .. ": " .. Client.error_string(err))
    count = count + 1
    print("ok " .. count .. " - " .. name)
end
local function fails(fn, pattern)
    local ok, err = pcall(fn)
    assert(not ok, "expected failure")
    if pattern then assert(tostring(err):match(pattern), tostring(err)) end
    return err
end

test("strict base64 round trip and rejection", function()
    for _, value in ipairs({ "", "a", "ab", "abc", "\0\255\10" }) do
        assert(crypto.unb64(crypto.b64(value)) == value)
    end
    for _, value in ipairs({ "a", "====", "a===", "Zh==", "YWJj\n" }) do
        fails(function() crypto.unb64(value) end)
    end
end)

test("signed modulus accepted and tampering rejected", function()
    assert(#modulus.verify(fixture.modulus) == 256)
    assert(#modulus.verify(fixture.modulus:gsub("\n", "\r\n")) == 256)
    fails(function() modulus.verify(fixture.modulus:gsub("091HB", "191HB", 1)) end)
    fails(function() modulus.verify(fixture.modulus:gsub("VWjPi", "WWjPi", 1)) end)
    fails(function() modulus.verify("-----BEGIN PGP SIGNED MESSAGE-----\n") end)
end)

test("Proton SRP matches independent Python client and server", function()
    local f = assert(io.open("tests/oracle.json", "r"))
    local vectors = assert(json.decode(f:read("*a"))); f:close()
    for password, v in pairs(vectors) do
        local info = {
            Version = 4, Modulus = fixture.modulus, Salt = v.salt,
            ServerEphemeral = v.server, SRPSession = "public-test",
        }
        local payload, verify = srp.prove(password, info, function() return string.rep("A", 32) end)
        assert(payload.ClientEphemeral == v.ephemeral, "ephemeral mismatch")
        assert(payload.ClientProof == v.proof, "client proof mismatch")
        verify(v.server_proof)
        fails(function() verify(crypto.b64(string.rep("\0", 256))) end, "server proof")
        info.Version = 3
        assert(srp.prove(password, info, function() return string.rep("A", 32) end).ClientProof == v.proof)
    end
end)

test("unsafe SRP inputs fail closed", function()
    local info = {
        Version = 4, Modulus = fixture.modulus, Salt = crypto.b64(string.rep("\0", 10)),
        ServerEphemeral = crypto.b64(string.rep("\0", 256)), SRPSession = "test",
    }
    fails(function() srp.prove("test", info) end, "unsafe server")
    info.Version = 2
    fails(function() srp.prove("test", info) end, "unsupported SRP")
end)

local key = crypto.b64(string.rep("K", 32))
local function logical(name, tier, status, ip)
    return {
        ID = name .. "-id", Name = name, ExitCountry = "US", City = "Test",
        Tier = tier or 0, Status = status or 1, Features = 0, Score = 2, Load = 10,
        Servers = { { ID = "peer", EntryIP = ip or "192.0.2.1",
            X25519PublicKey = key, Status = 1, Domain = "example.invalid", Label = "1" } },
    }
end

test("discovery filters entitlement, offline servers and malformed peers", function()
    local list = {
        logical("US#1"), logical("US#2", 2), logical("US#3", 0, 0),
        logical("US#4", 0, 1, "999.1.1.1"), logical("US#5", 0, 1, "bad"),
    }
    local eligible = Servers.eligible(list, 0)
    assert(#eligible == 1 and eligible[1].name == "US#1")
    assert(eligible[1].peers[1].label == "1")
    assert(Servers.countries(eligible)[1].servers == 1)
    assert(Servers.select(eligible, "US").name == "US#1")
    fails(function() Servers.select(eligible, "CA") end)
end)

test("discovery key validation matches canonical 32-byte base64", function()
    local alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    for i=1,#alphabet do
        local candidate=key:sub(1,42)..alphabet:sub(i,i).."="
        local valid,decoded=pcall(crypto.unb64,candidate)
        local server=logical("US#1")
        server.Servers[1].X25519PublicKey=candidate
        assert((#Servers.eligible({server},0)==1)==(valid and #decoded==32))
    end
    for _,candidate in ipairs({key:sub(2),key.."A",key:gsub("^.", "="),key:gsub("^.", "_")}) do
        local server=logical("US#1");server.Servers[1].X25519PublicKey=candidate
        assert(#Servers.eligible({server},0)==0)
    end
end)

local function memory()
    Store.read = function(state, n) return state.data[n] end
    Store.write = function(state, n, v) state.data[n] = v end
    Store.delete = function(state, n) state.data[n] = nil end
    Store.write_text = function(state, n, v) state.data[n] = v end
    return { data = {} }
end
local function session()
    return { UID = "uid", AccessToken = "old-access", RefreshToken = "old-refresh", Scopes = { "vpn" } }
end
local function transport(queue)
    local calls = {}
    Http.request = function(method, path, body, auth)
            calls[#calls + 1] = { method = method, path = path, body = body, auth = auth }
            local next = table.remove(queue, 1)
            assert(next, "unexpected HTTP request")
            return next[1], next[2], next[3]
        end
    return { calls = calls }
end
local function prover()
    return { ClientEphemeral = "A", ClientProof = "M", SRPSession = "s" },
        function(proof) assert(proof == "verified") end
end
local function fake_srp() srp.prove = prover end
local function auth_reply(twofa)
    local value = session()
    value.Code, value.ServerProof = 1000, "verified"
    if twofa then value.Scopes = { "twofactor" }; value["2FA"] = twofa end
    return value
end
local account = { Code = 1000, Delinquent = 0, VPN = { MaxTier = 0 } }
local server_response = { Code = 1000, LogicalServers = { logical("US#1") } }

test("login is SRP verified and discovery uses authenticated requests", function()
    local store = memory()
    fake_srp()
    local http = transport({ {200, {Code=1000}}, {200, auth_reply()}, {200,account}, {200,server_response} })
    Client.login(store, "test", "not-a-real-password")
    assert(http.calls[1].path == "/auth/info" and http.calls[1].auth == nil)
    assert(http.calls[2].body.Username == "test")
    assert(http.calls[3].auth.AccessToken == "old-access")
    assert(store.data["session.json"] and #http.calls == 4)
    assert(store.data["session.json"].Username == nil)
end)

test("bad server proof never persists tokens or accesses VPN resources", function()
    local store, reply = memory(), auth_reply()
    fake_srp()
    reply.ServerProof = "invalid"
    local http = transport({ {200,{Code=1000}}, {200,reply} })
    fails(function() Client.login(store, "test", "test") end)
    assert(not store.data["session.json"] and #http.calls == 2)
end)

test("TOTP promotes scopes before discovery; FIDO2-only is explicit", function()
    local store = memory()
    fake_srp()
    local http = transport({
        {200,{Code=1000}}, {200,auth_reply({Enabled=1})},
        {200,{Code=1000,Scopes={"vpn"}}}, {200,account}, {200,server_response},
    })
    Client.login(store, "test", "test", function() return "123456" end)
    assert(http.calls[3].path == "/auth/2fa")
    assert(http.calls[3].body.TwoFactorCode == "123456" and http.calls[3].auth.UID == "uid")
    local rejected = memory()
    local fido = transport({ {200,{Code=1000}}, {200,auth_reply({Enabled=2})}, {200,{Code=1000}} })
    fails(function() Client.login(rejected, "test", "test") end, "FIDO2")
    assert(not rejected.data["session.json"])
end)

test("401 rotates and persists both tokens before a single retry", function()
    local store = memory(); Store.write(store, "session.json", session())
    local http = transport({
        {401,{Code=401}}, {200,{Code=1000,AccessToken="new-access",RefreshToken="new-refresh",Scopes={"vpn"}}},
        {200,{Code=1000}},
    })
    local original = Http.request
    Http.request = function(method, path, body, auth)
        if #http.calls == 2 then
            assert(store.data["session.json"].RefreshToken == "new-refresh")
            assert(auth.AccessToken == "new-access")
        end
        return original(method, path, body, auth)
    end
    Client.request(store, "GET", "/vpn/v2")
    assert(#http.calls == 3 and http.calls[2].path == "/auth/refresh")
    assert(http.calls[2].body.GrantType == "refresh_token")
    assert(store.data["session.json"].RefreshToken == "new-refresh")
end)

test("403 is not refreshed and incomplete scope cannot access VPN", function()
    local store = memory(); Store.write(store, "session.json", session())
    local http = transport({ {403,{Code=403}} })
    local err = fails(function() Client.request(store, "GET", "/vpn/v2") end)
    assert(err.kind == "scope" and #http.calls == 1)
    store.data["session.json"].Scopes = {"twofactor"}
    fails(function() Client.request(store, "GET", "/vpn/v2") end, "VPN scope")
    assert(#http.calls == 1)
end)

test("revoked refresh clears session; rate limiting preserves it without retry", function()
    local store = memory(); Store.write(store, "session.json", session())
    store.data["catalog.json"] = { uid = "uid" }
    local http = transport({ {422,{Code=10013}} })
    fails(function() Client.refresh(store) end)
    assert(store.data["session.json"] == nil and store.data["catalog.json"] == nil)
    Store.write(store, "session.json", session())
    local limited = transport({ {429,{Code=429},"30"} })
    local err = fails(function() Client.refresh(store) end)
    assert(err.kind == "rate_limit" and err.retry_after == "30")
    assert(store.data["session.json"] and #limited.calls == 1)
end)

test("human verification and JSON success-code failures are explicit", function()
    local store = memory()
    fake_srp()
    local http = transport({ {422,{Code=9001}} })
    local err = fails(function() Client.login(store, "test","test") end)
    assert(err.kind == "human_verification")
    local malformed = transport({ {200,{Code=8002}} })
    fails(function() Client.login(store, "test","test") end)
end)

test("key generation matches RFC 8032 and clamps the WireGuard scalar", function()
    local keys = crypto.keypair(crypto.unhex(
        "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"))
    assert(crypto.hex(crypto.unb64(keys.public_key))
        == "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")
    local scalar = crypto.unb64(keys.private_key)
    assert(scalar:byte(1) & 7 == 0 and scalar:byte(32) & 192 == 64)
    assert(#crypto.unb64(keys.wireguard_public_key) == 32)
end)

test("native servers keep independent registrations, labels and cached keys", function()
    local state = memory()
    local a, b = logical("US#1"), logical("US#2")
    b.Servers[1].Label = "2"
    local selected = Servers.eligible({a, b}, 0)
    local calls = 0
    Client.request = function(_, method, path, body)
        assert(method == "POST" and path == "/vpn/v1/certificate")
        local pending = state.data["native-profiles.json"][body.Features.peerName]
        assert(pending.keys.public_key == body.ClientPublicKey and not pending.certificate)
        assert(body.Mode == "persistent" and body.Features.platform == "Router")
        assert(#crypto.unb64(body.ClientPublicKey) == 32)
        calls = calls + 1
        assert(body.Features.Bouncing == tostring(calls))
        return {Mode="persistent",SerialNumber="native-"..calls,ExpirationTime=os.time()+3600}
    end
    local first = Profile.native(state, selected[1])
    local second = Profile.native(state, selected[2])
    assert(first.keys.public_key ~= second.keys.public_key)
    assert(Profile.native(state, selected[1]).keys.public_key == first.keys.public_key)
    assert(calls == 2)
    selected[1].peers[1] = {ip="192.0.2.9",public_key=key,label="1"}
    fails(function() Profile.native(state, selected[1]) end, "unavailable")
end)

test("native lost registration fails closed and expired certificates renew in place", function()
    local state = memory()
    local selected = Servers.eligible({logical("US#1")}, 0)[1]
    local calls = 0
    Client.request = function() calls = calls + 1; error("lost registration response") end
    fails(function() Profile.native(state, selected) end, "lost registration")
    local p = state.data["native-profiles.json"][selected.name]
    assert(p.keys and not p.certificate)
    fails(function() Profile.native(state, selected) end, "unfinished native")
    assert(calls == 1)
    p.certificate = {ExpirationTime=os.time()-1}
    Client.request = function(_, method, _, body)
        assert(method == "POST" and body.Renew and body.ClientPublicKey == p.keys.public_key)
        assert(body.Features.Bouncing == "1")
        return {Mode="persistent",SerialNumber="renewed",ExpirationTime=os.time()+3600}
    end
    assert(Profile.native(state, selected).certificate.SerialNumber == "renewed")
end)

test("native prepare imports once, verifies readback and never starts a tunnel", function()
    local state = memory()
    local selected = Servers.eligible({logical("US#1")}, 0)[1]
    state.data["selected.json"] = selected
    state.data["native-profiles.json"] = { [selected.name] = {
        server=selected.name,peer=selected.peers[1],keys=crypto.keypair(string.rep("N",32)),
        features={Bouncing="1"},certificate={ExpirationTime=os.time()+3600},
    } }
    Client.discover = function() return {selected} end
    local groups, peers, adds = {{group_id=700,group_name="Existing"}}, {}, 0
    GL.call = function(module, method, params)
        assert(module == "wg-client", "prepare must not touch the live tunnel")
        if method == "get_group_list" then return {groups=groups}
        elseif method == "add_group" then
            assert(params.group_name == "Proton CLI")
            groups[2] = {group_id=42,group_name=params.group_name}
            return {}
        elseif method == "get_config_list" then assert(params.group_id==42); return {peers=peers}
        elseif method == "add_config" then
            adds = adds + 1
            assert(params.group_id==42 and params.dns=="10.2.0.1")
            assert(params.allowed_ips=="0.0.0.0/0" and params.end_point=="192.0.2.1:51820")
            assert(params.private_key==state.data["native-profiles.json"][selected.name].keys.private_key)
            params.peer_id = 55; peers[1] = params
            return {}
        else error("unexpected native method "..method) end
    end
    assert(GL.prepare(state).peer_id == 55 and adds == 1)
    assert(GL.prepare(state).peer_id == 55 and adds == 1)
    assert(groups[1].group_name == "Existing")
    peers[1].dns = "192.0.2.53"
    fails(function() GL.prepare(state) end, "edited")
    assert(adds == 1)
end)

test("native connect switches only profile references and restores the original failover list", function()
    local state = memory()
    local current = {
        tunnel_id=900,enabled=true,via={type="wireguard",configs={{group_id=700,id_list={701,702}}}},
        from={type="interface",interface_list={"lan"}},to={type="exclude_domain",domain_list="example.test"},
        killswitch=true,options={masq=true,service_policy=false},
    }
    local original = assert(json.encode(current.via))
    local next_peer, mutations = 10, {}
    GL.prepare = function() return {server="US#"..next_peer,group_id=42,peer_id=next_peer} end
    GL.call = function(module, method, params)
        assert(module == "vpn-client")
        if method == "get_tunnel" then return {tunnels={current}} end
        assert(method == "set_tunnel")
        assert(params.from==nil and params.to==nil and params.killswitch==nil and params.options==nil)
        assert(state.data["gl-restore.json"], "restoration must be durable before switching")
        mutations[#mutations+1] = params
        current.via, current.enabled = params.via, params.enabled
        return {}
    end
    assert(GL.connect(state).tunnel_id == 900)
    next_peer = 11
    GL.connect(state)
    assert(#mutations==2 and current.via.configs[1].id_list[1]==11)
    assert(json.encode(state.data["gl-restore.json"].via) == original)
    GL.restore(state)
    assert(json.encode(current.via)==original and #current.via.configs[1].id_list==2)
    assert(current.killswitch and current.options.service_policy==false)
    assert(current.to.domain_list=="example.test" and not state.data["gl-restore.json"])
end)

test("failed native switch or restore retains recovery state and ambiguous tunnels fail closed", function()
    local state = memory()
    local current = {tunnel_id=900,enabled=true,via={type="wireguard",configs={{group_id=1,id_list={2}}}}}
    GL.prepare = function() return {server="US#1",group_id=42,peer_id=55} end
    GL.call = function(_, method)
        if method == "get_tunnel" then return {tunnels={current}} end
        error("native rejected switch")
    end
    fails(function() GL.connect(state) end, "rejected")
    assert(state.data["gl-restore.json"].via.configs[1].group_id==1)
    fails(function() GL.restore(state) end, "rejected")
    assert(state.data["gl-restore.json"])
    local other = {tunnel_id=2932,enabled=true,via={type="wireguard"}}
    state.data["gl-restore.json"] = nil
    GL.call = function(_, method)
        assert(method=="get_tunnel")
        return {tunnels={current,other}}
    end
    fails(function() GL.connect(state) end, "multiple WireGuard")
    assert(not state.data["gl-restore.json"])
end)

test("native disconnect only disables the managed group and retains recovery and policies", function()
    local state = memory()
    local original = {tunnel_id=900,enabled=true,via={type="wireguard",configs={{group_id=1,id_list={2,3}}}}}
    state.data["gl-restore.json"] = original
    state.data["glinet.json"] = {group_id=42,peers={["US#1"]=55}}
    local current = {tunnel_id=900,enabled=true,killswitch=true,
        via={type="wireguard",configs={{group_id=42,id_list={55}}}}}
    local changes = 0
    GL.call = function(module, method, params)
        assert(module=="vpn-client")
        if method=="get_tunnel" then return {tunnels={current}} end
        assert(method=="set_tunnel" and params.tunnel_id==900 and params.enabled==false)
        assert(params.via==nil and params.killswitch==nil and params.options==nil)
        changes=changes+1; current.enabled=false
        return {}
    end
    GL.disconnect(state)
    assert(changes==1 and current.killswitch and state.data["gl-restore.json"]==original)
    current.via.configs[1].group_id=999
    fails(function() GL.disconnect(state) end, "refusing to disconnect")
    current.via.configs={{group_id=42,id_list={55}},{group_id=999,id_list={1}}}
    fails(function() GL.disconnect(state) end, "refusing to disconnect")
    assert(changes==1 and state.data["gl-restore.json"]==original)
end)

test("web status requires the intended kernel key and peer handshake and never returns secrets", function()
    local state = memory()
    state.data["session.json"]={AccessToken="SECRET_TOKEN",RefreshToken="SECRET_REFRESH"}
    state.data["selected.json"]={name="US#1",country="US",peers={{public_key="HIDDEN_PEER"}}}
    state.data["glinet.json"]={group_id=42,peers={["US#1"]=55}}
    state.data["native-profiles.json"]={["US#1"]={
        keys={wireguard_public_key="expected",private_key="SECRET_KEY"},peer={public_key="peer"},
        certificate={ExpirationTime=os.time()+3600},
    }}
    local current = {tunnel_id=900,enabled=true,via={type="wireguard",
        configs={{group_id=42,id_list={55}}}}}
    GL.call=function(_, method)
        if method=="get_tunnel" then return {tunnels={current}} end
        assert(method=="get_status")
        return {status_list={{tunnel_id=900,group_id=42,peer_id=55,enabled=true,status=1,
            peer_name="Proton US#1",via="wgclient1",private_key="SECRET_NATIVE"}}}
    end
    local local_key, handshake = "old", "peer\t123"
    io.popen=function(command)
        assert(command=="wg show wgclient1 public-key 2>/dev/null"
            or command=="wg show wgclient1 latest-handshakes 2>/dev/null")
        return {read=function() return command:find("public-key",1,true) and local_key.."\n" or handshake.."\n" end,
            close=function() return true end}
    end
    local status=Web.status(state)
    assert(status.authenticated and status.managed and not status.connected)
    local_key="expected";handshake="other-peer\t123"
    assert(not Web.status(state).connected)
    handshake="peer\t0"
    assert(not Web.status(state).connected)
    handshake="peer\t123"
    status=Web.status(state)
    assert(status.connected and status.last_handshake==123 and status.connection.name=="Proton US#1")
    local body=assert(json.encode(status))
    assert(not body:find("SECRET",1,true) and not body:find("HIDDEN_PEER",1,true))
    assert(not body:find("expected",1,true) and not body:find("public_key",1,true))
    current.via.configs[1].id_list={77}
    status=Web.status(state)
    assert(not status.connected and not status.connection.matches_configuration)
    assert(status.connection.status==1)
    current.via.configs[1].id_list={77,55}
    assert(Web.status(state).connected)
    current.enabled=false
    assert(not Web.status(state).connected)
    current.enabled=true;current.tunnel_id=999
    assert(not Web.status(state).connected)
end)

test("unmanaged WireGuard status rejects the previous profile during a native handoff", function()
    local state=memory()
    local current={tunnel_id=900,enabled=true,via={type="wireguard",
        configs={{group_id=42,id_list={55}}}}}
    GL.call=function(_,method)
        if method=="get_tunnel" then return {tunnels={current}} end
        assert(method=="get_status")
        return {status_list={{tunnel_id=900,group_id=10,peer_id=11,enabled=true,status=1,
            peer_name="Original VPN",via="wgclient1"}}}
    end
    local status=Web.status(state)
    assert(not status.managed and not status.connection.matches_configuration)
    current.via.configs={{group_id=10,id_list={11}}}
    assert(Web.status(state).connection.matches_configuration)
end)

test("contended web discovery reports busy without fetching or replaying mutations", function()
    local state=memory()
    state.data["session.json"]=session()
    Store.lock=function() error("another client is using this state directory") end
    Client.discover=function() error("must not fetch without the lock") end
    assert(Web.handle(state,"countries",{}).busy)
    assert(Web.handle(state,"servers",{country="US"}).busy)
    assert(Web.handle(state,"cities",{country="US"}).busy)
    assert(Web.handle(state,"refresh_catalog",{}).busy)
    fails(function() Web.handle(state,"connect",{server="US#1"}) end, "another client")
    fails(function() Web.handle(state,"logout",{}) end, "another client")
    Store.lock=function() error("private state failed") end
    fails(function() Web.handle(state,"countries",{}) end, "private state failed")
end)

test("web discovery is country-filtered and allowlisted without exposing profile data", function()
    local state=memory()
    state.data["session.json"]=session()
    local fetches, locks=0,0
    Store.lock=function() locks=locks+1 end
    Client.discover=function()
        fetches=fetches+1
        return {{name="US#1",country="US",city="Test",load=10,tier=0,features=14,peers={{private_key="SECRET"}}},
            {name="US#2",country="US",city="",load=10,tier=0,features={private_key="SECRET"}},
            {name="CA#1",country="CA",city="Test",load=20,tier=0,private_key="SECRET"}}
    end
    local response=Web.handle(state,"servers",{country="US",city="Test"})
    assert(#response.servers==1 and response.servers[1].name=="US#1")
    assert(response.servers[1].features==14 and state.data["catalog.json"].servers[1].features==14)
    assert(state.data["catalog.json"].servers[2].features==nil)
    assert(not assert(json.encode(response)):find("SECRET",1,true))
    assert(not assert(json.encode(response)):find('"uid"',1,true))
    assert(not assert(json.encode(state.data["catalog.json"])):find("SECRET",1,true))
    assert(#Web.handle(state,"countries",{}).countries==2)
    local cities=Web.handle(state,"cities",{country="US"}).cities
    assert(#cities==2 and cities[1].city=="Test" and cities[2].city=="Unspecified")
    assert(Web.handle(state,"servers",{country="US",city="Unspecified"}).servers[1].name=="US#2")
    assert(fetches==1 and locks==1)
    Store.lock=function() error("must not lock cached reads") end
    assert(#Web.handle(state,"countries",{}).countries==2)
    assert(not Web.handle(state,"refresh_catalog",{}).cache.stale)
    local err=fails(function() Web.handle(state,"servers",{country="US; reboot"}) end)
    assert(err.kind=="input")
    assert(fails(function() Web.handle(state,"servers",{country="US",city={}}) end).kind=="input")
    assert(not Web.error("SECRET_TOKEN private key from arbitrary diagnostic"):find("SECRET",1,true))
end)

test("catalogue TTL serves stale data without locking and refresh failure preserves it", function()
    local state=memory()
    state.data["session.json"]=session()
    local now, fetches=1000,0
    os.time=function() return now end
    Store.lock=function() end
    Client.discover=function()
        fetches=fetches+1
        return {{name="US#1",country="US",city="Test",load=10,tier=0}}
    end
    assert(not Web.handle(state,"countries",{}).cache.stale)
    local saved=state.data["catalog.json"]
    Store.lock=function() error("another client is using this state directory") end
    now=1299
    assert(not Web.handle(state,"countries",{}).cache.stale)
    now=1300
    assert(Web.handle(state,"countries",{}).cache.stale)
    assert(Web.handle(state,"refresh_catalog",{}).busy)
    now=999
    assert(Web.handle(state,"countries",{}).cache.stale)
    now=1400
    Store.lock=function() end
    Client.discover=function() error("upstream unavailable") end
    fails(function() Web.handle(state,"refresh_catalog",{}) end,"upstream")
    assert(state.data["catalog.json"]==saved and saved.fetched_at==1000 and fetches==1)
    assert(#Web.handle(state,"cities",{country="US"}).cities==1)
    Client.discover=function() return {{name="US#2",country="US",city="Test",load=20,tier=0}} end
    assert(not Web.handle(state,"refresh_catalog",{}).cache.stale)
    assert(Web.handle(state,"servers",{country="US",city="Test"}).servers[1].name=="US#2")
    local updated=state.data["catalog.json"]
    assert(not Web.handle(state,"refresh_catalog",{force=true}).cache.stale)
    assert(state.data["catalog.json"]~=updated)
    assert(fails(function() Web.handle(state,"refresh_catalog",{force="yes"}) end).kind=="input")
end)

test("catalogue requires VPN scope and cannot be reused by another session", function()
    local state=memory()
    state.data["catalog.json"]={uid="uid",fetched_at=os.time(),servers={{name="OLD",country="CA",city="Old"}}}
    fails(function() Web.handle(state,"countries",{}) end,"not logged in")
    state.data["session.json"]=session()
    state.data["session.json"].Scopes={"twofactor"}
    fails(function() Web.handle(state,"countries",{}) end,"VPN scope")
    state.data["session.json"]=session()
    state.data["session.json"].UID="new-uid"
    Store.lock=function() end
    Client.discover=function() return {{name="NEW",country="US",city="Test",load=10,tier=0}} end
    local result=Web.handle(state,"countries",{})
    assert(#result.countries==1 and result.countries[1].country=="US")
    assert(state.data["catalog.json"].uid=="new-uid")
end)

test("logout deletes catalogue but retains native profiles and connection recovery", function()
    local state=memory()
    for _, name in ipairs({"catalog.json","selected.json","native-profiles.json","gl-restore.json"}) do
        state.data[name]={}
    end
    state.data["session.json"]=session()
    local http=transport({{200,{Code=1000}}})
    Client.logout(state)
    assert(#http.calls==1 and http.calls[1].path=="/auth" and http.calls[1].method=="DELETE")
    assert(not state.data["session.json"] and not state.data["catalog.json"] and not state.data["selected.json"])
    assert(state.data["native-profiles.json"] and state.data["gl-restore.json"])
end)

test("web connect freshly discovers rather than authorizing from the catalogue", function()
    local state=memory()
    state.data["session.json"]=session()
    state.data["catalog.json"]={uid="uid",fetched_at=os.time(),servers={{name="OLD",country="CA",city="Old"}}}
    Store.lock=function() end
    local fetches=0
    Client.discover=function()
        fetches=fetches+1
        return Servers.eligible({logical("US#1")},0)
    end
    GL.connect=function(s,id)
        assert(s==state and id==900 and s.data["selected.json"].name=="US#1")
        return {ok=true}
    end
    assert(Web.handle(state,"connect",{server="US#1",tunnel_id=900}).ok and fetches==1)
end)

test("web login preserves existing sessions and permits password punctuation and optional TOTP", function()
    local state=memory()
    Store.lock=function() end
    local original={AccessToken="keep"}
    state.data["session.json"]=original
    local err=fails(function() Web.handle(state,"login",{username="new",password="new"}) end)
    assert(err.kind=="input" and state.data["session.json"]==original)
    state.data["session.json"]=nil
    Client.login=function(_, username, password, code)
        assert(username=="user" and password=="!a$'\"\\b")
        assert(code()=="123456")
        state.data["session.json"]=session()
        return {{name="US#1",country="US",city="Test",load=1,tier=0}}
    end
    assert(Web.handle(state,"login",{username="user",password="!a$'\"\\b",totp="123456"}).authenticated)
        assert(state.data["catalog.json"].servers[1].name=="US#1")
        state.data["session.json"]=nil
        local err=fails(function() Web.handle(state,"login",{username="user",password="x",totp={}}) end)
    assert(err.kind=="input")
    Client.login=function(_, _, _, code) code() end
    err=fails(function() Web.handle(state,"login",{username="user",password="x"}) end)
    assert(err.kind=="totp_required")
end)

test("private state is atomic, locked, and refuses public directories", function()
    local path = "/tmp/proton-test-" .. crypto.hex(crypto.random(8))
    local first = Store.open(path); Store.lock(first)
    Store.write(first, "test.json", { generation = 1 })
    Store.write(first, "test.json", { generation = 2 })
    assert(Store.read(first, "test.json").generation == 2)
    local second = Store.open(path)
    fails(function() Store.lock(second) end, "another client")
    Store.close(second)
    fails(function() Store.write(first, "../escape", {}) end)
    Store.delete(first, "test.json")
    assert(Store.read(first, "test.json") == nil)
    Store.delete(first, "lock"); Store.close(first)
    assert(os.remove(path))
    fails(function() Store.open("/tmp") end, "private")
end)

print(string.format("PASS: %d tests on %s", count, _VERSION))
