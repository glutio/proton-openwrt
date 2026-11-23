const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const url = "http://192.168.8.1/#/proton-vpn";

const menu = async (page, id) => {
    await page.locator("[data-testid=settings]").hover();
    await page.locator(`[data-testid=${id}]`).waitFor({state:"visible"});
    return page.locator(`[data-testid=${id}]`);
};

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
            await page.waitForFunction(() => window.testProton.countries.length > 0 && !window.testProton.busy);
            const appearance = await page.evaluate(async () => {
                await document.fonts.ready;
                const root = document.querySelector("#proton-vpn-view");
                return {
                    nativeCard:getComputedStyle(root.querySelector(".client-body")).backgroundColor
                        === getComputedStyle(root.querySelector(".provider-logo")).backgroundColor,
                    font:getComputedStyle(root).fontFamily,
                    nativeFont:getComputedStyle(document.body).fontFamily,
                    icons:Array.from(root.querySelectorAll(".iconfont"), icon => {
                        const font = getComputedStyle(icon).fontFamily;
                        return {
                            glyph:getComputedStyle(icon, "::before").content,
                            nativeFont:/iconfont|element-icons/.test(font) && document.fonts.check("14px " + font)
                        };
                    })
                };
            });
            assert(appearance.nativeCard, "The page card must use the native theme's card colour.");
            assert.equal(appearance.font, appearance.nativeFont, "Inherit the router's existing font.");
            assert(appearance.icons.length > 0 && appearance.icons.every(icon =>
                icon.nativeFont && !["none","normal",'""'].includes(icon.glyph)),
                "Icons must resolve to loaded native font glyphs.");
            assert.match(await (await menu(page, "logout")).textContent(), /Sign out/,
                "Sign out must be available from the settings menu.");
            await page.locator("[data-testid=select-servers]").click();
            await page.locator("[data-testid=country]").first().waitFor({state:"visible"});
            const countryOptions = await page.locator("[data-testid=country]").evaluateAll(options =>
                options.map(option =>
                    ({code:option.dataset.country,name:option.textContent.trim().replace(/ \(\d+\)$/, "")})));
            assert.equal(countryOptions[0].code, "US", "USA must be the first country.");
            const remaining = countryOptions.slice(1).map(c => c.name);
            assert.deepEqual(remaining, remaining.slice().sort((a, b) => a.localeCompare(b, "en")),
                "Remaining countries must sort by displayed name, not code.");
            assert.equal(await page.locator("#proton-vpn-view .proton-warning").count(), 0);
            assert.equal(await page.getByText("Uses GL.iNet's existing WireGuard dashboard, routing, DNS and kill switch.", {exact:true}).count(), 0);
            assert.equal(await page.getByText("Signed in using the session already stored on this router.", {exact:true}).count(), 0);
            assert.equal(await page.locator("[data-testid=server]").count(), 0);
            await page.locator("[data-testid=country][data-country=CA]").click();
            await page.locator("[data-testid=city]").first().waitFor({state:"visible"});
            const city = await page.locator("[data-testid=city]").first().evaluate(option => option.dataset.city);
            await page.locator("[data-testid=city]").first().click();
            await page.locator("[data-testid=drawer-apply]").click();
            await page.locator("[data-testid=server]").first().waitFor({state:"attached"});
            const listed = await page.evaluate(() => window.testProton.servers.map(s =>
                ({name:s.name,city:s.city,features:s.features & 31 ? window.testProton.nodeFeatures(s) : ""})));
            assert(listed.length > 0 && listed.every(s => s.city === city));
            const nodes = await page.locator("[data-testid=server]").count();
            assert.equal(nodes, listed.length, "Every server of the city is listed.");
            const loads = await page.locator("[data-testid=server]").evaluateAll(options =>
                options.map(option => Number(option.dataset.load)));
            assert(loads.every((load, index) => index === 0 || loads[index - 1] <= load),
                "Rendered servers must be ordered from lowest to highest load.");
            const rendered = await page.locator("[data-testid=server]").evaluateAll(options =>
                options.map(option => ({name:option.dataset.name,text:option.textContent})));
            for (const row of rendered) {
                assert(row.text.includes(listed.find(s => s.name === row.name).features));
            }
            const actionBoxes = await Promise.all(["connect","disconnect","restore"].map(id =>
                page.locator(`[data-testid=${id}]`).boundingBox()));
            assert(actionBoxes.every(box => Math.abs(box.y - actionBoxes[0].y) < 2),
                "Connection buttons must share one row on desktop.");
            assert(!/seconds|cached/.test(await page.locator("[data-testid=catalog-age]").textContent()),
                "Catalogue metadata must use a static timestamp, not a ticking age.");
            assert.equal(await page.locator("[data-testid=tunnel]").count(), 0);
            await (await menu(page, "advanced")).click();
            assert(await page.locator("[data-testid=tunnel]").isVisible());
            await (await menu(page, "advanced")).click();
            assert.equal(await page.locator("[data-testid=tunnel]").count(), 0);
            if (process.argv[4]) await page.screenshot({path:process.argv[4],fullPage:true});
            const name = await page.locator("[data-testid=server]").first().evaluate(option => option.dataset.name);
            await page.locator("[data-testid=server]").first().click();
            assert.equal(await page.evaluate(() => window.testProton.server), name, "Clicking a row selects it.");
            assert(await page.locator("[data-testid=connect]").isEnabled());
            await page.locator("[data-testid=search]").fill(name);
            assert(await page.locator("[data-testid=server]").count() >= 1);
            await page.locator("[data-testid=search]").fill("");
            assert(await page.locator("[data-testid=catalog-age]").isVisible());
            assert.equal(await page.locator("[data-testid=error]").count(), 0);
            await page.locator("[data-testid=select-servers]").click();
            await page.locator("[data-testid=country][data-country=US]").click();
            await page.locator("[data-testid=city]").first().waitFor({state:"visible"});
            await page.locator("[data-testid=city]").first().click();
            await page.locator("[data-testid=all-countries]").click();
            await page.locator("[data-testid=country]").first().waitFor({state:"visible"});
            await page.locator("[data-testid=drawer-cancel]").click();
            assert.equal(await page.locator("[data-testid=server]").count(), nodes,
                "Cancelling the drawer must keep the listed servers.");
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
            const isGreen = () => page.locator("[data-testid=connection-status]")
                .evaluate(el => el.classList.contains("proton-connected"));
            assert(await isGreen(), "Connected status must be green.");
            await page.evaluate(() => { window.testProton.info.connection.matches_configuration = false; });
            assert(!(await isGreen()),
                "A previous profile's connected state must not remain green during handoff.");
            assert.match(await page.locator("[data-testid=connection-status]").textContent(), /Connecting:/);
            await page.evaluate(() => { window.testProton.info.connection.matches_configuration = true; });
            assert(await isGreen());
            await page.evaluate(() => { window.testProton.info.connected = false; });
            assert(!(await isGreen()), "Connecting status must not be green.");
            await page.evaluate(() => { window.testProton.info.connection.enabled = false; });
            assert(!(await isGreen()), "Disconnected status must not be green.");
            await page.evaluate(() => {
                window.testProton.info = {authenticated:false,managed:false,connected:false,
                    connection:{name:"Original VPN",enabled:true,status:1,matches_configuration:true}};
            });
            assert(await isGreen(),
                "A connected original native VPN must also be green.");
            await page.evaluate(() => { window.testProton.info.connection.matches_configuration = false; });
            assert(!(await isGreen()),
                "An unmanaged previous profile must not remain green during handoff.");
            await page.evaluate(() => window.testProton.$destroy());
            console.log(`PASS: native card, inherited typography and loaded icons; native provider layout, connected-only green status, server drawer, settings menu, action-button row, header timestamp, Advanced, mobile fit and login-only HTTP warning; USA first and ${nodes} nodes in ${city} sorted by load. Only read-only SSH-bridged RPCs; real account and VPN untouched.`);
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
        await page.locator("[data-testid=select-servers]").waitFor({state:"visible",timeout:150000});
        await menu(page, "logout");
        assert(await page.getByText("Proton VPN", {exact:true}).count() >= 2, "Native menu entry missing");
        assert.equal(await page.locator("[data-testid=server]").count(), 0);
        await page.locator("[data-testid=select-servers]").click();
        await page.locator("[data-testid=country]").first().waitFor({state:"visible",timeout:150000});
        const countries = await page.locator("[data-testid=country]").count();
        assert.equal(await page.locator("[data-testid=city]").count(), 0);
        await page.locator("[data-testid=country][data-country=CA]").click();
        await page.locator("[data-testid=city]").first().waitFor({state:"visible"});
        const city = await page.locator("[data-testid=city]").first().evaluate(option => option.dataset.city);
        const canada = page.waitForResponse(response => {
            if (!response.url().endsWith("/rpc")) return false;
            const request = response.request().postDataJSON();
            return request.params && request.params[1] === "proton-vpn"
                && request.params[2] === "servers" && request.params[3].country === "CA"
                && request.params[3].city === city;
        }, {timeout:150000});
        await page.locator("[data-testid=city]").first().click();
        await page.locator("[data-testid=drawer-apply]").click();
        const canadian = (await (await canada).json()).result.servers;
        assert(canadian.length > 0);
        assert(canadian.every(s => s.city === city));
        await page.waitForFunction(count =>
            document.querySelectorAll("[data-testid=server]").length === count,
        canadian.length);
        const name = await page.locator("[data-testid=server]").first().evaluate(option => option.dataset.name);
        await page.locator("[data-testid=search]").fill(name);
        assert(await page.locator("[data-testid=server]").count() >= 1);
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
            result = {servers:[{name:"US#TEST",city:"Test",load:1,tier:0},{name:"US#BUSY",city:"Test",load:90,tier:0}]};
        } else if (method === "cities") {
            result = {cities:[{city:"Test",servers:2}]};
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
        await mock.locator("[data-testid=select-servers]").waitFor({state:"visible"});
        await mock.evaluate(() => { window.confirm = () => true; });
        assert.equal(await mock.locator("[data-testid=server]").count(), 0);
        await mock.locator("[data-testid=select-servers]").click();
        await mock.locator("[data-testid=country][data-country=US]").click();
        await mock.locator("[data-testid=city]").first().click();
        await mock.locator("[data-testid=drawer-apply]").click();
        await mock.locator("[data-testid=server][data-name='US#BUSY']").waitFor({state:"attached"});
        assert.equal(await mock.locator("[data-testid=server]").count(), 2);
        assert.match(await mock.locator("[data-testid=location]").textContent(), /2 servers/);
        await mock.locator("[data-testid=search]").fill("busy");
        assert.equal(await mock.locator("[data-testid=server]").count(), 1);
        await mock.locator("[data-testid=search]").fill("");
        await (await menu(mock, "logout")).click();
        await mock.locator("[data-testid=username]").waitFor({state:"visible"});
        assert.equal(logouts, 1);
        console.log("PASS: mocked login/TOTP, immediate credential clearing, error display, server listing, search and logout; real session untouched.");
    } finally { await mock.close(); }
    process.exit(0);
})().catch(error => { console.error(error.message); process.exit(1); });
