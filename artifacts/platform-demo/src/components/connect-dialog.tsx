import { useState } from "react";
import { useCreateAuthorizeUrl } from "@workspace/api-client-react";
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
import { Plus, Loader2 } from "lucide-react";

export function ConnectDialog() {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  
  const createUrl = useCreateAuthorizeUrl();

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    createUrl.mutate(
      { data: { displayName } },
      {
        onSuccess: (res) => {
          // Redirect to the authorize URL to begin OAuth flow
          window.location.href = res.url;
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Connect Practitioner
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleConnect}>
          <DialogHeader>
            <DialogTitle>Connect Practitioner</DialogTitle>
            <DialogDescription>
              Start the OAuth authorization flow to connect a practitioner's OnFire account.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-6">
            <div className="grid gap-2">
              <Label htmlFor="displayName">Practitioner Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Dr. Jane Doe"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                This will be used to identify the connection in the platform console.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!displayName.trim() || createUrl.isPending}>
              {createUrl.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Generate Auth Link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}