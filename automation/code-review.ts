/**
 * Ticarium365 — Otomatik Kod Review Modülü
 * Kullanım: npx tsx automation/code-review.ts <dosya_yolu>
 *
 * Örnek: npx tsx automation/code-review.ts artifacts/api-server/src/routes/sales.ts
 */

import { readFileSync } from "fs";
import { askClaude } from "./claude-client.js";

const SYSTEM_PROMPT = `Sen Ticarium365 projesinin kıdemli TypeScript/Node.js geliştiricisisin.
Proje bir Türk SaaS ERP platformu: çok kiracılı (multi-tenant), Express.js backend, Drizzle ORM, PostgreSQL.

Kod inceleme yaparken şunlara odaklan:
1. Veri tutarlılığı: transaction eksikliği, race condition
2. N+1 sorgu sorunları
3. TypeScript tip güvenliği (any kullanımı)
4. Hata yönetimi tutarsızlıkları
5. Güvenlik açıkları
6. Performans sorunları

Her bulgu için şu formatı kullan:
🔴 KRİTİK | 🟡 ORTA | 🟢 DÜŞÜK

Türkçe yanıt ver. Cursor'a yapıştırılabilir düzeltme prompt'u ekle.`;

async function reviewFile(filePath: string): Promise<void> {
  console.log(`\n📂 İnceleniyor: ${filePath}\n`);

  let code: string;
  try {
    code = readFileSync(filePath, "utf-8");
  } catch {
    console.error(`❌ Dosya okunamadı: ${filePath}`);
    process.exit(1);
  }

  const prompt = `Aşağıdaki dosyayı incele ve sorunları raporla:

Dosya: ${filePath}

\`\`\`typescript
${code}
\`\`\`

Her sorun için:
1. Sorunun ne olduğunu açıkla
2. Neden önemli olduğunu belirt
3. Cursor'a verebileceğim düzeltme prompt'unu yaz`;

  try {
    const review = await askClaude(prompt, { systemPrompt: SYSTEM_PROMPT });
    console.log("═".repeat(60));
    console.log(review);
    console.log("═".repeat(60));
  } catch (err) {
    console.error("❌ Claude API hatası:", err);
    process.exit(1);
  }
}

// CLI: node code-review.ts <dosya>
const filePath = process.argv[2];
if (!filePath) {
  console.error("Kullanım: npx tsx automation/code-review.ts <dosya_yolu>");
  process.exit(1);
}

await reviewFile(filePath);
