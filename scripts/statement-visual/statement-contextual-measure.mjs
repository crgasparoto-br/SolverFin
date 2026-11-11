/** Creates the contextual DOM measurement oracle for the authenticated Chrome probe. */
export function createContextualMeasure(read) {
  return async (selector) =>
    read(`(() => {
      const surface = document.querySelector(${JSON.stringify(selector)});
      const box = surface?.getBoundingClientRect();
      const controls = Array.from(surface?.querySelectorAll('button,summary,input:not([type=hidden]),select,textarea') || [])
        .filter(node => node.getBoundingClientRect().width && node.getBoundingClientRect().height);
      const accountFields = Array.from(surface?.querySelectorAll('.statement-entry-account,[data-edit-account-field]') || [])
        .filter(node => node.getClientRects().length > 0);
      const editAccountSelect = surface?.querySelector('[data-edit-account-select]');
      const panel = surface?.querySelector('.modal-panel');
      const footerCancel = surface?.querySelector('[data-transaction-cancel]');
      const footerSave = surface?.querySelector('[data-statement-save-primary]');
      const footerContinue = surface?.querySelector('[data-statement-save-continue]');
      const footerGroup = surface?.querySelector('.statement-save-actions');
      const panelBox = panel?.getBoundingClientRect();
      const panelStyle = panel ? getComputedStyle(panel) : null;
      const panelContentLeft = panelBox && panelStyle
        ? panelBox.left + parseFloat(panelStyle.paddingLeft) : null;
      const panelContentRight = panelBox && panelStyle
        ? panelBox.right - parseFloat(panelStyle.paddingRight) : null;
      const footerButtonFits = (button) => {
        if (!button || panelContentLeft === null || panelContentRight === null) return false;
        const bounds = button.getBoundingClientRect();
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        while (textNode) {
          if (textNode.textContent.trim()) {
            const textRange = document.createRange();
            textRange.selectNodeContents(textNode);
            for (const rect of textRange.getClientRects()) {
              if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) return false;
            }
          }
          textNode = walker.nextNode();
        }
        return bounds.width > 0 && bounds.height > 0 &&
          bounds.left >= panelContentLeft - 1 && bounds.right <= panelContentRight + 1 &&
          button.scrollWidth <= button.clientWidth + 1;
      };
      const statusOptions = [...(surface?.querySelectorAll('.status-icon-btn[data-status-option]') || [])];
      const statusText = surface?.querySelector('.status-icons [data-status-label]');
      return { visible: !!box?.width && !!box?.height,
        inside: !!box && box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
        horizontalOverflow: !!surface && surface.scrollWidth > surface.clientWidth + 1,
        documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        focusInside: !!surface?.contains(document.activeElement),
        visibleAccountFields: accountFields.length,
        selectedAccountName: editAccountSelect?.selectedOptions?.[0]?.textContent?.trim() || null,
        fullAccountName: surface?.querySelector('[data-edit-account-full-name]')?.textContent?.trim() || null,
        readOnlyOriginalName: surface?.querySelector('.statement-entry-account input')?.value?.trim() || null,
        readOnlyVisibleName: surface?.querySelector('[data-account-readonly-full-name]')?.textContent?.trim() || null,
        readOnlyInputHidden: !!surface?.querySelector('.statement-entry-account input')?.hidden,
        documentScrollLocked: getComputedStyle(document.documentElement).overflowY === 'hidden',
        dialogOverflowHidden: !!surface && getComputedStyle(surface).overflowY === 'hidden',
        panelScrollControlled: !!panel && getComputedStyle(panel).overflowY === 'auto',
        footerActionColumns: footerGroup ? getComputedStyle(footerGroup).gridTemplateColumns.split(" ").length : null,
        footerActionLabels: [footerCancel, footerContinue, footerSave]
          .filter(node => node && !node.hidden && node.getClientRects().length > 0)
          .map(node => (node.getAttribute('aria-label') || node.textContent || '').trim()),
        footerActionRowDelta: footerCancel && footerSave
          ? Math.abs(footerCancel.getBoundingClientRect().top - footerSave.getBoundingClientRect().top)
          : null,
        footerContinueRowDelta: footerCancel && footerContinue ? Math.abs(footerCancel.getBoundingClientRect().top - footerContinue.getBoundingClientRect().top) : null,
        footerContinueHidden: !footerContinue || footerContinue.hidden || footerContinue.getClientRects().length === 0,
        footerContinueAfterCancel: !!footerCancel && !!footerContinue && footerContinue.getBoundingClientRect().top >= footerCancel.getBoundingClientRect().bottom - 1,
        footerSaveAfterCancel: !!footerSave && !!footerCancel && footerSave.getBoundingClientRect().top >= footerCancel.getBoundingClientRect().bottom - 1,
        footerPrimaryBelowContinue: !!footerSave && !!footerContinue && footerSave.getBoundingClientRect().top >= footerContinue.getBoundingClientRect().bottom - 1,
        footerActionsContained: footerButtonFits(footerCancel) && footerButtonFits(footerSave) && (!footerContinue || footerContinue.hidden || footerButtonFits(footerContinue)),
        footerActionHeights: {
          cancel: footerCancel?.getBoundingClientRect().height ?? null,
          save: footerSave?.getBoundingClientRect().height ?? null,
          continue: footerContinue?.getBoundingClientRect().height ?? null,
        },
        tooltipStatusCount: statusOptions.filter(node => node.title && node.title === node.getAttribute('aria-label')).length,
        statusLabelVisuallyHidden: !!statusText && statusText.getBoundingClientRect().width <= 1,
        horizontalCenterDelta: box ? Math.abs(box.left - (innerWidth - box.right)) : null,
        verticalCenterDelta: box ? Math.abs(box.top - (innerHeight - box.bottom)) : null,
        unnamedButtons: controls.filter(node => node.matches('button') && !node.getAttribute('aria-label') && !node.textContent.trim()).length,
        closeButtons: controls.filter(node => node.matches('.close-form button,button[aria-label=Fechar]')).length,
        closeGlyphDuplications: controls.filter(node => node.matches('.close-form button,button[aria-label=Fechar]') && node.textContent.includes('×') &&
          Array.from(node.querySelectorAll('svg')).some(svg => svg.getBoundingClientRect().width > 0 && svg.getBoundingClientRect().height > 0)).length };

    })()`);
}
