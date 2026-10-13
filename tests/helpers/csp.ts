import { expect, type Page } from "@playwright/test";
export async function assertParserCsp(page: Page) {
  for (const control of [false, true]) {
    const path = control ? "/security-csp-control" : "/security-csp-probe";
    await page.route("**" + path, async (route) => {
      const response = await route.fetch(),
        headers = { ...response.headers() };
      if (control) delete headers["content-security-policy"];
      await route.fulfill({
        response,
        headers,
        body: '<!doctype html><html><head><script>window.__parserScript=true</script></head><body><img alt="synthetic CSP probe" src="data:image/png;base64,bm90LWFuLWltYWdl" onerror="window.__parserHandler=true"></body></html>',
      });
    });
    await page.goto(path);
    const flags = await page.evaluate(() => ({
      script: !!(window as any).__parserScript,
      handler: !!(window as any).__parserHandler,
    }));
    expect(flags).toEqual({ script: control, handler: control });
  }
}
