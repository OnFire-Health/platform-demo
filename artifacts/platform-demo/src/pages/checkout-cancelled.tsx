import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";

export function CheckoutCancelled() {
  const connectionId = new URLSearchParams(window.location.search).get("connectionId");
  return (
    <div className="space-y-6 max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-3xl font-bold tracking-tight">Checkout Cancelled</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">The payer backed out</CardTitle>
          <CardDescription>Onfire sent the payer here without appending anything to the URL.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The Checkout Session is still <code>open</code> and can be paid until it expires. Nothing was charged.
          </p>
          {connectionId ? (
            <Link href={`/connections/${connectionId}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid="link-back-connection">
              <ChevronLeft className="w-4 h-4" /> Back to connection
            </Link>
          ) : (
            <Link href="/connections" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid="link-back-connections">
              <ChevronLeft className="w-4 h-4" /> Back to connections
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
