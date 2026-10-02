import { useState } from "react";
import {
  useListCheckoutSessions,
  useReplayCheckoutSession,
  useRetrieveCheckoutSession,
  getListCheckoutSessionsQueryKey,
} from "@workspace/api-client-react";
import type { CheckoutSession } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ShoppingCart, RefreshCw, ExternalLink, Repeat, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

export function CheckoutSessionsTab({ connectionId, isActive }: { connectionId: string; isActive: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: rows, isLoading, isError, refetch } = useListCheckoutSessions(connectionId, {
    query: { refetchInterval: 5000, queryKey: getListCheckoutSessionsQueryKey(connectionId) },
  });
  const replay = useReplayCheckoutSession();
  const retrieve = useRetrieveCheckoutSession();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListCheckoutSessionsQueryKey(connectionId) });

  const doReplay = (row: CheckoutSession, change?: "quantityPlusOne") => {
    setBusyId(row.id);
    replay.mutate(
      { id: connectionId, checkoutSessionId: row.id, data: change ? { change } : {} },
      {
        onSuccess: (res) => {
          const text =
            res.httpStatus === 200
              ? "200 · same id"
              : res.httpStatus === 409
                ? `409 conflict${res.error ? ` · ${res.error}` : ""}`
                : `${res.httpStatus}${res.error ? ` · ${res.error}` : ""}`;
          setNotes((n) => ({ ...n, [row.id]: text }));
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Replay failed." }),
        onSettled: () => setBusyId(null),
      },
    );
  };

  const doRefresh = (row: CheckoutSession) => {
    if (!row.publicId) return;
    setBusyId(row.id);
    retrieve.mutate(
      { id: connectionId, data: { checkoutSessionId: row.publicId } },
      {
        onSuccess: () => {
          setNotes((n) => ({ ...n, [row.id]: "Refreshed" }));
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Error", description: "Refresh failed." }),
        onSettled: () => setBusyId(null),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-4 flex flex-col gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-3" role="alert">
        <AlertCircle className="w-8 h-8 opacity-40" />
        <p>Could not load Checkout Sessions.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry-checkout-sessions">Retry</Button>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
        <ShoppingCart className="w-8 h-8 mb-3 opacity-20" />
        <p>No Checkout Sessions created for this practitioner.</p>
        <p className="text-xs mt-1">Use <strong>Checkout Session (patient pays now)</strong> to mint one.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Order ID</TableHead>
          <TableHead>Public ID</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Payment</TableHead>
          <TableHead>Last event</TableHead>
          <TableHead>Create</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const busy = busyId === row.id;
          const isOpen = row.status === "open";
          return (
            <TableRow key={row.id} data-testid={`row-checkout-session-${row.id}`}>
              <TableCell className="font-mono text-xs">{row.clientReferenceId}</TableCell>
              <TableCell className="font-mono text-xs max-w-[140px] truncate" title={row.publicId ?? ""}>{row.publicId ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap text-sm font-semibold">
                {row.amount ? `${row.amount} ${row.currency ?? ""}` : "—"}
              </TableCell>
              <TableCell><Badge variant="secondary" className="text-[10px] uppercase">{row.status}</Badge></TableCell>
              <TableCell>
                <Badge
                  variant={row.paymentStatus === "paid" ? "default" : "secondary"}
                  className={row.paymentStatus === "paid" ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/20 text-[10px] uppercase" : "text-[10px] uppercase"}
                >
                  {row.paymentStatus}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">{row.lastEventType ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs">{row.lastCreateHttpStatus ?? "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(row.updatedAt), "MMM d, HH:mm:ss")}</TableCell>
              <TableCell>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {isOpen && row.payerUrl ? (
                    <Button asChild size="sm" className="gap-1.5">
                      <a href={row.payerUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-pay-${row.id}`}>
                        <ExternalLink className="w-3.5 h-3.5" /> Pay with Onfire
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" className="gap-1.5" disabled data-testid={`button-pay-disabled-${row.id}`}>
                      <ExternalLink className="w-3.5 h-3.5" /> Pay with Onfire
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={!row.publicId || busy || !isActive}
                    onClick={() => doRefresh(row)} data-testid={`button-refresh-${row.id}`}>
                    <RefreshCw className={`w-3.5 h-3.5 ${busy && retrieve.isPending ? "animate-spin" : ""}`} /> Refresh
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={busy || !isActive}
                    onClick={() => doReplay(row)} data-testid={`button-replay-${row.id}`}>
                    <Repeat className="w-3.5 h-3.5" /> Replay create
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={busy || !isActive}
                    onClick={() => doReplay(row, "quantityPlusOne")} data-testid={`button-replay-qty-${row.id}`}>
                    <Repeat className="w-3.5 h-3.5" /> Replay (qty +1)
                  </Button>
                </div>
                {notes[row.id] && (
                  <div className="text-xs font-mono text-right mt-1.5 text-muted-foreground break-words max-w-[320px] ml-auto" role="status" data-testid={`text-replay-result-${row.id}`}>
                    {notes[row.id]}
                  </div>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
