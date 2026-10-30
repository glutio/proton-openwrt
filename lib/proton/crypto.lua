local ffi = require("ffi")
ffi.cdef[[
typedef void BIGNUM;
typedef void BN_CTX;
typedef void EVP_PKEY;
typedef void EVP_MD_CTX;
typedef void EVP_MD;
int RAND_bytes(unsigned char *, int);
unsigned char *SHA256(const unsigned char *, size_t, unsigned char *);
unsigned char *SHA512(const unsigned char *, size_t, unsigned char *);
int CRYPTO_memcmp(const void *, const void *, size_t);
char *crypt(const char *, const char *);
BIGNUM *BN_new(void);
void BN_clear_free(BIGNUM *);
void BN_set_flags(BIGNUM *, int);
BIGNUM *BN_lebin2bn(const unsigned char *, int, BIGNUM *);
int BN_bn2lebinpad(const BIGNUM *, unsigned char *, int);
int BN_num_bits(const BIGNUM *);
int BN_set_word(BIGNUM *, unsigned long);
BN_CTX *BN_CTX_new(void);
void BN_CTX_free(BN_CTX *);
int BN_add(BIGNUM *, const BIGNUM *, const BIGNUM *);
int BN_mul(BIGNUM *, const BIGNUM *, const BIGNUM *, BN_CTX *);
int BN_nnmod(BIGNUM *, const BIGNUM *, const BIGNUM *, BN_CTX *);
int BN_mod_sub(BIGNUM *, const BIGNUM *, const BIGNUM *, const BIGNUM *, BN_CTX *);
int BN_mod_exp_mont_consttime(BIGNUM *, const BIGNUM *, const BIGNUM *,
                             const BIGNUM *, BN_CTX *, void *);
EVP_PKEY *EVP_PKEY_new_raw_public_key(int, void *, const unsigned char *, size_t);
EVP_PKEY *EVP_PKEY_new_raw_private_key(int, void *, const unsigned char *, size_t);
int EVP_PKEY_get_raw_public_key(const EVP_PKEY *, unsigned char *, size_t *);
void EVP_PKEY_free(EVP_PKEY *);
EVP_MD_CTX *EVP_MD_CTX_new(void);
void EVP_MD_CTX_free(EVP_MD_CTX *);
int EVP_DigestVerifyInit(EVP_MD_CTX *, void *, const EVP_MD *, void *, EVP_PKEY *);
int EVP_DigestVerify(EVP_MD_CTX *, const unsigned char *, size_t,
                     const unsigned char *, size_t);
]]

local ssl = ffi.load("libcrypto.so.1.1")
local M = { ffi = ffi, ssl = ssl }
local alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

function M.hex(s)
    return (s:gsub(".", function(c) return string.format("%02x", c:byte()) end))
end

