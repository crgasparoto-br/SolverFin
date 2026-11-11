import { evaluate, screenshot } from "./cdp.mjs";

/** Chrome-only visual assertions with explicit evidence output ownership. */
export function createSettingsInterfaceProbes({ outputDir, screenshots }) {
  async function validateDecimalFormBehavior(cdp) {
    return evaluate(
      cdp,
      `(async () => {
        const form = document.querySelector('#new-automation-rule-dialog form[data-api-form]');
        const name = form?.elements.namedItem('name');
        const minimum = form?.elements.namedItem('amountMinMinor');
        const error = document.querySelector('#amount-minor-error');
        if (!form || !name || !minimum || !error) {
          return { validPayloadMinor: null, invalidBlocked: false, invalidValuePreserved: false, errorAssociated: false, reason: 'form controls missing' };
        }
  
        const originalFetch = window.fetch;
        const requests = [];
        window.fetch = async (input, init = {}) => {
          requests.push({
            url: String(input),
            method: init.method ?? 'GET',
            body: init.body ? JSON.parse(String(init.body)) : null
          });
          return new Response(JSON.stringify({ error: { message: 'QA intercepted request' } }), {
            status: 422,
            headers: { 'content-type': 'application/json' }
          });
        };
  
        try {
          name.value = 'QA Issue 558 - validação decimal no navegador';
          minimum.value = '10,50';
          minimum.dispatchEvent(new Event('input', { bubbles: true }));
          form.requestSubmit();
          for (let attempt = 0; attempt < 30 && requests.length < 1; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
  
          const validPayloadMinor = requests[0]?.body?.amountMinMinor ?? null;
          const validValuePreserved = minimum.value === '10,50';
  
          minimum.value = '10,501';
          minimum.dispatchEvent(new Event('input', { bubbles: true }));
          form.requestSubmit();
          await new Promise((resolve) => setTimeout(resolve, 120));
  
          const invalidBlocked = requests.length === 1;
          const invalidValuePreserved = minimum.value === '10,501';
          const errorAssociated =
            minimum.getAttribute('aria-invalid') === 'true' &&
            minimum.getAttribute('aria-describedby') === error.id &&
            !error.hidden;
  
          window.fetch = async () => {
            throw new Error('QA simulated network rejection');
          };
          minimum.value = '10,50';
          minimum.dispatchEvent(new Event('input', { bubbles: true }));
          form.requestSubmit();
          for (let attempt = 0; attempt < 30; attempt += 1) {
            if (form.querySelector('[data-form-status].error')) break;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          const status = form.querySelector('[data-form-status]');
          return {
            validPayloadMinor,
            validValuePreserved,
            requestCount: requests.length,
            invalidBlocked,
            invalidValuePreserved,
            errorAssociated,
            networkErrorVisible: Boolean(status?.textContent?.includes('Falha de conexão')),
            retryEnabled: form.querySelector('button[type="submit"]')?.disabled === false,
            networkValuePreserved: minimum.value === '10,50',
          };
        } finally {
          window.fetch = originalFetch;
        }
      })()`,
    );
  }
  
  async function validateLongProfileName(cdp, scenario) {
    const original = await evaluate(
      cdp,
      `(() => {
        const label = document.querySelector('.profile-item .item-title-line strong');
        if (!label) return null;
        const original = label.textContent;
        label.textContent = 'Perfil-fictício-' + 'A'.repeat(360);
        return original;
      })()`,
    );
    if (original === null)
      return {
        wrapped: false,
        noHorizontalOverflow: false,
        truncationRejected: false,
        restored: false,
      };
  
    const filename = `issue-727-${scenario}-long-profile.png`;
    await screenshot(cdp, join(outputDir, filename));
    screenshots.push(filename);
  
    const measurements = await evaluate(
      cdp,
      `(() => {
        const label = document.querySelector('.profile-item .item-title-line strong');
        const originalText = ${JSON.stringify(original)};
        const originalStyle = label.getAttribute('style');
        const height = label.getBoundingClientRect().height;
        const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
        const wrapped = height >= lineHeight * 1.7;
        const noHorizontalOverflow = document.documentElement.scrollWidth <= innerWidth + 1;
        label.style.width = '90px';
        label.style.whiteSpace = 'nowrap';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        const truncationRejected = label.scrollWidth > label.clientWidth + 1;
        if (originalStyle === null) label.removeAttribute('style');
        else label.setAttribute('style', originalStyle);
        label.textContent = originalText;
        const restored = label.textContent === originalText && document.documentElement.scrollWidth <= innerWidth + 1;
        return { wrapped, noHorizontalOverflow, truncationRejected, restored, screenshot: ${JSON.stringify(filename)} };
      })()`,
    );
    return measurements;
  }
  
  async function validateActionHierarchy(cdp, section) {
    return evaluate(
      cdp,
      `(() => {
      const scope = document.querySelector('[data-settings-scope="${section}"]');
      const actions = Array.from(scope?.querySelectorAll('button.sf-button-primary') || []);
      const primaryCount = actions.length;
      const secondary = scope?.querySelector('[data-api-path="/api/automation-rules/apply"]');
      let negativeControlRejectsCompetingPrimary = true;
      let restored = true;
      if (secondary) {
        secondary.classList.remove('sf-button-secondary');
        secondary.classList.add('sf-button-primary');
        const mutatedCount = scope.querySelectorAll('button.sf-button-primary').length;
        negativeControlRejectsCompetingPrimary = mutatedCount > 1;
        secondary.classList.remove('sf-button-primary');
        secondary.classList.add('sf-button-secondary');
        restored = scope.querySelectorAll('button.sf-button-primary').length === primaryCount;
      }
      return { section: '${section}', primaryCount, negativeControlRejectsCompetingPrimary, restored };
    })()`,
    );
  }
  
  function measurementExpression(section) {
    return `(() => {
      const bodyText = document.body.innerText;
      const active = document.querySelector('.sf-tab[aria-current="page"]');
      const dialog = document.querySelector('dialog[open]');
      const dialogRect = dialog?.getBoundingClientRect();
      const links = Array.from(document.querySelectorAll('.sf-tab'));
      const expectedLinks = ['/configuracoes?section=profiles', '/configuracoes?section=rules'];
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        rootFontSizePx: parseFloat(getComputedStyle(document.documentElement).fontSize),
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        documentScrollWidth: document.documentElement.scrollWidth,
        horizontalOverflowCandidates: Array.from(document.querySelectorAll("body *")).filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.right > innerWidth + 1;
        }).slice(0, 8).map((element) => ({ tag: element.tagName, className: String(element.className).slice(0, 110), right: Math.round(element.getBoundingClientRect().right) })),
        h1Count: document.querySelectorAll('h1').length,
        h1Text: document.querySelector('h1')?.textContent?.trim() || '',
        activeSection: active?.getAttribute('href')?.endsWith('section=rules') ? 'rules' : 'profiles',
        linksAreGet: links.length === 2 && links.every((link, index) => link.tagName === 'A' && link.getAttribute('href') === expectedLinks[index]),
        focusableNavigation: links.every((link) => link.tabIndex >= 0),
        dialogOpen: Boolean(dialog?.open),
        dialogInsideViewport: Boolean(dialogRect && dialogRect.left >= 0 && dialogRect.right <= window.innerWidth && dialogRect.top >= 0 && dialogRect.bottom <= window.innerHeight),
        hasTenantOperational: bodyText.includes('Tenant operacional'),
        hasCentavosLabel: bodyText.includes('em centavos'),
        hasProfileHeading: Array.from(document.querySelectorAll('h2')).some((item) => item.textContent?.trim() === 'Perfis financeiros'),
        hasProfileListHeading: Array.from(document.querySelectorAll('h3')).some((item) => item.textContent?.trim() === 'Perfis disponíveis'),
        hasRulesHeading: Array.from(document.querySelectorAll('h2')).some((item) => item.textContent?.trim() === 'Regras automáticas'),
        hasProfileAction: Boolean(document.querySelector('[data-open-dialog="new-profile-dialog"]')),
        hasPriorityHelp: bodyText.includes('Números maiores são aplicados primeiro; em empate, vence a regra criada antes.'),
        hasDecimalInputs: Boolean(document.querySelector('[name="amountMinMinor"][inputmode="decimal"]') && document.querySelector('[name="amountMaxMinor"][inputmode="decimal"]')),
        hasReviewMessage: bodyText.includes('sugestões revisáveis') && bodyText.includes('aprovação'),
        ruleItemCount: document.querySelectorAll('.rule-item').length,
        section: ${JSON.stringify(section)},
      };
    })()`;
  }
  return { validateDecimalFormBehavior, validateLongProfileName, validateActionHierarchy, measurementExpression };
}
