import { expect, type Page } from "@playwright/test";
import { hindiMessages } from "../../apps/web/app/hindi-messages";
export async function chooseHindi(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("bcs.interface-language", "hi"),
  );
}
export async function checkHindi(page: Page, heading?: string) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  if (heading)
    await expect(
      page.getByRole("heading", { name: heading, exact: true }).first(),
    ).toBeVisible();
  const english = Object.entries(hindiMessages)
    .filter(
      ([key, value]) =>
        key !== value && /^[A-Za-z]/.test(key) && !/[\u0900-\u097f]/.test(key),
    )
    .map(([key]) => key.trim().replace(/\s+/g, " "));
  const untranslated = await page.evaluate((keys) => {
    const known = new Set(keys);
    return [
      ...document.querySelectorAll(
        "button,label,legend,option,input[placeholder],textarea[placeholder]",
      ),
    ].flatMap((element) => {
      if (
        !(element instanceof HTMLElement) ||
        !(element instanceof HTMLOptionElement
          ? element.closest("select")?.checkVisibility()
          : element.checkVisibility())
      )
        return [];
      if (
        element instanceof HTMLOptionElement &&
        ["en", "hi"].includes(element.value)
      )
        return [];
      const text = (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
          ? element.placeholder
          : element.textContent || ""
      )
        .trim()
        .replace(/\s+/g, " ");
      return known.has(text) ? [text] : [];
    });
  }, english);
  expect(untranslated, "untranslated interface controls").toEqual([]);
  const overflow = await page.evaluate(() => {
    if (document.documentElement.scrollWidth <= innerWidth) return [];
    return [...document.querySelectorAll("body *")]
      .filter(
        (element) =>
          element instanceof HTMLElement &&
          element.checkVisibility() &&
          element.getBoundingClientRect().right > innerWidth + 1,
      )
      .slice(0, 12)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        text: element.textContent?.slice(0, 90),
        right: Math.round(element.getBoundingClientRect().right),
      }));
  });
  expect(overflow, "Hindi content must fit the viewport").toEqual([]);
}
