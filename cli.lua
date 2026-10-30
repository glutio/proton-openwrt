local json = require("cjson.safe")
local store_module = require("proton.store")
local client_module = require("proton.client")
local command = arg[1]
local store

local function output(value)
    print(assert(json.encode(value)))
end

local function main()
    if command == nil or command == "help" then
        print("Usage: proton-openwrt refresh | countries | servers [CC] | select NAME_OR_ID_OR_CC | prepare | connect [TUNNEL_ID] | disconnect | status | restore | logout")
        return
    end
    store = store_module.open(os.getenv("PROTON_STATE_DIR") or "/etc/proton-openwrt")
    store_module.lock(store)
    if command == "refresh" then
        client_module.refresh(store)
        print("Tokens refreshed.")
    elseif command == "countries" then
        output(require("proton.servers").countries(client_module.discover(store)))
    elseif command == "servers" then
        local servers, out = client_module.discover(store), {}
        for _, s in ipairs(servers) do
            if not arg[2] or s.country == arg[2]:upper() then
                out[#out + 1] = {
                    id = s.id, name = s.name, country = s.country, city = s.city,
                    load = s.load, tier = s.tier, features = s.features,
                }
            end
        end
        output(out)
    elseif command == "select" then
        output(client_module.select(store, assert(arg[2], "selection is required")))
    elseif command == "prepare" then
        output(require("proton.glinet").prepare(store))
    elseif command == "connect" then
        local id = arg[2] and assert(tonumber(arg[2]), "tunnel ID must be numeric")
        output(require("proton.glinet").connect(store, id))
    elseif command == "status" then
        output(require("proton.glinet").status())
    elseif command == "disconnect" then
        output(require("proton.glinet").disconnect(store))
    elseif command == "restore" then
        output(require("proton.glinet").restore(store))
    elseif command == "logout" then
        client_module.logout(store)
        print("Session revoked and discovery state removed.")
    else error("unknown command; use help") end
end

local ok, err = pcall(main)
if store then store_module.close(store) end
if not ok then
    io.stderr:write("proton-openwrt: " .. client_module.error_string(err) .. "\n")
    os.exit(1)
end
