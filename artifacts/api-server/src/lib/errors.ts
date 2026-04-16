/**
 * Standart API hata formatı
 * { error: { code, message, details } }
 *
 * Tüm route'lar bu yardımcıyı kullanmalıdır.
 */
export function apiError(code: string, message: string, details?: unknown) {
  return { error: { code, message, details: details ?? null } };
}

export const Errors = {
  badRequest: (message: string, details?: unknown) =>
    apiError("BAD_REQUEST", message, details),

  unauthorized: (message = "Giriş yapmanız gerekiyor") =>
    apiError("UNAUTHORIZED", message),

  forbidden: (message = "Bu işlem için yetkiniz yok") =>
    apiError("FORBIDDEN", message),

  notFound: (entity = "Kayıt") =>
    apiError("NOT_FOUND", `${entity} bulunamadı`),

  conflict: (code: string, message: string, details?: unknown) =>
    apiError(code, message, details),

  paymentRequired: (message: string) =>
    apiError("PAYMENT_REQUIRED", message),

  tooManyRequests: () =>
    apiError("TOO_MANY_REQUESTS", "Çok fazla deneme. Lütfen daha sonra tekrar deneyin."),

  insufficientStock: (available: number) =>
    apiError("INSUFFICIENT_STOCK", `Yetersiz stok. Mevcut stok: ${available}`, { available }),

  alreadyReturned: () =>
    apiError("ALREADY_RETURNED", "Bu satış zaten iade edildi"),

  paymentAlreadyProcessed: (currentStatus: string) =>
    apiError(
      "PAYMENT_ALREADY_PROCESSED",
      `Bu ödeme zaten '${currentStatus}' durumunda. Tekrar işlem yapılamaz.`,
      { currentStatus },
    ),

  internal: () =>
    apiError("INTERNAL_ERROR", "Sunucu hatası oluştu"),
};
