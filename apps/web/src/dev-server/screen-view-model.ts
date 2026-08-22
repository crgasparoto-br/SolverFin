export type ScreenDataSource = "api" | "domain";
export type ScreenDataAvailability = "available" | "unavailable";

export interface ScreenDataProvenance {
  source: ScreenDataSource;
  resource: string;
  availability: ScreenDataAvailability;
}

export interface ScreenViewContext {
  filters: Readonly<Record<string, string>>;
  provenance: readonly ScreenDataProvenance[];
}

export interface MoneyViewModel {
  amountMinor: number;
  currency: string;
}

export interface ScreenEmptyViewModel {
  title: string;
  description: string;
}

export interface ScreenErrorViewModel {
  message: string;
}

export type ScreenViewModel<TContent> =
  | {
      status: "loading";
      context: ScreenViewContext;
    }
  | {
      status: "success";
      context: ScreenViewContext;
      content: TContent;
    }
  | {
      status: "empty";
      context: ScreenViewContext;
      empty: ScreenEmptyViewModel;
    }
  | {
      status: "error";
      context: ScreenViewContext;
      error: ScreenErrorViewModel;
    };

export function loadingScreen<TContent>(context: ScreenViewContext): ScreenViewModel<TContent> {
  return { status: "loading", context };
}

export function successScreen<TContent>(
  context: ScreenViewContext,
  content: TContent,
): ScreenViewModel<TContent> {
  return { status: "success", context, content };
}

export function emptyScreen<TContent>(
  context: ScreenViewContext,
  empty: ScreenEmptyViewModel,
): ScreenViewModel<TContent> {
  return { status: "empty", context, empty };
}

export function errorScreen<TContent>(
  context: ScreenViewContext,
  error: ScreenErrorViewModel,
): ScreenViewModel<TContent> {
  return { status: "error", context, error };
}
