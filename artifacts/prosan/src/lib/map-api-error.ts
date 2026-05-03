export type MappedApiError = {
  message: string;
  redirectToLogin: boolean;
};

/** Matches `@workspace/api-client-react` ApiError without coupling TS project-reference exports. */
function isWorkspaceApiError(
  error: unknown
): error is Error & { name: "ApiError"; status: number; data: unknown } {
  return (
    error instanceof Error &&
    error.name === "ApiError" &&
    typeof (error as { status?: unknown }).status === "number"
  );
}

function extractBackendCode(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const d = data as Record<string, unknown>;
  const err = d.error;
  if (err && typeof err === "object") {
    const code = (err as Record<string, unknown>).code;
    if (typeof code === "string") return code;
  }
  if (typeof d.code === "string") return d.code;
  return undefined;
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const m = error.message?.toLowerCase() ?? "";
    return m.includes("fetch") || m.includes("network") || m.includes("failed");
  }
  return false;
}

/** Maps fetch / ApiError / unknown failures to user-facing copy + login redirect flags. */
export function mapApiError(error: unknown): MappedApiError {
  if (isWorkspaceApiError(error)) {
    const code = extractBackendCode(error.data);
    if (code === "TENANT_SESSION_MISMATCH") {
      return {
        message: "Oturum hatası. Lütfen tekrar giriş yapın.",
        redirectToLogin: true,
      };
    }
    switch (error.status) {
      case 401:
        return { message: "Oturum süreniz dolmuş olabilir. Lütfen tekrar giriş yapın.", redirectToLogin: true };
      case 403:
        return {
          message: "Bu işlem için yetkiniz yok.",
          redirectToLogin: false,
        };
      case 404:
        return { message: "Kayıt bulunamadı.", redirectToLogin: false };
      case 500:
      case 502:
      case 503:
      case 504:
        return { message: "Sunucu hatası. Lütfen tekrar deneyin.", redirectToLogin: false };
      default:
        break;
    }
    const msg =
      typeof error.message === "string" && error.message.trim().length > 0
        ? error.message
        : "İşlem tamamlanamadı.";
    return { message: msg, redirectToLogin: false };
  }

  if (isNetworkError(error)) {
    return { message: "İnternet bağlantınızı kontrol edin.", redirectToLogin: false };
  }

  if (error instanceof Error && error.message) {
    return { message: error.message, redirectToLogin: false };
  }

  return { message: "Beklenmeyen bir hata oluştu.", redirectToLogin: false };
}
