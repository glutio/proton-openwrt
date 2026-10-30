local crypto = require("proton.crypto")
local modulus = require("proton.modulus")
local ssl = crypto.ssl
local M = {}

function M.prove(password, info, random)
    assert(info.Version == 3 or info.Version == 4, "unsupported SRP version; log in on Proton's website first")
    assert(type(info.SRPSession) == "string" and #info.SRPSession > 0, "missing SRP session")
    local nbytes = modulus.verify(info.Modulus)
    local salt = crypto.unb64(info.Salt)
    local bbytes = crypto.unb64(info.ServerEphemeral)
    assert(#bbytes == 256, "invalid server ephemeral length")
    local ctx, n, g = crypto.ctx(), crypto.bn(nbytes), crypto.bn()
    assert(ssl.BN_set_word(g, 2) == 1)
    local secret = (random or crypto.random)(32)
    assert(#secret == 32, "invalid SRP randomness")
    secret = secret:sub(1, 31) .. string.char(secret:byte(32) | 128)
    local a, b = crypto.bn(secret), crypto.bn(bbytes)
    local rem = crypto.bn()
    assert(ssl.BN_nnmod(rem, b, n, ctx) == 1)
    assert(ssl.BN_num_bits(rem) ~= 0, "unsafe server ephemeral")
    local ephemeral = crypto.bytes(crypto.exp(g, a, n, ctx))
    local u = crypto.bn(crypto.expand(ephemeral .. bbytes))
    assert(ssl.BN_num_bits(u) ~= 0, "unsafe SRP scrambling parameter")
    local k = crypto.bn(crypto.expand(crypto.bytes(g) .. nbytes))
    local x = crypto.bn(crypto.password_hash(password, salt, nbytes))
    local v = crypto.exp(g, x, n, ctx)
    local kv, base, ux, exponent = crypto.bn(), crypto.bn(), crypto.bn(), crypto.bn()
    assert(ssl.BN_mul(kv, k, v, ctx) == 1)
    assert(ssl.BN_mod_sub(base, b, kv, n, ctx) == 1)
    assert(ssl.BN_mul(ux, u, x, ctx) == 1)
    assert(ssl.BN_add(exponent, a, ux) == 1)
    local shared = crypto.bytes(crypto.exp(base, exponent, n, ctx))
    local proof = crypto.expand(ephemeral .. bbytes .. shared)
    local expected = crypto.expand(ephemeral .. proof .. shared)
    return {
        ClientEphemeral = crypto.b64(ephemeral),
        ClientProof = crypto.b64(proof),
        SRPSession = info.SRPSession,
    }, function(server_proof)
        assert(crypto.equal(expected, crypto.unb64(server_proof)), "invalid SRP server proof")
    end
end

return M
