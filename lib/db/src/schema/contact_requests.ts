import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const contactRequestsTable = pgTable('contact_requests', {
  id: serial('id').primaryKey(),
  fullName: text('full_name').notNull(),
  companyName: text('company_name'),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  status: text('status').notNull().default('new'),
  notes: text('notes'),
  // Sprint E — Lead linkage: hangi satıcının CRM'ine düştü, hangi alıcı/RFQ'dan geldi.
  // Eski public form lead'leri için tüm alanlar nullable (geri uyumluluk).
  sellerCompanyId: integer('seller_company_id'),
  buyerCompanyId: integer('buyer_company_id'),
  rfqId: integer('rfq_id'),
  // 'public_form' | 'rfq' — kaynak ayrımı; CRM filtrelemesi için.
  sourceType: text('source_type').default('public_form'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  contactedAt: timestamp('contacted_at', { withTimezone: true }),
});

export type ContactRequest = typeof contactRequestsTable.$inferSelect;
export type NewContactRequest = typeof contactRequestsTable.$inferInsert;
