local crypto = require("proton.crypto")
local M = {}

-- Ed25519 point in the primary OpenPGP key pinned by Proton's Session._verify_modulus.
local public_key = crypto.unhex("16ead65d7c234de9aa8c3ec25e35d5c8a7f4a1fee7f42b662fcbfd7a79338201")

local function uint16(s, p)
    local a, b = s:byte(p, p + 1)
    assert(b, "truncated OpenPGP signature")
    return (a << 8) | b
end

local function mpi(s, p)
    local size = (uint16(s, p) + 7) // 8
    assert(size <= 32 and #s >= p + 1 + size, "invalid EdDSA MPI")
    local value = s:sub(p + 2, p + 1 + size)
    return string.rep("\0", 32 - size) .. value, p + 2 + size
end

local function packet(s)
    local tag, p, size = s:byte(1), 2
    assert(tag and tag & 0x80 ~= 0, "invalid OpenPGP packet")
    if tag & 0x40 ~= 0 then
        assert(tag & 63 == 2, "expected signature packet")
        local n = s:byte(p)
        assert(n, "truncated packet")
        p = p + 1
        if n < 192 then size = n
        elseif n < 224 then
            local b = s:byte(p)
            assert(b, "truncated packet length")
            size, p = ((n - 192) << 8) + b + 192, p + 1
        else error("unsupported OpenPGP packet length") end
    else
        assert((tag >> 2) & 15 == 2 and tag & 3 == 0, "unsupported signature packet")
        size, p = s:byte(p), p + 1
    end
    assert(size and #s == p + size - 1, "unexpected signature packet size")
    return s:sub(p)
end

function M.verify(armored)
    assert(type(armored) == "string" and #armored < 16384, "invalid signed modulus")
    armored = armored:gsub("\r\n", "\n")
    local clear, signature = armored:match(
        "^%-%-%-%-%-BEGIN PGP SIGNED MESSAGE%-%-%-%-%-\nHash: SHA256\n\n(.-)\n"
        .. "%-%-%-%-%-BEGIN PGP SIGNATURE%-%-%-%-%-\n(.-)%-%-%-%-%-END PGP SIGNATURE%-%-%-%-%-\n?$")
    assert(clear and signature, "unsupported signed modulus format")
    -- A modulus is one base64 line, so no general-purpose cleartext canonicalizer is needed.
    assert(not clear:find("\n") and clear:match("^[A-Za-z0-9+/]+=*$"), "invalid modulus text")
    local body = signature:match("\n\n(.*)")
    assert(body, "missing OpenPGP armor separator")
    local encoded = {}
    for line in body:gmatch("[^\n]+") do
        if line:sub(1, 1) ~= "=" then encoded[#encoded + 1] = line end
    end
    local sig = packet(crypto.unb64(table.concat(encoded)))
    assert(sig:sub(1, 4) == "\4\1\22\8", "unsupported OpenPGP signature algorithm")
    local hashed_end = 6 + uint16(sig, 5)
    assert(hashed_end <= #sig, "truncated hashed subpackets")
    local prefix = sig:sub(1, hashed_end)
    local digest = crypto.hash(clear .. prefix .. "\4\255" .. string.pack(">I4", #prefix), 256)
    local unhashed_size = uint16(sig, hashed_end + 1)
    local p = hashed_end + 3 + unhashed_size
    assert(sig:sub(p, p + 1) == digest:sub(1, 2), "modulus signature digest mismatch")
    local r, nextp = mpi(sig, p + 2)
    local s, endp = mpi(sig, nextp)
    assert(endp == #sig + 1, "trailing signature data")
    assert(crypto.verify_ed25519(public_key, r .. s, digest), "invalid Proton modulus signature")
    local modulus = crypto.unb64(clear)
    assert(#modulus == 256 and modulus:byte(256) >= 128 and modulus:byte(1) & 1 == 1,
        "invalid signed SRP modulus")
    return modulus
end

return M
