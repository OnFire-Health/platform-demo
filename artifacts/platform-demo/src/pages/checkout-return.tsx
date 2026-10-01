import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { useRetrieveCheckoutSession } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ChevronLeft } from "lucide-react";

export function CheckoutReturn() {
  const search = new URLSearchParams(window.location.search);
  const connectionId = search.get("connectionId");
  const checkoutSessionId = search.get("checkout_session_id");
  const retrieve = useRetrieveCheckoutSession();
  const mutateRef = useRef(retrieve.mutate);
  mutateRef.current = retrieve.mutate;
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !connectionId || !checkoutSessionId) return;
    fired.current = true;
    mutateRef.current({ id: connectionId, data: { checkoutSessionId } });
  }, [connectionId, checkoutSessionId]);

  const checkoutSession = retrieve.data;
  const missing = !connectionId || !checkoutSessionId;

  return (
    <div className="space-y-6 max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Checkout Return</h1>
        <p className="text-muted-foreground mt-1">Result of the hosted Checkout Session, retrieved from Onfire.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Checkout Session</CardTitle>
          <CardDescription className="font-mono">{checkoutSessionId ?? "no checkout_session_id"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {missing ? (
            <div className="flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="w-4 h-4" /> Both connectionId and checkout_session_id query parameters are required.
            </div>
          ) : retrieve.isError ? (
            <div className="space-y-3" role="alert">
              <div className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="w-4 h-4" /> Could not retrieve the Checkout Session.</div>
              <Button size="sm" variant="outline" onClick={() => mutateRef.current({ id: connectionId, data: { checkoutSessionId } })} data-testid="button-retry-retrieve">Retry</Button>
            </div>
          ) : !checkoutSession ? (
            <div className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-5 w-64" /><Skeleton className="h-5 w-52" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Status"><Badge variant="secondary" className="uppercase text-[10px]" data-testid="text-return-status">{checkoutSession.status}</Badge></Field>
                <Field label="Payment status"><Badge variant="secondary" className="uppercase text-[10px]" data-testid="text-return-payment-status">{checkoutSession.paymentStatus}</Badge></Field>
                <Field label="Amount"><span className="font-semibold">{checkoutSession.amount ? `${checkoutSession.amount} ${checkoutSession.currency ?? ""}` : "—"}</span></Field>
                <Field label="Completed at">{checkoutSession.completedAt ? format(new Date(checkoutSession.completedAt), "MMM d, yyyy 'at' h:mm a") : "—"}</Field>
                <Field label="Client reference ID"><span className="font-mono text-sm break-all">{checkoutSession.clientReferenceId}</span></Field>
              </div>
              <Field label="Metadata">
                <pre className="rounded-md border bg-muted/30 p-3 text-xs font-mono overflow-x-auto" data-testid="text-return-metadata">
                  {JSON.stringify(checkoutSession.metadata ?? {}, null, 2)}
                </pre>
              </Field>
            </>
          )}
          <p className="text-sm text-muted-foreground border-t pt-4">
            <code>complete</code> + <code>paid</code> = done; <code>complete</code> + <code>processing</code> = bank transfer pending settlement; anything else = not paid yet — wait for the webhook.
          </p>
          {connectionId && (
            <Link href={`/connections/${connectionId}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid="link-back-connection">
              <ChevronLeft className="w-4 h-4" /> Back to connection
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
