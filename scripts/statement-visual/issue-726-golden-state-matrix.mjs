import { evaluate, sleep } from "./cdp.mjs";

// A-008: force actual Chrome pseudo-states and measure computed styles, rather than
// accepting a neutral rest token as evidence for hover, press or keyboard focus.
const CONTROLS = [
  ["row", ".inbox-review-queue [data-review-select]", true],
  ["navigation", ".inbox-review-nav", false],
  ["new-entry", ".inbox-new-entry-trigger", false],
  ["refresh", "[data-review-refresh]", true],
  ["filter", '[data-review-filter="kind"]', true],
  ["dialog-select", '#ai-review-dialog [data-review-edit-form] select', true],
  ["dialog-close", "#ai-review-dialog .dialog-actions button", true],
];

export async function validateGoldenStateMatrix(cdp) {
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const samples = [];
  let unselectedOption;
  let negative;
  let dialogOpened = false;
  const { root } = await cdp.send("DOM.getDocument");

  async function measure(label, selector, state) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    if (!nodeId) return { label, state, selector, missing: true, pass: false };
    const pseudo = state === "rest" || state === "disabled" ? [] :
      state === "focus-visible" ? ["focus", "focus-visible"] :
      state === "active" ? ["hover", "active"] : ["hover"];
    if (state === "disabled") await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)}).disabled = true`);
    await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: pseudo });
    try {
      await sleep(230);
      return await evaluate(cdp, `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        const css = getComputedStyle(element);
        const root = getComputedStyle(document.documentElement);
        const token = (name) => root.getPropertyValue('--sf-color-' + name).trim();
        const rgb = (value) => {
          const v = String(value).trim();
          if (/^#[0-9a-f]{6}$/i.test(v)) return [1,3,5].map((i) => parseInt(v.slice(i, i+2), 16));
          if (/^#[0-9a-f]{3}$/i.test(v)) return [1,2,3].map((i) => parseInt(v[i]+v[i], 16));
          return (v.match(/[0-9]+/g) || []).slice(0, 3).map(Number);
        };
        const same = (a,b) => { const x=rgb(a),y=rgb(b); return x.length===3 && y.length===3 && x.every((n,i)=>n===y[i]); };
        const lum = (value) => { const c=rgb(value).map((n)=>{ const v=n/255; return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4; }); return c.length===3 ? 0.2126*c[0]+0.7152*c[1]+0.0722*c[2] : 0; };
        const a=lum(css.color),b=lum(css.backgroundColor);
        const contrast=Number(((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)).toFixed(2));
        const state=${JSON.stringify(state)};
        const background=css.backgroundColor,color=css.color,border=css.borderTopColor;
        const rest=same(background,token('surface')) && same(color,token('primary')) &&
          [token('border'),token('line')].some((value)=>same(border,value));
        const hover=same(background,token('neutral-control-hover')) && same(color,token('neutral-control-text-hover')) &&
          same(border,token('neutral-control-border-hover'));
        const pressed=same(background,token('neutral-control-active-hover')) && same(color,token('neutral-control-text-hover')) &&
          same(border,token('neutral-control-border-hover'));
        const disabled=same(background,token('neutral-control-hover')) && same(color,token('muted-text')) &&
          same(border,token('border')) && css.cursor==='not-allowed' && Number(css.opacity)===1;
        const ring=css.boxShadow!=='none' || (css.outlineStyle!=='none' && css.outlineWidth!=='0px');
        const pass=contrast>=4.5 && (state==='rest' ? rest : state==='hover' ? hover :
          state==='active' ? pressed : state==='focus-visible' ? hover && ring : disabled);
        return {label:${JSON.stringify(label)},selector:${JSON.stringify(selector)},state,
          background,color,border,contrast,ring,rest,hover,pressed,disabled,
          pass};
      })()`);
    } finally {
      await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
      if (state === "disabled") await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)}).disabled = false`);
    }
  }

  try {
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
    for (const [label, selector, canDisable] of CONTROLS.slice(0, 5)) {
      for (const state of ["rest", "hover", "active", "focus-visible", ...(canDisable ? ["disabled"] : [])]) {
        samples.push(await measure(label, selector, state));
      }
    }
    dialogOpened = await evaluate(cdp, `(() => {
      const button = document.querySelector('#inbox-review-selected [data-review-edit]');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (dialogOpened) {
      for (let i=0;i<80;i++) {
        if (await evaluate(cdp, `Boolean(document.querySelector('#ai-review-dialog[open] [data-review-edit-form] select'))`)) break;
        await sleep(50);
      }
      await evaluate(cdp, `document.activeElement?.blur()`);
      for (const [label, selector, canDisable] of CONTROLS.slice(5)) {
        for (const state of ["rest", "hover", "active", "focus-visible", ...(canDisable ? ["disabled"] : [])]) {
          samples.push(await measure(label, selector, state));
        }
      }
      unselectedOption = await evaluate(cdp, `(() => {
        const option = document.querySelector('#ai-review-dialog [data-review-edit-form] select option:not(:checked)');
        if (!option) return { available: false, pass: true };
        const css=getComputedStyle(option), root=getComputedStyle(document.documentElement);
        const surface=root.getPropertyValue('--sf-color-surface').trim();
        const primary=root.getPropertyValue('--sf-color-primary').trim();
        const asRgb=(value)=>{ const v=String(value).trim(); if (/^#[0-9a-f]{6}$/i.test(v)) return [1,3,5].map((i)=>parseInt(v.slice(i,i+2),16));
          if (/^#[0-9a-f]{3}$/i.test(v)) return [1,2,3].map((i)=>parseInt(v[i]+v[i],16));
          return (v.match(/[0-9]+/g)||[]).slice(0,3).map(Number); };
        const eq=(x,y)=>{ const a=asRgb(x),b=asRgb(y); return a.length===3 && b.length===3 && a.every((n,i)=>n===b[i]); };
        return {available:true,background:css.backgroundColor,color:css.color,
          pass:eq(css.backgroundColor,surface)&&eq(css.color,primary)};
      })()`);
    }

    // Attack the real hover cascade; the same oracle must reject and then recover.
    const attackSelector = '[data-review-refresh]';
    await evaluate(cdp, `(() => {
      const sheet=document.createElement('style'); sheet.id='issue726-hover-attack';
      sheet.textContent='[data-review-refresh]:hover {background: var(--sf-color-surface) !important; border-color: var(--sf-color-border) !important; color: var(--sf-color-primary) !important;}';
      document.head.appendChild(sheet);
    })()`);
    let attacked;
    try { attacked = await measure("refresh-negative", attackSelector, "hover"); }
    finally { await evaluate(cdp, `document.getElementById('issue726-hover-attack')?.remove()`); }
    const restored = await measure("refresh-restored", attackSelector, "hover");
    negative = { attacked, restored, attackRejected: !attacked.pass, restorationPassed: restored.pass };
  } finally {
    await evaluate(cdp, `document.getElementById('issue726-hover-attack')?.remove()`);
    if (dialogOpened) await evaluate(cdp, `document.getElementById('ai-review-dialog')?.close()`);
  }
  const expected = CONTROLS.reduce((count, [, , canDisable], index) =>
    count + (index>=5 && !dialogOpened ? 0 : canDisable ? 5 : 4), 0);
  return { samples, expected, dialogOpened, unselectedOption,
    complete: dialogOpened && samples.length === expected && samples.every((item) => item.pass) && unselectedOption?.pass,
    negative, negativePass: negative.attackRejected && negative.restorationPassed };
}