function M.unhex(s)
    assert(#s % 2 == 0 and not s:find("[^%da-fA-F]"), "invalid hexadecimal input")
    return (s:gsub("..", function(c) return string.char(tonumber(c, 16)) end))
end

function M.b64(s, chars)
    chars = chars or alphabet
    local out = {}
    for i = 1, #s, 3 do
        local a, b, c = s:byte(i, i + 2)
        local n = (a << 16) | ((b or 0) << 8) | (c or 0)
        out[#out + 1] = chars:sub(((n >> 18) & 63) + 1, ((n >> 18) & 63) + 1)
            .. chars:sub(((n >> 12) & 63) + 1, ((n >> 12) & 63) + 1)
            .. (b and chars:sub(((n >> 6) & 63) + 1, ((n >> 6) & 63) + 1) or "=")
            .. (c and chars:sub((n & 63) + 1, (n & 63) + 1) or "=")
    end
    return table.concat(out)
end

function M.unb64(s)
    assert(type(s) == "string" and #s % 4 == 0 and not s:find("[^A-Za-z0-9+/=]"),
        "invalid base64 input")
    local out = {}
    for i = 1, #s, 4 do
        local part = s:sub(i, i + 3)
        local n = 0
        for j = 1, 4 do
            local c = part:sub(j, j)
            local p = alphabet:find(c, 1, true)
            assert(p or c == "=", "invalid base64 input")
            n = (n << 6) | (p and p - 1 or 0)
        end
        out[#out + 1] = string.char((n >> 16) & 255)
        if part:sub(3, 3) ~= "=" then out[#out + 1] = string.char((n >> 8) & 255) end
        if part:sub(4, 4) ~= "=" then out[#out + 1] = string.char(n & 255) end
    end
    local decoded = table.concat(out)
    assert(M.b64(decoded) == s, "noncanonical base64 input")
    return decoded
end

function M.hash(s, bits)
    bits = bits or 512
    local out = ffi.new("unsigned char[?]", bits // 8)
    if bits == 256 then
        assert(ssl.SHA256(ffi.cast("const unsigned char *", s), #s, out) ~= nil, "SHA256 failed")
    else
        assert(bits == 512, "unsupported digest")
        assert(ssl.SHA512(ffi.cast("const unsigned char *", s), #s, out) ~= nil, "SHA512 failed")
    end
    return ffi.string(out, bits // 8)
end

function M.expand(s)
    local out = {}
    for i = 0, 3 do out[#out + 1] = M.hash(s .. string.char(i)) end
    return table.concat(out)
end

function M.random(n)
    local out = ffi.new("unsigned char[?]", n)
    assert(ssl.RAND_bytes(out, n) == 1, "secure random generator failed")
    return ffi.string(out, n)
end

function M.equal(a, b)
    return type(a) == "string" and type(b) == "string" and #a == #b
        and ssl.CRYPTO_memcmp(a, b, #a) == 0
end

function M.password_hash(password, salt, modulus)
    assert(type(password) == "string" and #password > 0 and not password:find("\0", 1, true),
        "password must be nonempty and contain no NUL bytes")
    assert(#salt == 10, "unexpected SRP salt length")
    local setting = "$2y$10$" .. M.b64(salt .. "proton",
        "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"):sub(1, 22)
    local p = ffi.C.crypt(password:sub(1, 72), setting)
    assert(p ~= nil, "bcrypt unavailable")
    local result = ffi.string(p)
    assert(#result == 60 and result:sub(1, 29) == setting, "libc does not support bcrypt")
    return M.expand(result .. modulus)
end

function M.bn(bytes)
    local n = ssl.BN_new()
    assert(n ~= nil, "BIGNUM allocation failed")
    n = ffi.gc(n, ssl.BN_clear_free)
    ssl.BN_set_flags(n, 4)
    if bytes then
        assert(ssl.BN_lebin2bn(ffi.cast("const unsigned char *", bytes), #bytes, n) ~= nil,
            "BIGNUM decode failed")
    end
    return n
end

function M.bytes(n, size)
    size = size or 256
    local out = ffi.new("unsigned char[?]", size)
    assert(ssl.BN_bn2lebinpad(n, out, size) == size, "BIGNUM serialization failed")
    return ffi.string(out, size)
end

function M.ctx()
    local ctx = ssl.BN_CTX_new()
    assert(ctx ~= nil, "BN_CTX allocation failed")
    return ffi.gc(ctx, ssl.BN_CTX_free)
end

function M.exp(base, exponent, modulus, ctx)
    local out = M.bn()
    assert(ssl.BN_mod_exp_mont_consttime(out, base, exponent, modulus, ctx, nil) == 1,
        "constant-time modular exponentiation failed")
    return out
end

function M.verify_ed25519(public, signature, message)
    assert(#public == 32 and #signature == 64, "invalid Ed25519 data")
    local key = ssl.EVP_PKEY_new_raw_public_key(1087, nil,
        ffi.cast("const unsigned char *", public), #public)
    assert(key ~= nil, "Ed25519 public key failed")
    key = ffi.gc(key, ssl.EVP_PKEY_free)
    local ctx = ssl.EVP_MD_CTX_new()
    assert(ctx ~= nil, "EVP context failed")
    ctx = ffi.gc(ctx, ssl.EVP_MD_CTX_free)
    assert(ssl.EVP_DigestVerifyInit(ctx, nil, nil, nil, key) == 1, "Ed25519 init failed")
    return ssl.EVP_DigestVerify(ctx, ffi.cast("const unsigned char *", signature), #signature,
        ffi.cast("const unsigned char *", message), #message) == 1
end

local function public_from_private(kind, private)
    local key = ssl.EVP_PKEY_new_raw_private_key(kind, nil,
        ffi.cast("const unsigned char *", private), #private)
    assert(key ~= nil, "private key import failed")
    key = ffi.gc(key, ssl.EVP_PKEY_free)
    local out, size = ffi.new("unsigned char[32]"), ffi.new("size_t[1]")
    size[0] = 32
    assert(ssl.EVP_PKEY_get_raw_public_key(key, out, size) == 1 and tonumber(size[0]) == 32,
        "public key derivation failed")
    return ffi.string(out, 32)
end

function M.keypair(seed)
    seed = seed or M.random(32)
    assert(#seed == 32, "invalid Ed25519 seed length")
    local scalar = M.hash(seed):sub(1, 32)
    scalar = string.char(scalar:byte(1) & 248) .. scalar:sub(2, 31)
        .. string.char((scalar:byte(32) & 127) | 64)
    return {
        public_key = M.b64(public_from_private(1087, seed)),
        private_key = M.b64(scalar),
        wireguard_public_key = M.b64(public_from_private(1034, scalar)),
    }
end

return M
