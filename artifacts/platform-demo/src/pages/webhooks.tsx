import { useListWebhookEvents } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Activity, Webhook, CheckCircle2, AlertCircle } from "lucide-react";

export function Webhooks() {
  const { data: events, isLoading } = useListWebhookEvents();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Webhook Events</h1>
          <p className="text-muted-foreground mt-1">Live log of inbound events received by the platform.</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border border-b border-t mt-4">
            <div className="grid grid-cols-12 gap-4 p-4 text-sm font-medium text-muted-foreground bg-muted/50">
              <div className="col-span-2">Received</div>
              <div className="col-span-3">Event Type</div>
              <div className="col-span-3">Tenant Identity</div>
              <div className="col-span-3">Invoice Details</div>
              <div className="col-span-1 text-right">Routed</div>
            </div>

            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid grid-cols-12 gap-4 p-4 items-center">
                  <div className="col-span-2"><Skeleton className="h-4 w-24" /></div>
                  <div className="col-span-3"><Skeleton className="h-5 w-32" /></div>
                  <div className="col-span-3"><Skeleton className="h-4 w-40" /></div>
                  <div className="col-span-3"><Skeleton className="h-4 w-32" /></div>
                  <div className="col-span-1 flex justify-end"><Skeleton className="h-6 w-16" /></div>
                </div>
              ))
            ) : events?.length === 0 ? (
              <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center">
                <Webhook className="w-10 h-10 mb-4 opacity-20" />
                <p>No webhook events received yet.</p>
                <p className="text-sm mt-1">Events will appear here when OnFire sends them.</p>
              </div>
            ) : (
              events?.map((event) => (
                <div key={event.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/30 transition-colors">
                  <div className="col-span-2 text-sm text-muted-foreground">
                    {format(new Date(event.receivedAt), "MMM d, HH:mm:ss")}
                  </div>
                  
                  <div className="col-span-3">
                    {event.type ? (
                      <Badge variant="secondary" className="font-mono text-xs font-normal">
                        {event.type}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Unknown</span>
                    )}
                  </div>
                  
                  <div className="col-span-3">
                    {event.routed && event.connectionDisplayName ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px]">
                          {event.connectionDisplayName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-sm truncate" title={event.connectionDisplayName}>
                          {event.connectionDisplayName}
                        </span>
                      </div>
                    ) : event.partnerPublicId ? (
                      <div className="text-sm font-mono text-muted-foreground truncate" title={event.partnerPublicId}>
                        {event.partnerPublicId}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Unknown</span>
                    )}
                  </div>
                  
                  <div className="col-span-3 flex flex-col gap-0.5">
                    {event.externalInvoiceRef ? (
                      <span className="text-sm font-mono truncate" title={event.externalInvoiceRef}>
                        {event.externalInvoiceRef}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No invoice ref</span>
                    )}
                    {event.status && (
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {event.status} {event.amount ? `· $${Number(event.amount).toFixed(2)} ${event.currency ?? "USD"}` : ''}
                      </span>
                    )}
                  </div>
                  
                  <div className="col-span-1 flex justify-end">
                    {event.routed ? (
                      <Tooltip text="Successfully routed to a practitioner connection">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      </Tooltip>
                    ) : (
                      <Tooltip text="Could not route to a known practitioner">
                        <AlertCircle className="w-5 h-5 text-amber-500" />
                      </Tooltip>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Tooltip({ children, text }: { children: React.ReactNode, text: string }) {
  return (
    <div className="group relative flex items-center justify-center">
      {children}
      <div className="absolute bottom-full mb-2 hidden group-hover:block w-max max-w-xs p-2 bg-popover border text-popover-foreground text-xs rounded shadow-lg z-50">
        {text}
      </div>
    </div>
  );
}