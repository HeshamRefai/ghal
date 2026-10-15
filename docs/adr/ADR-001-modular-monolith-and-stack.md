# ADR-001: Modular Monolith + Stack

**الحالة:** مقبول (Phase 0)

## القرار
Monorepo واحد (pnpm workspaces): Next.js للواجهة، REST API داخل نفس المنظومة، PostgreSQL عبر Supabase، استضافة Cloudflare، TypeScript صارم.

## البدائل المرفوضة
- Microservices: 7 محركات تتشارك النموذج والمعاملات؛ التوزيع الآن = حالة موزعة بلا فائدة
- Kubernetes: لا حاجة تشغيلية؛ Cloudflare + Supabase يكفيان للمVP
- Vector DB: لا مشكلة بحث دلالي بعد في MVP؛ JSONB يكفي
- Python Backend: النمذجة الإحصائية لاحقًا يمكن عبر worker؛ أغلب النظام Workflow/State منطق TS

## الأثر المستقبلي
كل module قابل للاستخراج كخدمة مستقلة عندما تثبت الحاجة.
