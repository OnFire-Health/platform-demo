import { useState } from "react";
import { useCreateCheckoutSession, getListCheckoutSessionsQueryKey } from "@workspace/api-client-react";
import type { RateCard, CheckoutSessionResult } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function httpStatusLabel(status: number): string {
  if (status === 201) return "201 created";
  if (status === 200) return "200 replayed";
  if (status === 409) return "409 conflict";
  return String(status);
}

function newOrderId() {
  return `pd_cs_${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
}

interface Props {
  connectionId: string;
  rateCards: RateCard[];
  disabled?: boolean;
}

export function CreateCheckoutSessionDialog({ connectionId, rateCards, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [rateCardRefId, setRateCardRefId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [orderId, setOrderId] = useState(newOrderId);
  const [rows, setRows] = useState<{ key: string; value: string }[]>([
    { key: "order_id", value: "" },
    { key: "", value: "" },
  ]);
  const [orderIdTouchedMeta, setOrderIdTouchedMeta] = useState(false);
  const [result, setResult] = useState<CheckoutSessionResult | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const create = useCreateCheckoutSession();
  const activeRateCards = rateCards.filter((rc) => rc.active);
  const qty = Number(quantity);
  const isValid = !!rateCardRefId && Number.isInteger(qty) && qty >= 1;

  const reset = () => {
    const next = newOrderId();
    setRateCardRefId("");
    setQuantity("1");
    setOrderId(next);
    setRows([{ key: "order_id", value: "" }, { key: "", value: "" }]);
    setOrderIdTouchedMeta(false);
    setResult(null);
  };

  const updateRow = (i: number, patch: Partial<{ key: string; value: string }>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    if (i === 0 && patch.value !== undefined) setOrderIdTouchedMeta(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    const metadata: Record<string, string> = {};
    rows.forEach((r, i) => {
      const k = r.key.trim();
      const v = i === 0 && !orderIdTouchedMeta && k === "order_id" ? orderId.trim() : r.value;
      if (k) metadata[k] = v;
    });
    create.mutate(
      {
        id: connectionId,
        data: {
          rateCardRefId,
          quantity: qty,
          clientReferenceId: orderId.trim() || undefined,
          metadata,
        },
      },
      {
        onSuccess: (res) => {
          setResult(res);
          queryClient.invalidateQueries({ queryKey: getListCheckoutSessionsQueryKey(connectionId) });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Failed to create Checkout Session." });
        },
      },
    );
  };

  const ok = result && (result.httpStatus === 201 || result.httpStatus === 200);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" disabled={disabled || activeRateCards.length === 0} data-testid="button-new-checkout-session">
          <Plus className="w-4 h-4" />
          New Checkout Session
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[460px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New Checkout Session</DialogTitle>
            <DialogDescription>
              Onfire prices the Checkout Session from the rate card. No payer details are collected here.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="checkout-session-rate-card">Rate Card</Label>
              <Select value={rateCardRefId} onValueChange={setRateCardRefId}>
                <SelectTrigger id="checkout-session-rate-card" data-testid="select-checkout-rate-card">
                  <SelectValue placeholder="Select a rate card" />
                </SelectTrigger>
                <SelectContent>
                  {activeRateCards.map((rc) => (
                    <SelectItem key={rc.refId} value={rc.refId}>
                      {rc.productName} {rc.fullPrice ? `($${Number(rc.fullPrice).toFixed(2)})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2 col-span-1">
                <Label htmlFor="checkout-session-quantity">Quantity</Label>
                <Input id="checkout-session-quantity" type="number" min={1} step={1} value={quantity}
                  onChange={(e) => setQuantity(e.target.value)} data-testid="input-checkout-quantity" />
              </div>
              <div className="grid gap-2 col-span-2">
                <Label htmlFor="checkout-session-order-id">Order ID</Label>
                <Input id="checkout-session-order-id" className="font-mono text-sm" value={orderId}
                  onChange={(e) => setOrderId(e.target.value)} data-testid="input-checkout-order-id" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Metadata</Label>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <Input aria-label={`Metadata key ${i + 1}`} placeholder="key" className="font-mono text-sm" value={r.key}
                    onChange={(e) => updateRow(i, { key: e.target.value })} data-testid={`input-metadata-key-${i}`} />
                  <Input aria-label={`Metadata value ${i + 1}`} placeholder="value" className="font-mono text-sm"
                    value={i === 0 && !orderIdTouchedMeta && r.key === "order_id" ? orderId : r.value}
                    onChange={(e) => updateRow(i, { value: e.target.value })} data-testid={`input-metadata-value-${i}`} />
                </div>
              ))}
            </div>
            {result && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1" role="status" data-testid="status-create-result">
                <div className="flex items-center gap-2">
                  <Badge variant={ok ? "default" : "destructive"} className="font-mono text-xs">
                    {httpStatusLabel(result.httpStatus)}
                  </Badge>
                  {result.checkoutSession?.publicId && (
                    <span className="font-mono text-xs text-muted-foreground truncate">{result.checkoutSession.publicId}</span>
                  )}
                </div>
                {result.error && <p className="text-sm text-destructive break-words">{result.error}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-checkout-close">
              {result ? "Close" : "Cancel"}
            </Button>
            <Button type="submit" disabled={!isValid || create.isPending} data-testid="button-checkout-submit">
              {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
