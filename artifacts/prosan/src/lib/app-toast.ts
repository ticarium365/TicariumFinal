import { toast as sonnerToast } from "sonner";

/** Success — green, 3s auto-dismiss */
export function toastSuccess(message: string, description?: string) {
  sonnerToast.success(message, {
    description,
    duration: 3000,
  });
}

/** Error — red, 6s, dismiss control via toast chrome */
export function toastError(message: string, description?: string) {
  const id = sonnerToast.error(message, {
    description,
    duration: 6000,
    action: {
      label: "Kapat",
      onClick: () => sonnerToast.dismiss(id),
    },
  });
  return id;
}

/** Alias for API-mapped messages */
export function toastApiError(message: string) {
  toastError(message);
}

/** Delete flow — success with optional undo within ~5s */
export function toastUndoDelete(message: string, onUndo: () => void) {
  sonnerToast.success(message, {
    duration: 5000,
    action: {
      label: "Geri al",
      onClick: () => {
        onUndo();
        sonnerToast.dismiss();
      },
    },
  });
}
