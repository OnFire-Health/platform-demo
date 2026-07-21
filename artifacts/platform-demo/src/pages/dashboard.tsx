import { useGetPlatformSummary, useGetPlatformConfig } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle2, Users, FileText, Check, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ConnectDialog } from "@/components/connect-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetPlatformSummary();
  const { data: config, isLoading: isLoadingConfig } = useGetPlatformConfig();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Platform overview and operator controls.</p>
        </div>
        <ConnectDialog />
      </div>

      {!isLoadingConfig && config && !config.configured && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Configuration Missing</AlertTitle>
          <AlertDescription>
            The platform is missing required environment variables to function correctly.
            <div className="mt-2 text-xs font-mono bg-background/50 p-2 rounded text-foreground">
              Missing: {config.missing.join(", ")}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Connections"
          value={summary?.totalConnections}
          subtitle={`${summary?.activeConnections || 0} active`}
          icon={Users}
          isLoading={isLoadingSummary}
        />
        <StatCard
          title="Total Invoices"
          value={summary?.totalInvoices}
          subtitle={`${summary?.openInvoices || 0} open, ${summary?.paidInvoices || 0} paid`}
          icon={FileText}
          isLoading={isLoadingSummary}
        />
        <StatCard
          title="Webhook Events"
          value={summary?.webhookEvents}
          subtitle="Processed via receiver"
          icon={Activity}
          isLoading={isLoadingSummary}
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Platform Health</CardTitle>
            {isLoadingConfig ? (
              <Skeleton className="w-4 h-4 rounded-full" />
            ) : config?.configured ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            )}
          </CardHeader>
          <CardContent>
            {isLoadingConfig ? (
              <Skeleton className="h-8 w-24 mb-1" />
            ) : (
              <div className="text-2xl font-bold">
                {config?.configured ? "Operational" : "Degraded"}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Onfire integration status
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="col-span-1 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Onfire Configuration</CardTitle>
            <CardDescription>Register these URLs in your Onfire Partner Portal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingConfig ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : config ? (
              <>
                <div className="space-y-1.5">
                  <div className="text-sm font-medium text-foreground">OAuth Redirect URI</div>
                  <div className="flex items-center justify-between bg-muted p-3 rounded-md border text-sm font-mono text-muted-foreground break-all">
                    {config.redirectUri}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-sm font-medium text-foreground">Webhook Receiver URL</div>
                  <div className="flex items-center justify-between bg-muted p-3 rounded-md border text-sm font-mono text-muted-foreground break-all">
                    {config.webhookUrl}
                  </div>
                </div>
                <div className="pt-2">
                  <div className="text-sm font-medium text-foreground mb-2">Requested Scopes</div>
                  <div className="flex flex-wrap gap-2">
                    {config.scopes.split(" ").map(s => (
                      <Badge key={s} variant="secondary" className="font-mono text-xs font-normal">{s}</Badge>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card className="col-span-1 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common operator tasks.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 border rounded-lg flex items-start gap-4 hover:border-primary/50 transition-colors bg-card">
                <div className="p-2 bg-primary/10 rounded-md mt-0.5">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold mb-1">Onboard Practitioner</h4>
                  <p className="text-sm text-muted-foreground mb-3">Connect a new practitioner's Onfire account to the platform.</p>
                  <ConnectDialog />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, isLoading }: any) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-16 mb-1" />
        ) : (
          <div className="text-2xl font-bold">{value !== undefined ? value : "—"}</div>
        )}
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}