import type {
  DatePeriod,
  ImportOperationDiagnostics,
  ProcessingOperationDiagnostics,
} from "./account-remuneration-diagnostics-types.js";

export function formatImportOutcomeMessage(
  diagnostics: ImportOperationDiagnostics,
  latestReferenceOn: string | null,
): string {
  const requestedPeriod = formatPeriod(diagnostics.requestedPeriod);
  const effectivePeriod = diagnostics.effectivePeriod
    ? formatPeriod(diagnostics.effectivePeriod)
    : requestedPeriod;

  switch (diagnostics.outcome) {
    case "IMPORTED":
      return `O Banco Central foi consultado no período ${effectivePeriod}, retornou ${diagnostics.receivedCount} taxa(s) e ${diagnostics.importedCount} nova(s) taxa(s) CDI foram importada(s).`;
    case "ALREADY_UP_TO_DATE":
      return `Nenhuma alteração necessária. A série CDI já estava atualizada${latestReferenceOn ? ` até ${formatDate(latestReferenceOn)}` : ""} para o período solicitado ${requestedPeriod}; o Banco Central não foi consultado.`;
    case "PROVIDER_NO_RATES":
      return `Nenhuma alteração necessária. O Banco Central foi consultado no período ${effectivePeriod} e não retornou taxas; isso pode ocorrer em fins de semana ou feriados.`;
    case "NO_NEW_RECORDS":
      return `Nenhuma alteração necessária. O Banco Central retornou ${diagnostics.receivedCount} taxa(s) no período ${effectivePeriod}, mas todas já estavam armazenadas.`;
    case "FAILED":
      return `A atualização do CDI falhou para o período solicitado ${requestedPeriod}. Consulte a mensagem de erro registrada na operação.`;
  }
}

export function formatProcessingOutcomeMessage(
  diagnostics: ProcessingOperationDiagnostics,
): string {
  if (diagnostics.processedCompetences === 0) {
    return `Nenhuma alteração necessária em ${formatDate(diagnostics.processedOn)}. Há ${diagnostics.activeConfigurations} configuração(ões) ativa(s): ${diagnostics.notEligibleConfigurations} ainda não iniciada(s), ${diagnostics.configurationsWithoutRates} sem taxa CDI disponível e ${diagnostics.alreadyRegisteredCompetences} competência(s) elegível(is) já registrada(s). Nenhuma receita prevista foi criada.`;
  }

  return `Foram processadas ${diagnostics.processedCompetences} competência(s) em ${formatDate(diagnostics.processedOn)}: ${diagnostics.plannedTransactionsCreated} receita(s) prevista(s) criada(s) nos Extratos dos respectivos perfis, ${diagnostics.nonPositiveBalanceCompetences} concluída(s) sem lançamento por saldo não positivo e ${diagnostics.zeroAmountCompetences} por arredondamento para zero. Restam ${diagnostics.pendingCompetences} competência(s) pendente(s).`;
}

function formatPeriod(period: DatePeriod): string {
  return `${formatDate(period.startsOn)} a ${formatDate(period.endsOn)}`;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
