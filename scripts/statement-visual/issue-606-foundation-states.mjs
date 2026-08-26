import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  renderAlert,
  renderBadge,
  renderButton,
  renderEmptyState,
  renderFilterBar,
  renderFormLayout,
  renderLoading,
  renderMetricCard,
  renderPageContainer,
  renderPageHeader,
  renderPermissionState,
  renderRecoverableError,
  renderSummaryGrid,
  renderTabs,
  renderToast,
  renderUnavailableState,
} from "../../apps/web/dist/design-system/primitives.js";
import { createSolverFinDesignSystemCss } from "../../apps/web/dist/design-system/styles.js";
import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
if (!chromePath) throw new Error("CHROME_BIN is required for issue 606 foundation-state validation.");

await mkdir(outputDir, { recursive: true });
const html = fixtureHtml();
const browser = await launchChrome({ baseUrl, chromePath });
const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  desktop: null,
  mobile: null,
  keyboard: null,
  screenshots: [],
};

try {
  await navigate(browser.cdp, "about:blank");
  await evaluate(
    browser.cdp,
    `(() => { document.open(); document.write(${JSON.stringify(html)}); document.close(); })()`,
  );

  await setViewport(browser.cdp, 1366, 768);
  await sleep(100);
  report.desktop = await inspectFoundation(browser.cdp);
  assertFoundation(report.desktop, 1366);
  await screenshot(browser.cdp, join(outputDir, "issue-606-foundation-states-desktop.png"));
  report.screenshots.push("issue-606-foundation-states-desktop.png");

  report.keyboard = await verifyKeyboardFocus(browser.cdp);
  assert.equal(report.keyboard.focusedId, "issue-606-retry");
  assert.equal(report.keyboard.focusVisible, true);

  await setViewport(browser.cdp, 390, 844);
  await sleep(100);
  report.mobile = await inspectFoundation(browser.cdp);
  assertFoundation(report.mobile, 390);
  assert.equal(report.mobile.summarySingleColumn, true);
  assert.equal(report.mobile.formSingleColumn, true);
  await screenshot(browser.cdp, join(outputDir, "issue-606-foundation-states-mobile.png"));
  report.screenshots.push("issue-606-foundation-states-mobile.png");

  await writeFile(
    join(outputDir, "issue-606-foundation-states.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log("Issue 606 foundation states desktop, mobile and keyboard validation passed.");
} finally {
  await browser.close(outputDir);
}

function assertFoundation(value, width) {
  assert.equal(value.viewportWidth, width);
  assert.equal(value.documentFits, true, `Foundation states overflow at ${width}px`);
  assert.deepEqual(value.states.sort(), ["empty", "error", "loading", "permission", "unavailable"]);
  assert.equal(value.loadingBusy, "true");
  assert.equal(value.errorRole, "alert");
  assert.equal(value.tabsLabel, "Secoes da validacao");
  assert.equal(value.activeTab, "Resumo");
  assert.equal(value.hasBadge, true);
  assert.equal(value.hasAlert, true);
  assert.equal(value.hasToast, true);
  assert.ok(value.minimumInteractiveHeight >= 44, `Interactive target below 44px at ${width}px`);
}

async function inspectFoundation(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const states = Array.from(document.querySelectorAll('.sf-state-panel')).map((node) => node.dataset.state).filter(Boolean);
      const interactive = Array.from(document.querySelectorAll('button'));
      const heights = interactive.map((node) => node.getBoundingClientRect().height).filter((height) => height > 0);
      const summary = document.querySelector('.sf-summary-grid');
      const form = document.querySelector('.sf-form-layout');
      const columnCount = (element) => {
        if (!element) return 0;
        const columns = getComputedStyle(element).gridTemplateColumns.trim();
        return columns ? columns.split(/\\КЛКK›[™Э€В€NВ€™]\›€В€љY]ЬЬќЪY€ШЭ[Y[ќ™ШЭ[Y[ќ[[Y[ќЫY[ќЪY€ШЭ[Y[ќљ]О€ШЭ[Y[ќ™ШЭ[Y[ќ[[Y[ќњШЬ›ЫЪYHШЭ[Y[ќ™ШЭ[Y[ќ[[Y[ќЫY[ќЪY
ИK€Э]\Л€ШY[™Рќ\ЮN€ШЭ[Y[ќњ]Y\ћTЩ[XЭЬЉ	ЦЩ]K\Э]OH›ШY[™И—IКOЛ™Щ]]љXќ]J	Ш\љXKXќ\ЮIКHПИќ[€\њ›Ь”›ЫN€ШЭ[Y[ќњ]Y\ћTЩ[XЭЬЉ	ЦЩ]K\Э]OH™\њ›Ь€—IКOЛ™Щ]]љXќ]J	Ь›ЫIКHПИќ[€XњУX™[€ШЭ[Y[ќњ]Y\ћTЩ[XЭЬЉ	ЛњЩ‹]XњЙКOЛ™Щ]]љXќ]J	Ш\љXK[X™[	КHПИќ[€XЭ]™UXЋ€ШЭ[Y[ќњ]Y\ћTЩ[XЭЬЉ	ЛњЩ‹]X–Ш\љXKXЭ\њ™[ќHњYЩH—IКOЛќ^ЫЫќ[ќЛќљ[J
HПИќ[€\РYЩN€›ЫЫX[ЉШЭ[Y[ќњ]Y\ћTЩ[XЭЬЉ	ЛњЩ‹XYЩIКJK€\Р[\ќ€›ЫЫX[ЉШЭ[Y[ќњ]Y\ћTЩ[XЭЬЉ	ЛњЩ‹X[\ќ	КJK€\ХШ\Э€›ЫЫX[ЉШЭ[Y[ќњ]Y\ћTЩ[XЭЬЉ	ЛњЩ‹]Ш\Э	КJK€Z[љ[][R[ќ\XЭ]™RZYЪ€ZYЪЛ›[™ЭИX]›Z[Љ‹‹љZYЪКH€€Э[[X\ћTЪ[™ЫPЫЫ[[Ћ€ЫЫ[[ђЫЭ[ќ
Э[[X\ћJHOOHK€›Ь›TЪ[™ЫPЫЫ[[Ћ€ЫЫ[[ђЫЭ[ќ
›Ь›JHHK€NВ€JJ
X€
NВџB‚\Ю[Иќ[Э[Ы€™\љYћRЩ^X›Ш\™›ШЭ\КЩ
HВ€]ШZ]][X]J€Щ€


HO€В€ЫЫњЭ\™Щ]HШЭ[Y[ќ™Щ][[Y[ќћRY
	Ъ\ЬЭYKMЊ‹\™]ћIКNВ€ЫЫњЭЩ[ќ[™[HШЭ[Y[ќЬ™X]Q[[Y[ќ
	Шќ]Ы‰КNВ€Щ[ќ[™[ќ\HH	Шќ]Ы‰ОВ€Щ[ќ[™[љYH	Ъ\ЬЭYKMЊ‹\Щ[ќ[™[	ОВ€Щ[ќ[™[њЩ]]љXќ]J	Ш\љXK[X™[	Л	ФЩ[ќ[™[HH›ШЫЙКNВ€Щ[ќ[™[њЭ[KЬЬХ^H	ЬЬЪ][ЫЋ™љ^YЫYќЊЭЬЊЭЪYЊ\ЪZYЪЊ\ЫЬXЪ]NЊЬY[™ОЊШ›Ь™\ЋЊ	ОВ€\™Щ]™Y›Ь™JЩ[ќ[™[
NВ€Щ[ќ[™[™›ШЭ\К
NВ€™]\›€ќYNВ€JJ
X€
NВ€]ШZ]™\ЬХXЉЩ
NВ€ЫЫњЭ™\Э[H]ШZ]][X]J€Щ€


HO€В€ЫЫњЭXЭ]™HHШЭ[Y[ќXЭ]™Q[[Y[ќВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	Ъ\ЬЭYKMЊ‹\Щ[ќ[™[	КOЛњ™[[Э™J
NВ€™]\›€В€›ШЭ\ЩYY€XЭ]™OЛљYПИ	ЙЛ€›ШЭ\Хљ\ЪX›N€XЭ]™H[њЭ[Щ[Щ€S[[Y[ќ	‰€XЭ]™K›X]Ъ\К	О™›ШЭ\Л]љ\ЪX›IКK€NВ€JJ
X€
NВ€™]\›€™\Э[ВџB‚\Ю[Иќ[Э[Ы€™\ЬХXЉЩ
HВ€ЫЫњЭ]™[ќHВ€Щ^N€•X€‹€ЫЩN€•X€‹€Ъ[™ЭЬХљ\ќX[Щ^PЫЩN€K€]]™Uљ\ќX[Щ^PЫЩN€K€NВ€]ШZ]ЩњЩ[™
’[њ]™\Ь]ЪЩ^Q]™[ќ‹И\N€њ]ТЩ^QЭЫ€‹‹‹™]™[ќJNВ€]ШZ]ЩњЩ[™
’[њ]™\Ь]ЪЩ^Q]™[ќ‹И\N€љЩ^U\‹‹‹™]™[ќJNВ€]ШZ]ЫY\

NВџB‚™ќ[Э[Ы€љ^\™R[

HВ€ЫЫњЭ™]ћHH™[™\ђќ]ЫЉИX™[€•[ќ\€›Э[Y[ќH‹\љX[ќ€њЩXЫЫ™\ћH€JKњ™\XЩJ€Џќ]Ы€‹€	Пќ]Ы€YHљ\ЬЭYKMЊ‹\™]ћH€	Л€
NВ€ЫЫњЭЭ]T[™[ИHВ€™[™\“ШY[™КИ]N€ђШ\њ™YШ[™ИYЬИ‹\ШЬљ\[ЫЋ€“X[ќ[™ИИЫЫќ^ИH[K€€JK€™[™\‘[\TЭ]JИ]N€“™[љ[H][H™\ЭH™XЫЬќH‹\ШЬљ\[ЫЋ€ђZќ\ЭHЬИљ[›ЬИ\H™]љ\Ш\€Э]›И\љ[ЩЛ€€JK€™[™\”™XЫЭ™\X›Q\њ›ЬЉИ]N€“[И›ЪHЬЬЪ]™[]X[^\€‹\ШЬљ\[ЫЋ€•[ќH›Э[Y[ќHЩ[H\™\€ЬИљ[›ЬЛ€‹XЭ[Ы’[€™]ћHJK€™[™\•[]Z[X›TЭ]JИ]N€‘YЬИ[\Ь\љX[Y[ќH[™\ЬЫљ]™Z\И‹\ШЬљ\[ЫЋ€ђ\И[XZ\И[™›Ь›XXЫЩ\ИЫЫќ[ќX[HXЩ\ЬЪ]™Z\Л€€JK€™[™\”\›Z\ЬЪ[Ы”Э]JИ]N€ђXЩ\ЬЫИ[И\›Z]YИ‹\ШЬљ\[ЫЋ€‘\ШЫЫH[HЫЫќ^Иљ[[ЩZ\›И[И]X[›ШЩH[љHXЩ\ЬЫЛ€€JK€Kљ›Ъ[Љ€ЉNВ‚€ЫЫњЭЭ[[X\ћHH™[™\”Э[[X\ћQЬљY
В€Ъ[™[’[‚€™[™\“Y]љXРШ\™
ИX™[€’][њИ™]љ\ШYЬИ‹[YN€ЊL€‹]Z[€‘^[\ИљXЭXЪ[И€JH
В€™[™\“Y]љXРШ\™
ИX™[€”[™[ЪX\И‹[YN€ЊИ‹Ы™N€][ќ[Ы€€JK€JNВ€ЫЫњЭљ[\€H™[™\‘љ[\ђ\ЉВ€X™[€‘љ[›ЬИH[YXШ[И‹€Ъ[™[’[€™[™\ђќ]ЫЉИX™[€ђ\XШ\€љ[›И‹\љX[ќ€њЩXЫЫ™\ћH€JK€JNВ€ЫЫњЭXњИH™[™\•XњКВ€X™[€”ЩXЫЩ\ИH[YXШ[И‹€][\О€В€ИX™[€”™\Э[[И‹™YЋ€€Ь™\Э[[И‹XЭ]™N€ќYHK€ИX™[€‘][\И‹™YЋ€€Щ][\И€K€K€JNВ€ЫЫњЭ›Ь›HH™[™\‘›Ь›S^[Э]
В€љY[Т[€	ПX™[‘\ШЬљXШ[П[њ]Ы\ЬПHњЩ‹Z[њ]Щ‹Y›ШЭ\Л\љ[™И€[YOH‘^[\ИљXЭXЪ[И€ПЏЫX™[‰Л€XЭ[ЫњТ[€™[™\ђќ]ЫЉИX™[€”Ш[\€^[\И€JK€\њ›Ь’[€™[™\ђ[\ќ
ИЫ™N€›™YШ]]™H‹]N€”™]љ\ЩHИШ[\И\ЭXШYИ€JK€JNВ€ЫЫњЭЫЫќ[ќH™[™\”YЩPЫЫќZ[™\ЉВ€Ъ[™[’[‚€™[™\”YЩRXY\ЉИ]N€‘\ЭYЬИЬ\XЪ[ЫZ\ИHќ[™XШ[И‹\ШЬљ\[ЫЋ€•[YXШ[И[H]™YШYЬ€™X[H\ЭYЬЛ^[Э]H›ШЫЛ€€JH
В€XњИ
В€љ[\€
В€Э[[X\ћH
В€™[™\ђYЩJИX™[€‘[H™]љ\Ш[И‹Ы™N€][ќ[Ы€€JH
В€™[™\ђ[\ќ
ИЫ™N€љ[™›Ь›X][Ы€‹]N€ђЫЫќ^И™\Щ\ќYИ‹\ШЬљ\[ЫЋ€“ЬИ\ЭYЬИXZ^И\Ш[HHY\ЫXHќ[™XШ[Иљ\ЭX[€€JH
В€Э]T[™[И
В€›Ь›H
В€™[™\•Ш\Э
И]N€‘^[\ИШ[›И‹\ШЬљ\[ЫЋ€‘™YYXЪИљXЭXЪ[ИHЭXЩ\ЬЫЛ€‹Ы™N€њЬЪ]]™H€JK€JNВ‚€™]\›€YШЭ\H[Џ[[™ПHњP”€ЏЏXYЏY]HЪ\њЩ]Hќ]‹NЏЏY]H[YOHќљY]ЬЬќ€ЫЫќ[ќHќЪYY]љXЩK]ЪY[љ]X[\ШШ[OLHЏЏЭ[OЉћШ›Ю\Ъ^љ[™О›Ь™\‹X›ЮX›Щ^ЫX\™Ъ[ЋЊIШЬ™X]TЫЫ™\‘љ[‘\ЪYЫ”Ю\Э[PЬЬК
_OЬЭ[OЏЪXYЏ›ЩHЫ\ЬПHњЩ‹X\\Э\™XЩHЏ‰ШЫЫќ[ќOШ›ЩOЏЪ[ВџB