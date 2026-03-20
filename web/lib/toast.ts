import { toast } from "sonner";
import { ApiError } from "@/lib/api";

export function showError(message: string): void {
  toast.error(message, {
    duration: 5000,
  });
}

export function showSuccess(message: string): void {
  toast.success(message, {
    duration: 3000,
  });
}

export function showApiError(error: ApiError): void {
  const description =
    error.status > 0
      ? `${error.status} ${error.code} — Request ID: ${error.requestId}`
      : `Request ID: ${error.requestId}`;

  toast.error(error.message, {
    description,
    duration: 6000,
  });
}
