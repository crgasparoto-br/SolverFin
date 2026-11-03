import {
  renderPageContainer,
  renderPageHeader,
  renderPermissionState,
  renderRecoverableError,
} from "../design-system/primitives.js";
import { adminPageStyles } from "./admin-institutions-styles.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { getSecondaryRoutePageViewModel } from "./secondary-routes-view-model.js";

interface InstitutionFailure {
  status?: number;
  error: string;
  retryHref: string;
  filtersHtml: string;
}

export function renderAdminInstitutionsFailurePage(failure: InstitutionFailure): string {
  const pageModel = getSecondaryRoutePageViewModel("adminInstitutions");
  const denied = failure.status === 403;
  const content = denied
    ? renderPermissionState({
        title: "Acesso restrito",
        description: `${failure.error} A tela de instituições financeiras só fica disponível para usuários master configurados no backend.`,
        actionHtml:
          '<a class="button-link secondary-link" href="/dashboard">Voltar ao Dashboard</a>',
      })
    : `${renderPageHeader({
        eyebrow: pageModel.eyebrow,
        title: pageModel.title,
        description: pageModel.description,
      })}${renderRecoverableError({
        title: "Não foi possível carregar o catálogo de instituições",
        description: failure.error,
        actionHtml: `<a class="button-link" href="${failure.retryHref}">Tentar novamente</a>`,
      })}${failure.filtersHtml}`;

  return renderAuthenticatedShellDocument({
    activePathname: "/admin/instituicoes",
    currentLabel: "Admin - Instituições",
    showAdminNavigation: false,
    styles: adminPageStyles(),
    content: renderPageContainer({
      className: "secondary-route-page admin-institutions-page",
      childrenHtml: `<div data-secondary-route-foundation="${pageModel.id}" data-route-archetype="${pageModel.archetype}" data-route-audience="${pageModel.audience}" data-operational-mode="${pageModel.operationalMode}">${content}</div>`,
    }),
  });
}
