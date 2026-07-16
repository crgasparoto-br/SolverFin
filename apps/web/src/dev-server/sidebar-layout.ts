/**
 * Layout contract for the authenticated desktop/tablet sidebar.
 *
 * The brand and logout action remain stable while only the navigation region
 * can consume the remaining height and scroll when the viewport is short.
 * Mobile keeps the existing horizontal navigation behaviour from
 * sharedShellStyles.
 */
export function sidebarLayoutStyles(): string {
  return `
    @media (min-width: 761px) {
      .sidebar {
        overflow: hidden;
      }
      .sidebar > .brand,
      .sidebar > .logout {
        flex: 0 0 auto;
      }
      .sidebar > .sidebar-navigation {
        -webkit-overflow-scrolling: touch;
        align-content: start;
        flex: 1 1 auto;
        min-height: 0;
        min-width: 0;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior-y: contain;
        touch-action: pan-y;
      }
    }
  `;
}
