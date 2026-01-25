import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertCircle, CheckCircle, Upload, Loader2 } from "lucide-react";

interface DisputeFormProps {
  orderId: string;
  orderEmail: string;
  onSuccess?: () => void;
}

const DISPUTE_TYPES = [
  { value: 'damaged', label: 'Product Arrived Damaged', description: 'Item was broken or damaged during shipping' },
  { value: 'not_received', label: 'Order Not Received', description: 'Package has not arrived after expected delivery date' },
  { value: 'wrong_item', label: 'Wrong Item Received', description: 'Received a different product than ordered' },
  { value: 'quality_issue', label: 'Quality Issue', description: 'Product quality does not match description' },
  { value: 'other', label: 'Other Issue', description: 'Other problem with your order' },
];

export default function DisputeForm({ orderId, orderEmail, onSuccess }: DisputeFormProps) {
  const [disputeType, setDisputeType] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [newEvidenceUrl, setNewEvidenceUrl] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [disputeId, setDisputeId] = useState("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-dispute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create',
          orderId,
          customerEmail: orderEmail,
          disputeType,
          description,
          evidence: evidenceUrls,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit claim');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setIsSubmitted(true);
      setDisputeId(data.disputeId);
      toast.success('Your claim has been submitted successfully');
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleAddEvidence = () => {
    if (newEvidenceUrl && evidenceUrls.length < 5) {
      setEvidenceUrls([...evidenceUrls, newEvidenceUrl]);
      setNewEvidenceUrl("");
    }
  };

  const handleRemoveEvidence = (index: number) => {
    setEvidenceUrls(evidenceUrls.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeType || !description) {
      toast.error('Please fill in all required fields');
      return;
    }
    submitMutation.mutate();
  };

  if (isSubmitted) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
            <h3 className="text-xl font-semibold text-green-800">Claim Submitted Successfully</h3>
            <p className="text-green-700">
              Your claim reference number is: <strong>{disputeId.slice(0, 8).toUpperCase()}</strong>
            </p>
            <p className="text-sm text-green-600">
              We've sent a confirmation email to {orderEmail}. Our team will review your claim within 24-48 hours.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-primary" />
          Submit a Claim
        </CardTitle>
        <CardDescription>
          Having an issue with your order? Let us know and we'll help resolve it as quickly as possible.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="dispute-type">What's the issue? *</Label>
            <Select value={disputeType} onValueChange={setDisputeType}>
              <SelectTrigger id="dispute-type">
                <SelectValue placeholder="Select the type of issue" />
              </SelectTrigger>
              <SelectContent>
                {DISPUTE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div>
                      <div className="font-medium">{type.label}</div>
                      <div className="text-xs text-muted-foreground">{type.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Describe the issue *</Label>
            <Textarea
              id="description"
              placeholder="Please provide as much detail as possible about what happened..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              required
            />
            <p className="text-xs text-muted-foreground">
              Include details like when you noticed the issue, the condition of the product, etc.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Evidence (Photos/Links)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Adding photos or evidence helps us process your claim faster. You can add up to 5 image URLs.
            </p>
            
            {evidenceUrls.length > 0 && (
              <div className="space-y-2 mb-4">
                {evidenceUrls.map((url, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded">
                    <span className="text-sm truncate flex-1">{url}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveEvidence(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {evidenceUrls.length < 5 && (
              <div className="flex gap-2">
                <Input
                  placeholder="Paste image URL here..."
                  value={newEvidenceUrl}
                  onChange={(e) => setNewEvidenceUrl(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddEvidence}
                  disabled={!newEvidenceUrl}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            )}
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">What happens next?</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• You'll receive a confirmation email with your claim reference</li>
              <li>• Our team will review your claim within 24-48 hours</li>
              <li>• We may contact you if we need additional information</li>
              <li>• Most claims are resolved within 3-5 business days</li>
            </ul>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={!disputeType || !description || submitMutation.isPending}
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Claim'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
