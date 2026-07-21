import { useListConnections, useDisconnectConnection, getListConnectionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ConnectDialog } from "@/components/connect-dialog";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Unplug, ExternalLink, Activity } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";

export function Connections() {
  const { data: connections, isLoading } = useListConnections();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const disconnect = useDisconnectConnection();

  const handleDisconnect = (id: string) => {
    disconnect.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Practitioner disconnected", description: "The Onfire access token has been revoked." });
        queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error", description: "Failed to disconnect practitioner." });
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Connections</h1>
          <p className="text-muted-foreground mt-1">Manage connected Onfire practitioner accounts.</p>
        </div>
        <ConnectDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border border-b border-t mt-4">
            <div className="grid grid-cols-12 gap-4 p-4 text-sm font-medium text-muted-foreground bg-muted/50">
              <div className="col-span-4">Practitioner</div>
              <div className="col-span-3">Partner ID</div>
              <div className="col-span-2">Connected Date</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="grid grid-cols-12 gap-4 p-4 items-center">
                  <div className="col-span-4"><Skeleton className="h-5 w-32" /></div>
                  <div className="col-span-3"><Skeleton className="h-5 w-48" /></div>
                  <div className="col-span-2"><Skeleton className="h-5 w-24" /></div>
                  <div className="col-span-2"><Skeleton className="h-5 w-16" /></div>
                  <div className="col-span-1 flex justify-end"><Skeleton className="h-8 w-8 rounded-md" /></div>
                </div>
              ))
            ) : connections?.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                <Unplug className="w-10 h-10 mb-4 opacity-20" />
                <p>No connections found.</p>
                <p className="text-sm mt-1 mb-6">Connect a practitioner to start managing their billing.</p>
                <ConnectDialog />
              </div>
            ) : (
              connections?.map((conn) => (
                <div key={conn.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/30 transition-colors group">
                  <div className="col-span-4 font-medium flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                      {conn.displayName.charAt(0).toUpperCase()}
                    </div>
                    {conn.displayName}
                  </div>
                  <div className="col-span-3 text-sm font-mono text-muted-foreground truncate" title={conn.partnerPublicId}>
                    {conn.partnerPublicId}
                  </div>
                  <div className="col-span-2 text-sm text-muted-foreground">
                    {format(new Date(conn.connectedAt), "MMM d, yyyy")}
                  </div>
                  <div className="col-span-2">
                    <Badge variant={conn.status === "active" ? "default" : "secondary"} className={conn.status === "active" ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-500/20" : ""}>
                      {conn.status === "active" ? (
                        <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>Active</span>
                      ) : (
                        "Revoked"
                      )}
                    </Badge>
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {conn.status === "active" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Unplug className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Disconnect {conn.displayName}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will revoke the OAuth token and disconnect the practitioner from the platform.
                              You will no longer be able to create invoices on their behalf.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDisconnect(conn.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Disconnect
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <Link href={`/connections/${conn.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </Link>
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