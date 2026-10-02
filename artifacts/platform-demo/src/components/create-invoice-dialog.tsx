import { useState } from "react";
import { useCreateInvoice, getListInvoicesQueryKey, RateCard } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CreateInvoiceDialogProps {
  connectionId: string;
  rateCards: RateCard[];
  disabled?: boolean;
}

export function CreateInvoiceDialog({ connectionId, rateCards, disabled }: CreateInvoiceDialogProps) {
  const [open, setOpen] = useState(false);
  const [rateCardRefId, setRateCardRefId] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  // Onfire requires name, phone and a full billing address on every invoice.
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createInvoice = useCreateInvoice();

  const activeRateCards = rateCards.filter((rc) => rc.active);

  const isValid =
    !!rateCardRefId &&
    !!clientEmail.trim() &&
    !!clientName.trim() &&
    !!clientPhone.trim() &&
    !!line1.trim() &&
    !!city.trim() &&
    !!stateVal.trim() &&
    !!postalCode.trim();

  const resetForm = () => {
    setRateCardRefId("");
    setClientEmail("");
    setClientName("");
    setClientPhone("");
    setLine1("");
    setLine2("");
    setCity("");
    setStateVal("");
    setPostalCode("");
    setCountry("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    createInvoice.mutate(
      {
        id: connectionId,
        data: {
          rateCardRefId,
          clientEmail: clientEmail.trim(),
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          clientBillingAddress: {
            line1: line1.trim(),
            line2: line2.trim() || undefined,
            city: city.trim(),
            state: stateVal.trim(),
            postalCode: postalCode.trim(),
            country: country.trim() || undefined,
          },
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Invoice Created", description: "Successfully created an invoice on behalf of the practitioner." });
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey(connectionId) });
          setOpen(false);
          resetForm();
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Failed to create invoice." });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" disabled={disabled || activeRateCards.length === 0}>
          <Plus className="w-4 h-4" />
          Invoice (bill by email)
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
            <DialogDescription>
              Practitioner-initiated billing: Onfire emails the patient a pay link for one of the
              practitioner&apos;s rate cards. Use this when the patient is not present to pay now.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rateCard">Rate Card</Label>
              <Select value={rateCardRefId} onValueChange={setRateCardRefId}>
                <SelectTrigger>
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

            <div className="grid gap-2">
              <Label htmlFor="clientEmail">Client Email</Label>
              <Input id="clientEmail" type="email" value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)} placeholder="patient@example.com" required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="clientName">Client Name</Label>
                <Input id="clientName" value={clientName}
                  onChange={(e) => setClientName(e.target.value)} placeholder="Jane Doe" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="clientPhone">Client Phone</Label>
                <Input id="clientPhone" value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)} placeholder="+15551234567" required />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="line1">Billing Address</Label>
              <Input id="line1" value={line1} onChange={(e) => setLine1(e.target.value)}
                placeholder="Address line 1" required />
              <Input id="line2" value={line2} onChange={(e) => setLine2(e.target.value)}
                placeholder="Address line 2 (optional)" />
              <div className="grid grid-cols-2 gap-4">
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)}
                  placeholder="City" required />
                <Input id="state" value={stateVal} onChange={(e) => setStateVal(e.target.value)}
                  placeholder="State" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="Postal code" required />
                <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)}
                  placeholder="Country (optional)" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || createInvoice.isPending}>
              {createInvoice.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
