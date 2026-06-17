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
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createInvoice = useCreateInvoice();

  const activeRateCards = rateCards.filter(rc => rc.active);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateCardRefId || !clientEmail.trim()) return;

    createInvoice.mutate(
      {
        id: connectionId,
        data: {
          rateCardRefId,
          clientEmail: clientEmail.trim(),
          clientFirstName: clientFirstName.trim() || undefined,
          clientLastName: clientLastName.trim() || undefined,
        }
      },
      {
        onSuccess: () => {
          toast({ title: "Invoice Created", description: "Successfully created an invoice on behalf of the practitioner." });
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey(connectionId) });
          setOpen(false);
          // Reset form
          setRateCardRefId("");
          setClientEmail("");
          setClientFirstName("");
          setClientLastName("");
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Failed to create invoice." });
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" disabled={disabled || activeRateCards.length === 0}>
          <Plus className="w-4 h-4" />
          Create Invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
            <DialogDescription>
              Create an invoice for a patient using one of the practitioner's rate cards.
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
                  {activeRateCards.map(rc => (
                    <SelectItem key={rc.refId} value={rc.refId}>
                      {rc.name} {rc.amount && rc.currency ? `(${Number(rc.amount)/100} ${rc.currency})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="clientEmail">Client Email</Label>
              <Input
                id="clientEmail"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="patient@example.com"
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="firstName">First Name (Optional)</Label>
                <Input
                  id="firstName"
                  value={clientFirstName}
                  onChange={(e) => setClientFirstName(e.target.value)}
                  placeholder="Jane"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastName">Last Name (Optional)</Label>
                <Input
                  id="lastName"
                  value={clientLastName}
                  onChange={(e) => setClientLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!rateCardRefId || !clientEmail.trim() || createInvoice.isPending}>
              {createInvoice.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}