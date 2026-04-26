export default function KvkkPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 prose prose-zinc dark:prose-invert">
      <h1>KVKK Aydınlatma Metni</h1>
      <p className="text-sm text-zinc-500">Versiyon: v1.2026.04 — Yürürlük: Nisan 2026</p>
      <p>
        Bu metin, Ticarium365’i kullanırken hangi verilerin neden işlendiğini sade bir dille
        açıklamak için hazırlanmıştır. Amacımız verinizi toplamak değil; hesabınızı güvenli
        çalıştırmak, işletme kayıtlarınızı doğru tutmak ve talep ettiğiniz hizmeti sunmaktır.
      </p>

      <h2>1. Veri Sorumlusu</h2>
      <p>
        Ticarium365 SaaS platformu kapsamında işlenen müşteri/tedarikçi ve operasyon verileri
        için veri sorumlusu çoğunlukla platformu kullanan tenant şirkettir. Ticarium365 teknik
        altyapıyı sağlayan veri işleyen rolündedir. Kendi iletişim formlarımız ve destek
        taleplerimiz için Ticarium365 ilgili süreçte veri sorumlusu olarak hareket edebilir.
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
        Verileriniz; yalnızca hizmeti çalıştırmak için gerekli olduğunda pazaryeri sağlayıcıları,
        e-belge/e-fatura entegratörleri, SMS/e-posta sağlayıcıları, güvenli barındırma altyapısı
        ve resmi kurumlarla paylaşılabilir. Bu aktarım ticari amaçla veri satışı anlamına gelmez.
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
        Veriler TLS ile aktarılır, hassas alanlar şifreli saklanır ve her firmanın verisi
        kendi tenant alanı içinde tutulacak şekilde tasarlanır. Yetkisiz erişim riski için
        oturum, rol ve tenant sınırı kontrolleri uygulanır. İhlal durumunda yasal bildirim
        süreçleri işletilir.
      </p>
      <h2>9. Destek ve Başvuru</h2>
      <p>
        KVKK veya veri güvenliğiyle ilgili sorularınız için{" "}
        <a href="mailto:kvkk@ticarium365.com">kvkk@ticarium365.com</a> adresinden bize ulaşabilirsiniz.
        Destek taleplerinde kimliğinizi doğrulamak için ek bilgi isteyebiliriz; bu bilgi yalnızca
        talebinizi sonuçlandırmak için kullanılır.
      </p>
    </div>
  );
}
