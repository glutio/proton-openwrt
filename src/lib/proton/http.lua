local ffi = require("ffi")
local json = require("cjson.safe")
ffi.cdef[[
typedef void FILE;
FILE *tmpfile(void);
int fclose(FILE *);
int fflush(FILE *);
int fseek(FILE *, long, int);
long ftell(FILE *);
size_t fread(void *, size_t, size_t, FILE *);
typedef void curl_slist;
void *curl_easy_init(void);
void curl_easy_cleanup(void *);
int curl_easy_setopt(void *, int, ...);
int curl_easy_perform(void *);
int curl_easy_getinfo(void *, int, ...);
curl_slist *curl_slist_append(curl_slist *, const char *);
void curl_slist_free_all(curl_slist *);
const char *curl_easy_strerror(int);
]]
local curl = ffi.load("libcurl.so.4")
local M = {}

local function read(file)
    assert(ffi.C.fflush(file) == 0 and ffi.C.fseek(file, 0, 2) == 0, "HTTP buffer failed")
    local size = tonumber(ffi.C.ftell(file))
    assert(size >= 0 and size <= 32 * 1024 * 1024, "HTTP response exceeds 32 MiB")
    assert(ffi.C.fseek(file, 0, 0) == 0)
    local data = ffi.new("char[?]", size + 1)
    assert(tonumber(ffi.C.fread(data, 1, size, file)) == size, "HTTP response read failed")
    return ffi.string(data, size)
end

function M.request(method, path, body, session)
    -- SessionHolder formats the API-core version, not the CLI package version.
    local app_version = "linux-vpn-cli@5.8.11+aarch64"
    assert(path:match("^/[a-zA-Z0-9/?=&._%%-]+$") and not path:find("..", 1, true), "invalid API path")
    assert(method == "GET" or method == "POST" or method == "DELETE", "invalid HTTP method")
    local handle = curl.curl_easy_init()
    assert(handle ~= nil, "curl initialization failed")
    handle = ffi.gc(handle, curl.curl_easy_cleanup)
    local output, headers = ffi.C.tmpfile(), ffi.C.tmpfile()
    assert(output ~= nil and headers ~= nil, "cannot create anonymous HTTP buffers")
    output, headers = ffi.gc(output, ffi.C.fclose), ffi.gc(headers, ffi.C.fclose)
    local refs = {}
    local function option(id, value)
        if type(value) == "number" then value = ffi.cast("long", value)
        elseif type(value) == "string" then
            refs[#refs + 1] = value
            value = ffi.cast("const char *", value)
        end
        assert(curl.curl_easy_setopt(handle, id, value) == 0, "curl option failed")
    end
    local list
    local function header(s)
        assert(not s:find("[\r\n]"), "invalid HTTP header")
        local nextlist = curl.curl_slist_append(list, s)
        assert(nextlist ~= nil, "curl header allocation failed")
        list = nextlist
    end
    header("Accept: application/json")
    header("Content-Type: application/json")
    header("x-pm-appversion: " .. app_version)
    if session then
        header("x-pm-uid: " .. session.UID)
        header("Authorization: Bearer " .. session.AccessToken)
    end
    list = ffi.gc(list, curl.curl_slist_free_all)
    option(10002, "https://vpn-api.proton.me" .. path) -- CURLOPT_URL
    option(10018, "proton-openwrt/0.1 (Linux; OpenWrt/21.02)") -- CURLOPT_USERAGENT
    option(10036, method) -- CURLOPT_CUSTOMREQUEST
    option(10023, list) -- CURLOPT_HTTPHEADER
    option(10001, output) -- CURLOPT_WRITEDATA
    option(10029, headers) -- CURLOPT_HEADERDATA
    option(13, 60) -- CURLOPT_TIMEOUT
    option(78, 15) -- CURLOPT_CONNECTTIMEOUT
    option(99, 1) -- CURLOPT_NOSIGNAL
    option(181, 2) -- CURLPROTO_HTTPS; redirects remain disabled.
    option(64, 1) -- CURLOPT_SSL_VERIFYPEER
    option(81, 2) -- CURLOPT_SSL_VERIFYHOST
    option(10230, "sha256//CT56BhOTmj5ZIPgb/xD5mH8rY3BLo/MlhP7oPyJUEDo=;"
        .. "sha256//35Dx28/uzN3LeltkCBQ8RHK0tlNSa2kCpCRGNp34Gxc=;"
        .. "sha256//qYIukVc63DEITct8sFT7ebIq5qsWmuscaIKeJx+5J5A=")
    local encoded
    if body then
        encoded = assert(json.encode(body))
        option(10015, encoded) -- CURLOPT_POSTFIELDS
        option(60, #encoded) -- CURLOPT_POSTFIELDSIZE
    end
    local result = curl.curl_easy_perform(handle)
    assert(result == 0, "HTTPS transport failed: " .. ffi.string(curl.curl_easy_strerror(result)))
    local status = ffi.new("long[1]")
    assert(curl.curl_easy_getinfo(handle, 0x200002, status) == 0)
    local content_type = ffi.new("char *[1]")
    assert(curl.curl_easy_getinfo(handle, 0x100012, content_type) == 0)
    local kind = content_type[0] ~= nil and ffi.string(content_type[0]) or ""
    local response = read(output)
    local response_headers = read(headers):lower()
    -- Finish the transfer while all POST/header string references are still alive.
    curl.curl_easy_cleanup(ffi.gc(handle, nil))
    curl.curl_slist_free_all(ffi.gc(list, nil))
    ffi.C.fclose(ffi.gc(output, nil))
    ffi.C.fclose(ffi.gc(headers, nil))
    assert(kind:lower():match("^application/json[%s;]*"), "API returned non-JSON data (HTTP "
        .. tonumber(status[0]) .. ")")
    local decoded = json.decode(response)
    assert(type(decoded) == "table" and type(decoded.Code) == "number", "malformed API response")
    return tonumber(status[0]), decoded, response_headers:match("retry%-after:%s*(%d+)")
end

return M
