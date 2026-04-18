export default function KvkkPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 prose prose-zinc dark:prose-invert">
      <h1>KVKK Aydınlatma Metni</h1>
      <p className="text-sm text-zinc-500">Versiyon: v1.2026.04 — Yürürlük: Nisan 2026</p>

      <h2>1. Veri Sorumlusu</h2>
      <p>
        Ticarium365 SaaS platformu kapsamında işlenen kişisel veriler için veri sorumlusu,
        platformu kullandığınız tenant şirkettir. Ticarium365 (PROSAN ENDÜSTRİ) yalnızca
        veri işleyen sıfatıyla teknik altyapıyı sağlar.
      </p>

      <h2>2. İşlenen Kişisel Veriler</h2>
      <ul>
        <li><strong>Kimlik:</strong> Ad, soyad, kullanıcı adı</li>
        <li><strong>İletişim:</strong> E-posta, telefon</li>
        <li><strong>Müşteri/Tedarikçi:</strong> Vergi no, adres, banka bilgileri (yalnız iş kapsamında)</li>
        <li><strong>İşlem:</strong> Satış, stok hareketi, sipariş, ödeme kayıtları</li>
        <li><strong>Teknik:</strong> IP adresi, oturum verisi, tarayıcı bilgisi, çerezler</li>
      </ul>

      <h2>3. İşlenme Amacı ve Hukuki Sebep</h2>
      <ul>
        <li>Sözleşme ifası: Hizmet sunumu, fatura, lojistik (KVKK m.5/2-c)</li>
        <li>Hukuki yükümlülük: Vergi, e-fatura, e-arşiv (KVKK m.5/2-ç)</li>
        <li>Meşru menfaat: Güvenlik, dolandırıcılık önleme, ürün geliştirme (KVKK m.5/2-f)</li>
        <li>Açık rıza: Pazarlama iletişimi, opsiyonel çerezler (KVKK m.5/1)</li>
      </ul>

      <h2>4. Aktarım</h2>
      <p>
        Verileriniz; pazaryeri (Trendyol, Hepsiburada, N11), e-fatura entegratörleri (Paraşüt),
        SMS sağlayıcı (NetGSM), barındırma (Replit/Neon DB) ve resmi kurumlara (GİB) hizmet
        gereği veya hukuki yükümlülük çerçevesinde aktarılabilir.
      </p>

      <h2>5. Saklama Süresi</h2>
      <ul>
        <li>İşlem kayıtları: 10 yıl (TTK)</li>
        <li>E-fatura/e-arşiv: 5 yıl (VUK)</li>
        <li>Pazarlama izni: Geri alana kadar</li>
        <li>Hesap silme talebi: 30 gün soft-delete + hard-delete</li>
      </ul>

      <h2>6. Haklarınız (KVKK m.11)</h2>
      <p>
        İşlenen verilerinizi öğrenme, düzeltme, silme, aktarım talep etme ve itiraz etme
        hakkına sahipsiniz. Talepleriniz için panelde{" "}
        <strong>Ayarlar → Veri Hakları</strong> menüsünü veya{" "}
        <a href="mailto:kvkk@ticarium365.com">kvkk@ticarium365.com</a> adresini kullanabilirsiniz.
      </p>
      <ul>
        <li><strong>Veri Dışa Aktarma:</strong> Tüm verileriniz JSON formatında 7 gün içinde indirilir.</li>
        <li><strong>Veri Silme:</strong> Hesap 30 gün soft-delete edilir, ardından kalıcı silinir. Bu süre içinde iptal edebilirsiniz.</li>
      </ul>

      <h2>7. Çerez Politikası</h2>
      <p>
        Zorunlu çerezler (oturum, güvenlik) hizmetin işleyişi için gereklidir ve devre dışı
        bırakılamaz. Analitik ve pazarlama çerezleri açık rızaya tabidir; tercih banner'ından
        yönetebilirsiniz.
      </p>

      <h2>8. Veri Güvenliği</h2>
      <p>
        Veriler TLS 1.2+ ile şifrelenir, hassas alanlar AES-256-GCM ile saklanır,
        çoklu kiracı izolasyonu (tenant scoping + Row Level Security) uygulanır.
        İhlal durumunda 72 saat içinde KVKK Kuruluna ve etkilenen kişilere bildirim yapılır.
      </p>
    </div>
  );
}
