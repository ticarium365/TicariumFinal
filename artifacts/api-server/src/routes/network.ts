import { Router, Request, Response } from "express";
import { db, companiesTable, companyNetworkProfilesTable, companyNetworkReviewsTable } from "@workspace/db";
import { eq, and, ilike, or, desc, asc, count, avg, inArray, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";
import { z } from "zod";

const router = Router();

const updateProfileSchema = z.object({
  sector: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  description: z.string().max(1000).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  isVisible: z.boolean().optional(),
  showStock: z.boolean().optional(),
  showPrice: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  showLocation: z.boolean().optional(),
  acceptOffers: z.boolean().optional(),
  acceptOrders: z.boolean().optional(),
  isAnonymous: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

async function getOrCreateProfile(companyId: number) {
  const existing = await db
    .select()
    .from(companyNetworkProfilesTable)
    .where(eq(companyNetworkProfilesTable.companyId, companyId))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(companyNetworkProfilesTable)
    .values({ companyId })
    .returning();
  return created;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const { search, city, sector, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(String(page)));
    const limitNum = Math.min(50, parseInt(String(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [
      eq(companyNetworkProfilesTable.isVisible, true),
    ];

    if (city) conditions.push(ilike(companyNetworkProfilesTable.city, String(city)));
    if (sector) conditions.push(ilike(companyNetworkProfilesTable.sector, String(sector)));

    const whereClause = and(...conditions);

    const [profiles, totalResult] = await Promise.all([
      db
        .select({
          id: companyNetworkProfilesTable.id,
          companyId: companyNetworkProfilesTable.companyId,
          sector: companyNetworkProfilesTable.sector,
          city: companyNetworkProfilesTable.city,
          district: companyNetworkProfilesTable.district,
          description: companyNetworkProfilesTable.description,
          website: companyNetworkProfilesTable.website,
          isAnonymous: companyNetworkProfilesTable.isAnonymous,
          showPhone: companyNetworkProfilesTable.showPhone,
          showLocation: companyNetworkProfilesTable.showLocation,
          showPrice: companyNetworkProfilesTable.showPrice,
          acceptOffers: companyNetworkProfilesTable.acceptOffers,
          acceptOrders: companyNetworkProfilesTable.acceptOrders,
          trustScore: companyNetworkProfilesTable.trustScore,
          reviewCount: companyNetworkProfilesTable.reviewCount,
          tags: companyNetworkProfilesTable.tags,
          isOnline: companyNetworkProfilesTable.isOnline,
          lastSeenAt: companyNetworkProfilesTable.lastSeenAt,
          phone: companyNetworkProfilesTable.phone,
          companyName: companiesTable.name,
          companySubdomain: companiesTable.subdomain,
          companyLogo: companiesTable.logoUrl,
          companyColor: companiesTable.primaryColor,
          address: companyNetworkProfilesTable.address,
          latitude: companyNetworkProfilesTable.latitude,
          longitude: companyNetworkProfilesTable.longitude,
        })
        .from(companyNetworkProfilesTable)
        .innerJoin(companiesTable, eq(companiesTable.id, companyNetworkProfilesTable.companyId))
        .where(whereClause)
        .orderBy(desc(companyNetworkProfilesTable.trustScore), desc(companyNetworkProfilesTable.reviewCount))
        .limit(limitNum)
        .offset(offset),
      db
        .select({ count: count() })
        .from(companyNetworkProfilesTable)
        .where(whereClause),
    ]);

    const enriched = profiles.map((p) => ({
      ...p,
      companyName: p.isAnonymous ? "Anonim Firma" : p.companyName,
      companyLogo: p.isAnonymous ? null : p.companyLogo,
      phone: p.showPhone ? p.phone : null,
      latitude: p.showLocation ? p.latitude : null,
      longitude: p.showLocation ? p.longitude : null,
    }));

    res.json({
      companies: enriched,
      total: totalResult[0]?.count ?? 0,
      page: pageNum,
      totalPages: Math.ceil((totalResult[0]?.count ?? 0) / limitNum),
    });
  } catch (err) {
    req.log?.error({ err }, "Network list error");
    res.status(500).json(Errors.internal());
  }
});

router.get("/my-profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const profile = await getOrCreateProfile(req.companyId);
    res.json(profile);
  } catch (err) {
    req.log?.error({ err }, "Get my network profile error");
    res.status(500).json(Errors.internal());
  }
});

router.put("/my-profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Geçersiz veri" });

    await getOrCreateProfile(req.companyId);

    const [updated] = await db
      .update(companyNetworkProfilesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(companyNetworkProfilesTable.companyId, req.companyId))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log?.error({ err }, "Update network profile error");
    res.status(500).json(Errors.internal());
  }
});

