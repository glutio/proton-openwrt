const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const url = "http://192.168.8.1/#/proton-vpn";

(async () => {
    if (process.argv[2] === "component") {
        assert(process.argv[3], "Supply the SSH identity file for the test router.");
        const browser = await chromium.launch({channel:"chrome",headless:true});
        try {
            const page = await browser.newPage();
            await page.exposeFunction("testRouterRpc", async (action, params) => {
                assert(["status","countries","cities","servers","refresh_catalog"].includes(action),
                    "This test cannot mutate the VPN or account.");
                const body = JSON.stringify({jsonrpc:"2.0",id:1,method:"call",params:["","proton-vpn",action,params || {}]});
                const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
                const {stdout} = await promisify(execFile)("ssh",
                    ["-i",process.argv[3],"-o","IdentitiesOnly=yes","-o","BatchMode=yes","root@192.168.8.1",
                        "curl -fsS http://127.0.0.1/rpc -H 'glinet: 1' -H 'Host: 192.168.8.1' -H 'Content-Type: application/json' --data " + quote(body)],
                    {timeout:150000});
                const response = JSON.parse(stdout);
                assert(!response.error && response.result && !response.result.err_code);
                return response.result;
            });
            await page.goto(url);
            await page.waitForFunction(() => document.querySelector("#app")?.__vue__);
            await page.evaluate(async () => {
                const root = document.querySelector("#app");
                const source = await (await fetch("/views/gl-sdk4-ui-proton-vpn.common.js")).text();
                const options = (0, eval)(source);
                window.$rpcRequest = (_, args) => window.testRouterRpc(args[2], args[3]);
                root.style.display = "none";
                const host = document.createElement("div");
                document.body.appendChild(host);
                const Component = root.__vue__.$options._base.extend(options);
                window.testProton = new Component().$mount(host);
            });
            await page.locator("[data-testid=country] option").nth(1).waitFor({state:"attached"});
            const appearance = await page.evaluate(async () => {
                await document.fonts.ready;
                const root = document.querySelector("#proton-vpn-view");
                return {
                    nativeCard:root.classList.contains("gl-card-wrapper"),
                    font:getComputedStyle(root).fontFamily,
                    nativeFont:getComputedStyle(document.body).fontFamily,
                    icons:Array.from(root.querySelectorAll(".proton-icon"), icon => {
                        const font = getComputedStyle(icon).fontFamily;
                        return {
                            decorative:icon.getAttribute("aria-hidden") === "true",
                            glyph:getComputedStyle(icon, "::before").content,
                            nativeFont:/iconfont|element-icons/.test(font) && document.fonts.check("14px " + font)
                        };
                    })
                };
            });
            assert(appearance.nativeCard, "Use the installed native card component.");
            assert.equal(appearance.font, appearance.nativeFont, "Inherit the router's existing font.");
            assert(appearance.icons.length > 0 && appearance.icons.every(icon =>
                icon.decorative && icon.nativeFont && !["none","normal",'""'].includes(icon.glyph)),
                "Decorative icons must resolve to loaded native font glyphs.");
            assert(await page.getByRole("button", {name:"Sign out",exact:true}).isVisible(),
                "Icons must not replace accessible button labels.");
            const countryOptions = await page.locator("[data-testid=country] option").evaluateAll(options =>
                options.filter(option => option.value).map(option =>
                    ({code:option.value,name:option.textContent.replace(/ \(\d+\)$/, "")})));
            assert.equal(countryOptions[0].code, "US", "USA must be the first country.");
            const remaining = countryOptions.slice(1).map(c => c.name);
            assert.deepEqual(remaining, remaining.slice().sort((a, b) => a.localeCompare(b, "en")),
                "Remaining countries must sort by displayed name, not code.");
            assert.equal(await page.locator("#proton-vpn-view .proton-warning").count(), 0);
            assert.equal(await page.getByText("Uses GL.iNet's existing WireGuard dashboard, routing, DNS and kill switch.", {exact:true}).count(), 0);
            assert.equal(await page.getByText("Signed in using the session already stored on this router.", {exact:true}).count(), 0);
            const title = await page.locator("#proton-vpn-view h2").boundingBox();
            const logout = await page.locator("[data-testid=logout]").boundingBox();
            assert(logout.x > title.x && Math.abs(logout.y + logout.height / 2 - title.y - title.height / 2) < 3,
                "Sign out must be right-aligned on the title row.");
            const countryBox = await page.locator("[data-testid=country]").boundingBox();
            const cityBox = await page.locator("[data-testid=city]").boundingBox();
            assert(Math.abs(countryBox.y - cityBox.y) < 2 && cityBox.x > countryBox.x,
                "Country and city must share a row on desktop.");
            assert.equal(await page.locator("[data-testid=city]").inputValue(), "");
            assert.equal(await page.locator("[data-testid=server] option").count(), 0);
            await page.locator("[data-testid=country]").selectOption("CA");
            await page.locator("[data-testid=city] option").nth(1).waitFor({state:"attached"});
            const city = await page.locator("[data-testid=city] option").nth(1).evaluate(option => option.value);
            await page.locator("[data-testid=city]").selectOption(city);
            await page.locator("[data-testid=server] option").first().waitFor({state:"attached"});
            const nodes = await page.locator("[data-testid=server] option").count();
            const loads = await page.locator("[data-testid=server] option").evaluateAll(options =>
                options.map(option => Number(option.dataset.load)));
            assert(loads.every((load, index) => index === 0 || loads[index - 1] <= load),
                "Rendered nodes must be ordered from lowest to highest load.");
            const capabilities = await page.evaluate(() => window.testProton.servers
                .filter(s => s.features & 31).map(s => ({name:s.name,features:window.testProton.nodeFeatures(s)})));
            assert(capabilities.length > 0, "Live catalogue should retain node feature flags.");
            const optionTexts = await page.locator("[data-testid=server] option").allTextContents();
            for (const capability of capabilities) {
                assert(optionTexts.some(text =>
                    text.startsWith(capability.name + " - ") && text.includes(capability.features)));
            }
            const actionBoxes = await Promise.all(["connect","disconnect","restore"].map(id =>
                page.locator(`[data-testid=${id}]`).boundingBox()));
            assert(actionBoxes.every(box => Math.abs(box.y - actionBoxes[0].y) < 2),
                "Connection buttons must share one row on desktop.");
            const footer = await page.locator(".proton-footer").boundingBox();
            assert(footer.y > actionBoxes[0].y, "Catalogue controls must be below connection actions.");
            assert(!/seconds|cached/.test(await page.locator("[data-testid=catalog-age]").textContent()),
                "Catalogue metadata must use a static timestamp, not a ticking age.");
            assert.equal(await page.locator("[data-testid=tunnel]").isVisible(), false);
            await page.locator(".proton-advanced summary").click();
            assert(await page.locator("[data-testid=tunnel]").isVisible());
            await page.locator(".proton-advanced summary").click();
            assert((await page.locator("#proton-vpn-view").boundingBox()).height < 650,
                "The desktop page should remain compact.");
            if (process.argv[4]) await page.screenshot({path:process.argv[4],fullPage:true});
            const name = await page.locator("[data-testid=server] option").first().evaluate(option => option.value);
            await page.locator("[data-testid=server]").selectOption(name);
            await page.locator("[data-testid=search]").fill(name);
            assert(await page.locator("[data-testid=server] option").count() >= 1);
            assert(await page.locator("[data-testid=catalog-age]").isVisible());
            assert.equal(await page.locator("[data-testid=error]").count(), 0);
            await page.locator("[data-testid=country]").selectOption("US");
            await page.waitForFunction(() => !window.testProton.busy && window.testProton.cities.length > 0);
            assert.equal(await page.locator("[data-testid=city]").inputValue(), "");
            assert.equal(await page.locator("[data-testid=server] option").count(), 0);
            await page.setViewportSize({width:390,height:844});
            assert(await page.locator("#proton-vpn-view").evaluate(el => el.scrollWidth <= el.clientWidth),
                "Compact controls must not overflow on mobile.");
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
                "The native card and its margins must fit the mobile viewport.");
            await page.evaluate(() => {
                clearTimeout(window.testProton.timer);
                window.testProton.rpc = async () => ({});
                window.testProton.info = {};
            });
            assert.equal(await page.locator("#proton-vpn-view .proton-warning").count(), 0,
                "The HTTP warning must not flash before saved-session status is known.");
            await page.evaluate(() => {
                window.testProton.rpc = async () => ({authenticated:false});
                window.testProton.info = {authenticated:false};
            });
            await page.locator("[data-testid=username]").waitFor({state:"visible"});
            assert(await page.locator("#proton-vpn-view .proton-warning").isVisible(),
                "The HTTP warning must still appear before password entry.");
            assert.equal(await page.locator("[data-testid=logout]").count(), 0);
            await page.evaluate(() => {
                window.testProton.info = {authenticated:false,managed:true,connected:true,
                    connection:{name:"Test tunnel",enabled:true,status:1,matches_configuration:true}};
            });
            const statusColor = () => page.locator("[data-testid=connection-status]")
                .evaluate(el => getComputedStyle(el).color);
            assert.equal(await statusColor(), "rgb(21, 128, 61)", "Connected status must be green.");
            await page.evaluate(() => { window.testProton.info.connection.matches_configuration = false; });
            assert.notEqual(await statusColor(), "rgb(21, 128, 61)",
                "A previous profile's connected state must not remain green during handoff.");
            assert.match(await page.locator("[data-testid=connection-status]").textContent(), /Connecting:/);
            await page.evaluate(() => { window.testProton.info.connection.matches_configuration = true; });
            assert.equal(await statusColor(), "rgb(21, 128, 61)");
            await page.evaluate(() => { window.testProton.info.connected = false; });
            assert.notEqual(await statusColor(), "rgb(21, 128, 61)", "Connecting status must not be green.");
            await page.evaluate(() => { window.testProton.info.connection.enabled = false; });
            assert.notEqual(await statusColor(), "rgb(21, 128, 61)", "Disconnected status must not be green.");
            await page.evaluate(() => {
                window.testProton.info = {authenticated:false,managed:false,connected:false,
                    connection:{name:"Original VPN",enabled:true,status:1,matches_configuration:true}};
            });
            assert.equal(await statusColor(), "rgb(21, 128, 61)",
                "A connected original native VPN must also be green.");
            await page.evaluate(() => { window.testProton.info.connection.matches_configuration = false; });
            assert.notEqual(await statusColor(), "rgb(21, 128, 61)",
                "An unmanaged previous profile must not remain green during handoff.");
            await page.evaluate(() => window.testProton.$destroy());
            console.log(`PASS: native card, inherited typography and loaded decorative icons; compact native Vue layout, connected-only green status, taller node list, title/sign-out row, country/city row, action-button row, footer timestamp, Advanced, mobile fit and login-only HTTP warning; USA first and ${nodes} nodes in ${city} sorted by load. Only read-only SSH-bridged RPCs; real account and VPN untouched.`);
        } finally { await browser.close(); }
        return;
    }

    if (process.argv[2] === "open") {
        assert(process.argv[3], "Supply an isolated browser profile directory.");
        const context = await chromium.launchPersistentContext(process.argv[3], {
            channel: "chrome", headless: false,
            args: ["--remote-debugging-port=9337", "--remote-debugging-address=127.0.0.1",
                "--disable-save-password-bubble"]
        });
        const keepDialog = page => page.on("dialog", () => {});
        context.on("page", keepDialog);
        context.pages().forEach(keepDialog);
        await context.pages()[0].goto(url);
        console.log("Sign in to the router in this isolated browser, then run npm run test:ui.");
        await new Promise(resolve => context.on("close", resolve));
        return;
    }

    const browser = await chromium.connectOverCDP("http://127.0.0.1:9337");
    const context = browser.contexts()[0];
    const page = await context.newPage();
    try {
        await page.goto(url);
        await page.locator("[data-testid=country] option").nth(1).waitFor({state:"attached",timeout:150000});
        assert(await page.locator("[data-testid=logout]").isVisible());
        assert(await page.getByText("Proton VPN", {exact:true}).count() >= 2, "Native menu entry missing");
        const countries = await page.locator("[data-testid=country] option").count() - 1;
        assert.equal(await page.locator("[data-testid=server] option").count(), 0);
        assert.equal(await page.locator("[data-testid=city] option").count(), 1);
        await page.locator("[data-testid=country]").selectOption("CA");
        await page.locator("[data-testid=city] option").nth(1).waitFor({state:"attached"});
        const city = await page.locator("[data-testid=city] option").nth(1).evaluate(option => option.value);
        const canada = page.waitForResponse(response => {
            if (!response.url().endsWith("/rpc")) return false;
            const request = response.request().postDataJSON();
            return request.params && request.params[1] === "proton-vpn"
                && request.params[2] === "servers" && request.params[3].country === "CA"
                && request.params[3].city === city;
        }, {timeout:150000});
        await page.locator("[data-testid=city]").selectOption(city);
        const canadian = (await (await canada).json()).result.servers;
        assert(canadian.length > 0);
        assert(canadian.every(s => s.city === city));
        await page.waitForFunction(count =>
            document.querySelectorAll("[data-testid=server] option").length === count,
        canadian.length);
        const name = await page.locator("[data-testid=server] option").first().evaluate(option => option.value);
        await page.locator("[data-testid=search]").fill(name);
        assert(await page.locator("[data-testid=server] option").count() >= 1);
        assert.equal(await page.locator("[data-testid=error]").count(), 0);
        assert(await page.locator("[data-testid=catalog-age]").isVisible());
        console.log(`PASS: native menu, saved login, status, ${countries} countries, city selection, ${canadian.length} nodes in ${city}, cache age and search.`);
    } finally { await page.close(); }

    const mock = await context.newPage();
    let authenticated = false, logins = 0, logouts = 0;
    await mock.route("**/rpc", async route => {
        const request = route.request().postDataJSON();
        if (!request.params || request.params[1] !== "proton-vpn") return route.continue();
        const method = request.params[2], params = request.params[3];
        let result;
        if (method === "status") {
            result = {authenticated,connected:false,managed:false,restore_available:false};
        } else if (method === "countries") {
            result = {countries:[{country:"US",servers:1}]};
        } else if (method === "servers") {
            result = {servers:[{name:"US#TEST",country:"US",city:"Test",load:1,tier:0}]};
        } else if (method === "cities") {
            result = {cities:[{city:"Test",servers:1}]};
        } else if (method === "login") {
            logins++;
            assert.equal(params.username, "test-user");
            assert.equal(params.password, "test-password!$");
            assert.equal(params.totp, "123456");
            result = {err_code:1,err_msg:"Test login refusal"};
        } else if (method === "logout") {
            logouts++;
            authenticated = false;
            result = {authenticated:false};
        } else {
            throw new Error("Read-only browser test attempted an unexpected operation.");
        }
        await route.fulfill({contentType:"application/json",
            body:JSON.stringify({jsonrpc:"2.0",id:request.id,result})});
    });
    try {
        await mock.goto(url);
        await mock.locator("[data-testid=username]").fill("test-user");
        await mock.locator("[data-testid=password]").fill("test-password!$");
        await mock.locator("[data-testid=totp]").fill("123456");
        await mock.locator("[data-testid=login]").click();
        await mock.locator("[data-testid=error]").waitFor({state:"visible"});
        assert.equal(logins, 1);
        for (const field of ["username", "password", "totp"]) {
            assert.equal(await mock.locator(`[data-testid=${field}]`).inputValue(), "");
        }
        authenticated = true;
        await mock.reload();
        await mock.locator("[data-testid=country] option").nth(1).waitFor({state:"attached"});
        await mock.evaluate(() => { window.confirm = () => true; });
        await mock.locator("[data-testid=logout]").click();
        await mock.locator("[data-testid=username]").waitFor({state:"visible"});
        assert.equal(logouts, 1);
        console.log("PASS: mocked login/TOTP, immediate credential clearing, error display and logout; real session untouched.");
    } finally { await mock.close(); }
    process.exit(0);
})().catch(error => { console.error(error.message); process.exit(1); });
