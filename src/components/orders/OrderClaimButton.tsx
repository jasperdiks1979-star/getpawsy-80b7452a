import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";
import DisputeForm from "@/components/disputes/DisputeForm";

interface OrderClaimButtonProps {
  orderId: string;
  orderEmail: string;
  variant?: "default" | "outline" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export default function OrderClaimButton({ 
  orderId, 
  orderEmail, 
  variant = "outline",
  size = "sm",
  className = ""
}: OrderClaimButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <AlertCircle className="w-4 h-4 mr-2" />
          Report Issue
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Submit a Claim</DialogTitle>
        </DialogHeader>
        <DisputeForm 
          orderId={orderId} 
          orderEmail={orderEmail} 
          onSuccess={() => setIsOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
