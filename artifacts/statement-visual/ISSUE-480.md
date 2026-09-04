# Issue #480 sidebar visual evidence

- Commit: `local`
- Browser: Google Chrome for Testing 127.0.6533.88
- Desktop viewport: 1280x480
- Mobile viewport: 390x844
- Generated at: 2026-09-04T19:23:15.761Z
- Screenshots: issue-480-sidebar-1280x480.png, issue-480-sidebar-mobile-open.png

## Validated behavior

- master routes rendered after `/api/me`;
- real Tab key events reach the last authorized desktop link and scroll it into view;
- focus leaves the navigation normally for the logout action, without a focus trap;
- navigation is the only vertically scrollable desktop sidebar region;
- brand and logout remain visible while the page itself does not scroll;
- route ids, Admin label and links are not duplicated;
- `aria-controls` covers every secondary link;
- Dashboard keeps `aria-current="page"`;
- real Tab and Enter key events reach and operate Mais/Menos on mobile;
- `aria-expanded`, labels and secondary-route visibility remain coherent when opening and closing;
- mobile navigation does not gain internal vertical scrolling.

## Result

No failures detected.
