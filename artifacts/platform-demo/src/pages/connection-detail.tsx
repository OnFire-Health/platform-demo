import { useParams, Link } from "wouter";
import { useState } from "react";
import {
  useGetConnection,
  useListRateCards,
  useListInvoices,
  useDisconnectConnection,
  useReconcileInvoices,
  getListConnectionsQueryKey,
  getGetConnectionQueryKey,
  getListInvoicesQueryKey
} from "@workspace/api-client-react";
import type { RateCard } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateInvoiceDialog } from "@/components/create-invoice-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft,
  Unplug,
  CreditCard,
  FileText,
  Activity,
  RefreshCw
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ConnectionDetail() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: connection, isLoading: isLoadingConn } = useGetConnection(id);
  const { data: rateCards, isLoading: isLoadingRates } = useListRateCards(id);
  const { data: invoices, isLoading: isLoadingInvoices } = useListInvoices(id);

  const [selectedRateCard, setSelectedRateCard] = useState<RateCard | null>(null);

  const disconnect = useDisconnectConnection();
  const reconcile = useReconcileInvoices();

  const handleReconcile = () => {
    reconcile.mutate({ id }, {
      onSuccess: (result) => {
        toast({
          title: "Invoices reconciled",
          description: `Synced ${result.reconciled} invoice${result.reconciled === 1 ? "" : "s"} from Onfire.`,
        });
        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey(id) });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error", description: "Failed to reconcile invoices from Onfire." });
      }
    });
  };

  const handleDisconnect = () => {
    disconnect.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Practitioner disconnected", description: "The Onfire access token has been revoked." });
        queryClient.invalidateQueries({ queryKey: getGetConnectionQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error", description: "Failed to disconnect practitioner." });
      }
    });
  };

  if (isLoadingConn) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-48 md:col-span-1" />
          <Skeleton className="h-96 md:col-span-2" />
        </div>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">Connection not found</h2>
        <p className="text-muted-foreground mb-6">The requested practitioner connection does not exist or you don't have access.</p>
        <Link href="/connections">
          <Button>Return to Connections</Button>
        </Link>
      </div>
    );
  }

  const isActive = connection.status === "active";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/connections">
            <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{connection.displayName}</h1>
              <Badge variant={isActive ? "default" : "secondary"} className={isActive ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/20" : ""}>
                {isActive ? "Active" : "Revoked"}
              </Badge>
            </div>
            <p className="text-muted-foreground font-mono text-sm mt-1">{connection.partnerPublicId}</p>
          </div>
        </div>

        {isActive && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-2">
                <Unplug className="w-4 h-4" />
                Disconnect
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect {connection.displayName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will revoke the OAuth token and disconnect the practitioner from the platform.
                  You will no longer be able to create invoices on their behalf.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDisconnect} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Disconnect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 border-border shadow-sm h-fit">
          <CardHeader>
            <CardTitle>Tenant Identity</CardTitle>
            <CardDescription>Connection metadata and scopes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Connected</div>
              <div className="text-sm font-medium">{format(new Date(connection.connectedAt), "MMM d, yyyy 'at' h:mm a")}</div>
            </div>
            {connection.expiresAt && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Expires</div>
                <div className="text-sm font-medium">{format(new Date(connection.expiresAt), "MMM d, yyyy 'at' h:mm a")}</div>
              </div>
            )}
            {connection.orgId && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Org ID</div>
                <div className="text-sm font-mono">{connection.orgId}</div>
              </div>
            )}
            {connection.scope && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Granted Scopes</div>
                <div className="flex flex-wrap gap-1.5">
                  {connection.scope.split(" ").map(s => (
                    <Badge key={s} variant="outline" className="text-[10px] font-mono font-normal">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 border-border shadow-sm">
          <Tabs defaultValue="invoices" className="w-full">
            <CardHeader className="pb-0 border-b">
              <div className="flex items-center justify-between mb-4">
                <TabsList className="bg-muted">
                  <TabsTrigger value="invoices" className="gap-2">
                    <FileText className="w-4 h-4" /> Invoices
                  </TabsTrigger>
                  <TabsTrigger value="ratecards" className="gap-2">
                    <CreditCard className="w-4 h-4" /> Rate Cards
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleReconcile}
                    disabled={!isActive || reconcile.isPending}
                    title="Pull invoices from Onfire and re-sync the local mirror"
                  >
                    <RefreshCw className={`w-4 h-4 ${reconcile.isPending ? "animate-spin" : ""}`} />
                    Reconcile
                  </Button>
                  <CreateInvoiceDialog
                    connectionId={id}
                    rateCards={rateCards || []}
                    disabled={!isActive || isLoadingRates}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <TabsContent value="invoices" className="m-0 border-none outline-none">
                <div className="divide-y divide-border">
                  {isLoadingInvoices ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="p-4 flex flex-col gap-2">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    ))
                  ) : invoices?.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                      <FileText className="w-8 h-8 mb-3 opacity-20" />
                      <p>No invoices created for this practitioner.</p>
                    </div>
                  ) : (
                    invoices?.map((invoice) => (
                      <div key={invoice.id} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium">{invoice.externalInvoiceRef}</span>
                            {invoice.status && (
                              <Badge variant={invoice.status === 'paid' ? 'default' : 'secondary'} className={invoice.status === 'paid' ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20 text-[10px] h-5' : 'text-[10px] h-5 uppercase tracking-wider'}>
                                {invoice.status}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <span>{invoice.clientEmail}</span>
                            {invoice.rateCardRefId && (
                              <>
                                <span>&bull;</span>
                                <span className="font-mono text-xs opacity-70">RC: {invoice.rateCardRefId}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          {invoice.amount && (
                            <div className="font-semibold">${Number(invoice.amount).toFixed(2)} <span className="text-xs text-muted-foreground uppercase">{invoice.currency ?? "USD"}</span></div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(invoice.createdAt), "MMM d, yyyy")}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="ratecards" className="m-0 border-none outline-none">
                {isLoadingRates ? (
                  <div className="divide-y divide-border">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="p-4 flex flex-col gap-2">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                    ))}
                  </div>
                ) : rateCards?.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                    <CreditCard className="w-8 h-8 mb-3 opacity-20" />
                    <p>No rate cards found in Onfire.</p>
                    <p className="text-xs mt-1">Practitioner needs to create rate cards in their partner portal.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Product</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Full Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rateCards?.map((rc) => (
                        <TableRow
                          key={rc.refId}
                          className="cursor-pointer"
                          onClick={() => setSelectedRateCard(rc)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRateCard(rc);
                                }}
                                className="font-medium text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                              >
                                {rc.productName}
                              </button>
                              {!rc.active && (
                                <Badge variant="secondary" className="text-[10px] h-5">INACTIVE</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{rc.company}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] h-5">{rc.type}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatPrice(rc.fullPrice)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>

      <Sheet open={!!selectedRateCard} onOpenChange={(open) => !open && setSelectedRateCard(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedRateCard && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selectedRateCard.productName}
                  {!selectedRateCard.active && (
                    <Badge variant="secondary" className="text-[10px] h-5">INACTIVE</Badge>
                  )}
                </SheetTitle>
                <SheetDescription>{selectedRateCard.company}</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                {formatPrice(selectedRateCard.fullPrice) !== "—" && (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Full Price</div>
                    <div className="text-2xl font-bold mt-0.5">{formatPrice(selectedRateCard.fullPrice)}</div>
                    {formatPrice(selectedRateCard.installmentsPrice) !== "—" && !selectedRateCard.fullPriceOnly && (
                      <div className="text-sm text-muted-foreground mt-1">
                        or {formatPrice(selectedRateCard.installmentsPrice)}
                        {selectedRateCard.duration ? ` over ${selectedRateCard.duration} mo` : ""}
                      </div>
                    )}
                  </div>
                )}

                <DetailRow label="Ref ID" value={selectedRateCard.refId} mono />
                <DetailRow label="Type" value={selectedRateCard.type} />
                <DetailRow label="Active" value={selectedRateCard.active ? "Yes" : "No"} />
                <DetailRow
                  label="Full Price Only"
                  value={
                    typeof selectedRateCard.fullPriceOnly === "boolean"
                      ? selectedRateCard.fullPriceOnly
                        ? "Yes"
                        : "No"
                      : undefined
                  }
                />
                <DetailRow label="Duration" value={selectedRateCard.duration ?? undefined} />
                <DetailRow label="Installments Price" value={selectedRateCard.installmentsPrice ?? undefined} />
                <DetailRow label="Payout Plan" value={selectedRateCard.payoutPlan ?? undefined} />
                <DetailRow label="Subtitle" value={selectedRateCard.subTitle ?? undefined} />
                <DetailRow label="Details" value={selectedRateCard.details ?? undefined} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function formatPrice(value?: string | null): string {
  if (value === undefined || value === null || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  return `$${num.toFixed(2)}`;
}

function DetailRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-sm ${mono ? "font-mono break-all" : ""}`}>{value}</div>
    </div>
  );
}