router.get("/companies/:subdomain", async (req: Request, res: Response) => {
  try {
    const { subdomain } = req.params;

    const company = await db
      .select()
      .from(companiesTable)
      .where(and(eq(companiesTable.subdomain, subdomain), eq(companiesTable.isActive, true)))
      .limit(1);

    if (!company.length) return void res.status(404).json({ error: "Firma bulunamadı" });

    const profile = await db
      .select()
      .from(companyNetworkProfilesTable)
      .where(
        and(
          eq(companyNetworkProfilesTable.companyId, company[0].id),
          eq(companyNetworkProfilesTable.isVisible, true)
        )
      )
      .limit(1);

    if (!profile.length) return void res.status(404).json({ error: "Firma profili bulunamadı" });

    const p = profile[0];
    const reviews = await db
      .select({
        id: companyNetworkReviewsTable.id,
        rating: companyNetworkReviewsTable.rating,
        comment: companyNetworkReviewsTable.comment,
        createdAt: companyNetworkReviewsTable.createdAt,
        fromCompanyName: companiesTable.name,
        fromCompanySubdomain: companiesTable.subdomain,
      })
      .from(companyNetworkReviewsTable)
      .innerJoin(companiesTable, eq(companiesTable.id, companyNetworkReviewsTable.fromCompanyId))
      .where(eq(companyNetworkReviewsTable.toCompanyId, company[0].id))
      .orderBy(desc(companyNetworkReviewsTable.createdAt))
      .limit(20);

    res.json({
      profile: {
        ...p,
        companyName: p.isAnonymous ? "Anonim Firma" : company[0].name,
        companySubdomain: company[0].subdomain,
        companyLogo: p.isAnonymous ? null : company[0].logoUrl,
        companyColor: company[0].primaryColor,
        phone: p.showPhone ? p.phone : null,
        latitude: p.showLocation ? p.latitude : null,
        longitude: p.showLocation ? p.longitude : null,
      },
      reviews,
    });
  } catch (err) {
    req.log?.error({ err }, "Get company profile error");
    res.status(500).json(Errors.internal());
  }
});

router.post("/companies/:subdomain/reviews", requireAuth, async (req: Request, res: Response) => {
  try {
    const { subdomain } = req.params;
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Geçersiz değerlendirme" });

    const targetCompany = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.subdomain, subdomain))
      .limit(1);

    if (!targetCompany.length) return void res.status(404).json({ error: "Firma bulunamadı" });
    if (targetCompany[0].id === req.companyId) {
      return void res.status(400).json({ error: "Kendi firmanızı değerlendiremezsiniz" });
    }

    const existing = await db
      .select()
      .from(companyNetworkReviewsTable)
      .where(
        and(
          eq(companyNetworkReviewsTable.fromCompanyId, req.companyId),
          eq(companyNetworkReviewsTable.toCompanyId, targetCompany[0].id)
        )
      )
      .limit(1);

    let review;
    if (existing.length > 0) {
      [review] = await db
        .update(companyNetworkReviewsTable)
        .set({ rating: parsed.data.rating, comment: parsed.data.comment })
        .where(eq(companyNetworkReviewsTable.id, existing[0].id))
        .returning();
    } else {
      [review] = await db
        .insert(companyNetworkReviewsTable)
        .values({
          fromCompanyId: req.companyId,
          toCompanyId: targetCompany[0].id,
          rating: parsed.data.rating,
          comment: parsed.data.comment,
        })
        .returning();
    }

    const avgResult = await db
      .select({ avg: avg(companyNetworkReviewsTable.rating), cnt: count() })
      .from(companyNetworkReviewsTable)
      .where(eq(companyNetworkReviewsTable.toCompanyId, targetCompany[0].id));

    const newScore = parseFloat(String(avgResult[0]?.avg ?? 0));
    const newCount = avgResult[0]?.cnt ?? 0;

    await db
      .update(companyNetworkProfilesTable)
      .set({ trustScore: newScore, reviewCount: newCount })
      .where(eq(companyNetworkProfilesTable.companyId, targetCompany[0].id));

    res.status(201).json(review);
  } catch (err) {
    req.log?.error({ err }, "Add review error");
    res.status(500).json(Errors.internal());
  }
});

router.get("/meta/sectors", (_req: Request, res: Response) => {
  res.json([
    "Gıda ve İçecek", "Tekstil ve Hazır Giyim", "İnşaat Malzemeleri", "Elektrik ve Elektronik",
    "Makine ve Ekipman", "Kimya ve Plastik", "Metal ve Çelik", "Mobilya ve Dekorasyon",
    "Otomotiv ve Yedek Parça", "Tarım ve Hayvancılık", "Ambalaj ve Kağıt", "Baskı ve Yayıncılık",
    "Medikal ve Sağlık", "Bilişim ve Yazılım", "Lojistik ve Taşımacılık", "Temizlik ve Hijyen",
    "Güvenlik Sistemleri", "Turizm ve Konaklama", "Perakende", "Toptan Ticaret",
    "Danışmanlık ve Hizmet", "Eğitim", "Diğer",
  ]);
});

router.get("/meta/cities", (_req: Request, res: Response) => {
  res.json([
    "Adana", "Ankara", "Antalya", "Balıkesir", "Bursa", "Denizli", "Diyarbakır",
    "Erzurum", "Eskişehir", "Gaziantep", "Hatay", "İstanbul", "İzmir", "Kayseri",
    "Kocaeli", "Konya", "Malatya", "Manisa", "Mersin", "Muğla", "Ordu", "Sakarya",
    "Samsun", "Şanlıurfa", "Tekirdağ", "Trabzon", "Van", "Zonguldak", "Diğer",
  ]);
});

export default router;
