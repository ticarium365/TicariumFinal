import { db, auditLogsTable } from "@workspace/db";
import { Request } from "express";

export type AuditAction =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "USER_CREATE"
  | "USER_UPDATE"
  | "USER_DELETE"
  | "PRODUCT_CREATE"
  | "PRODUCT_UPDATE"
  | "PRODUCT_DELETE"
  | "SALE_CREATE"
  | "SALE_RETURN"
  | "STOCK_ADJUSTMENT"
  | "PAYMENT_SUBMIT"
  | "PAYMENT_CONFIRM"
  | "PAYMENT_REJECT"
  | "COMPANY_UPDATE"
  | "COMPANY_PLAN_CHANGE"
  | "SUBSCRIPTION_CHANGE"
  | "SUBSCRIPTION_CANCEL"
  | "SUBSCRIPTION_ADMIN_SET"
  | "PLATFORM_SETTINGS_UPDATE"
  | "CUSTOMER_CREATE"
  | "CUSTOMER_UPDATE"
  | "CUSTOMER_DELETE"
  | "CUSTOMER_RESTORE"
  | "CUSTOMER_PAYMENT"
  | "CUSTOMER_ADJUSTMENT"
  | "SALE_LINKED_CUSTOMER"
  | "SUPPLIER_CREATE"
  | "SUPPLIER_UPDATE"
  | "SUPPLIER_DELETE"
  | "SUPPLIER_RESTORE"
  | "SUPPLIER_PAYMENT"
  | "SUPPLIER_ADJUSTMENT"
  | "PURCHASE_CREATE"
  | "PRODUCT_COST_UPDATED"
  | "RFQ_CREATE"
  | "RFQ_CANCEL"
  | "RFQ_QUOTE"
  | "RFQ_DECLINE"
  | "RFQ_AWARD";

interface AuditParams {
  req: Request;
  action: AuditAction;
  entity?: string;
  entityId?: number;
  details?: unknown;
}

export async function audit({ req, action, entity, entityId, details }: AuditParams) {
  try {
    const user = req.session?.user;
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    await db.insert(auditLogsTable).values({
      companyId: req.companyId ?? user?.companyId ?? null,
      userId: user?.id ?? null,
      username: user?.username ?? null,
      action,
      entity: entity ?? null,
      entityId: entityId ?? null,
      details: details ? JSON.stringify(details) : null,
      ipAddress: ip,
    });
  } catch (err) {
    // Audit log hatası asla ana işlemi durdurmamalı
    console.error("Audit log yazma hatası:", err);
  }
}
