# G-HAL — Adaptive Process Redesign System

> Infrastructure لفهم العمل التنظيمي، وإعادة تصميمه، وحوكمته، وتنفيذه، وقياسه، والتطوير المستمر له في عصر الـAgentic AI.

## المبادئ غير القابلة للكسر

1. **AI proposes — G-HAL controls.** الذكاء الاصطناعي يقترح ويستدل؛ النظام يملك الحالة والسياسة والتفويض والتنفيذ والتدقيق.
2. **كل فكرة في وثيقة المصدر لها بيت معماري** — انظر Coverage Matrix في التقرير.
3. **العملية مُصدَّرة، والسياسات خارج الكود، والأدلة قابلة للتتبع، والوكلاء محكومون.**
4. Modular Monolith — حدود Modules صارمة، استخراجها كخدمات لاحقًا ممكن دون إعادة بناء.

## البنية

```
apps/
  web/        Next.js — كل الواجهات
  api/        REST API + Seed
modules/      7 محركات + Model Gateway + Audit + Protocols
domain/       نموذج المجال الموحد
infrastructure/
  database/   migrations (Supabase/Postgres)
tests/        Golden Dataset + اختبارات الحوكمة
docs/         ADRs + Backlog + API
```

## الدورة الحياتية

```
DISCOVER → MODEL → AUDIT → GAUGE → DIAGNOSE → REDESIGN → ALLOCATE → SIMULATE
→ GOVERN → SPECIFY → EXECUTE → OBSERVE → MEASURE → LEARN → EVOLVE → REDESIGN
```

## التشغيل

```bash
pnpm install
# أنشئ .env.local من .env.example
pnpm db:push        # supabase db push
pnpm --filter @ghal/api seed   # بيانات Pilot
pnpm dev            # web + api
pnpm test           # unit + integration + governance
```

## المراجع

- `docs/architecture/` — التقرير المعماري الكامل
- `docs/execution-plan/` — خطة التنفيذ الشاملة
