"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { loadMoreInvoicesAction } from "@/app/billing/history-actions";
import { mergeInvoiceHistoryPages, type InvoiceHistoryPage, type InvoiceHistoryRequest } from "@/lib/billing/invoice-history";

export function useInvoiceHistory(request: Omit<InvoiceHistoryRequest, "cursor">, initialPage: InvoiceHistoryPage) {
  const query = useInfiniteQuery({
    queryKey: ["billing-history", request.shopId, request.isSecondHand, request.search, request.period],
    initialPageParam: null as InvoiceHistoryRequest["cursor"],
    initialData: { pages: [initialPage], pageParams: [null] },
    queryFn: ({ pageParam }) => loadMoreInvoicesAction({ ...request, cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // Revisiting the screen refreshes edits made in another part of the app.
    staleTime: 0,
    refetchOnMount: true,
  });
  const invoices = useMemo(() => mergeInvoiceHistoryPages(query.data.pages), [query.data.pages]);
  return { ...query, invoices, summary: query.data.pages[0].summary ?? initialPage.summary };
}
