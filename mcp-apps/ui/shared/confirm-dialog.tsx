import { Dialog } from "@plexui/ui/components/Dialog";
import { Button } from "@plexui/ui/components/Button";
import { LoadingIndicator } from "@plexui/ui/components/Indicator";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={function (o) { if (!o) onClose(); }}>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
        </Dialog.Header>
        <Dialog.Footer>
          <Button variant="ghost" color="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            color={variant === "destructive" ? "danger" : "secondary"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <LoadingIndicator size={16} className="mr-1" /> : null}
            {confirmLabel}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
