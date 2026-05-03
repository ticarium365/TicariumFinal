/**
 * Ticarium365 — Cursor Prompt Üretici
 * Bilinen sorunlar için hazır Cursor prompt'ları üretir.
 *
 * Kullanım: npx tsx automation/cursor-prompts.ts <sorun_kodu>
 * Örnek:    npx tsx automation/cursor-prompts.ts K1
 */

import { askClaude } from "./claude-client.js";
import { readFileSync } from "fs";

const SYSTEM_PROMPT = `Sen Ticarium365 projesinin kıdemli geliştiricisisin.
Cursor AI için net, uygulanabilir prompt'lar yazıyorsun.
Prompt'lar şu özelliklere sahip olmalı:
- Hangi dosyayı değiştireceğini belirt
- Tam olarak ne yapılacağını açıkla
- Mevcut kodu bozmayacak şekilde yaz
- TypeScript ve Drizzle ORM kullan
- Türkçe yorum satırları ekle`;

const KNOWN_ISSUES: Record<string, { title: string; file: string; description: string }> = {
  K1: {
    title: "Satış + Stok Transaction",
    file: "artifacts/api-server/src/routes/sales.ts",
    description: `POST /sales endpoint'inde satış kaydı (INSERT), stok güncellemesi (UPDATE) ve 
    stok hareketi (INSERT stockMovements) ayrı query'ler olarak çalışıyor. 
    Sunucu herhangi bir adımda çökerse veri tutarsız kalır.
    db.transaction() bloğu içine alınmalı.`,
  },
  K2: {
    title: "N+1 Sorunu — formatProduct",
    file: "artifacts/api-server/src/routes/products.ts",
    description: `formatProduct() fonksiyonu her ürün için 2 ek DB sorgusu çalıştırıyor 
    (views30Days ve sales30Days). Ürün listesi endpoint'i 100 ürün döndürürse 201 sorgu oluyor.
    LEFT JOIN ile tek sorguda çözülmeli.`,
  },
  K3: {
    title: "Duplicate Endpoint — generate-barcode",
    file: "artifacts/api-server/src/routes/products.ts",
    description: `GET /generate-barcode ve POST /generate-barcode birebir aynı kodu içeriyor.
    POST versiyonu kaldırılmalı, sadece GET kalmalı.`,
  },
  O1: {
    title: "Ham 500 Hataları",
    file: "artifacts/api-server/src/routes/",
    description: `36 route dosyasında res.status(500).json({ error: "Internal Server Error" }) 
    kullanılıyor, Errors.internal() helper'ı yerine. Tutarsız hata formatı.`,
  },
  O2: {
    title: "Zod Sürüm Karmaşası",
    file: "artifacts/api-server/src/routes/",
    description: `Bazı dosyalar 'zod', bazıları 'zod/v4' import ediyor. 
    Tek sürüme standardize edilmeli.`,
  },
};

async function generateCursorPrompt(issueCode: string): Promise<void> {
  const issue = KNOWN_ISSUES[issueCode];
  if (!issue) {
    console.error(`❌ Bilinmeyen sorun kodu: ${issueCode}`);
    console.log("Mevcut kodlar:", Object.keys(KNOWN_ISSUES).join(", "));
    process.exit(1);
  }

  console.log(`\n🔧 ${issueCode}: ${issue.title}\n`);

  // Dosyayı oku (varsa)
  let fileContent = "";
  try {
    fileContent = readFileSync(issue.file, "utf-8").slice(0, 3000); // İlk 3000 karakter
  } catch {
    fileContent = "(dosya okunamadı, genel prompt üretiliyor)";
  }

  const prompt = `Şu sorun için Cursor AI'a verebileceğim HAZIR bir prompt yaz:

SORUN: ${issue.title}
DOSYA: ${issue.file}
AÇIKLAMA: ${issue.description}

DOSYA İÇERİĞİ (ilk kısım):
\`\`\`typescript
${fileContent}
\`\`\`

Cursor prompt'u şu formatta olsun:
1. Hangi dosyayı aç
2. Ne yapılacağı (adım adım)
3. Örnek kod değişikliği (before/after)
4. Test edilmesi gerekenler

Prompt direkt kopyalanıp Cursor'a yapıştırılabilir olsun.`;

  try {
    const cursorPrompt = await askClaude(prompt, { systemPrompt: SYSTEM_PROMPT });
    console.log("═".repeat(60));
    console.log("📋 CURSOR PROMPT — Kopyala ve Cursor'a yapıştır:\n");
    console.log(cursorPrompt);
    console.log("═".repeat(60));
  } catch (err) {
    console.error("❌ Claude API hatası:", err);
  }
}

const issueCode = process.argv[2]?.toUpperCase();
if (!issueCode) {
  console.log("Kullanım: npx tsx automation/cursor-prompts.ts <KOD>");
  console.log("Mevcut kodlar:", Object.keys(KNOWN_ISSUES).join(", "));
  process.exit(1);
}

await generateCursorPrompt(issueCode);
