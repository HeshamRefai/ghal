# G-HAL — Adaptive Process Redesign System

> Infrastructure لفهم العمل التنظيمي، وإعادة تصميمه، وحوكمته، وتنفيذه، وقياسه، والتطوير المستمر له في عصر الـAgentic AI.

**الحالة:** Phase 0/1 — Foundation + Process Core منفّذان، قاعدة بيانات فعّالة، بيانات Pilot مدرجة.

## المصادر الحية

| المصدر | الرابط |
|--------|--------|
| مستودع الكود | https://github.com/HeshamRefai/ghal |
| قاعدة البيانات | https://glzrohbiswtokurwuwxx.supabase.co |
| وثيقة المعمارية الشاملة | [G-HAL-Complete-Deliverable.pdf](docs/G-HAL-Complete-Deliverable.pdf) |
| خطة التنفيذ | [G-HAL-Master-Execution-Plan.md](docs/G-HAL-Master-Execution-Plan.md) |

## المبادئ غير القابلة للكسر

1. **AI proposes — G-HAL controls.** الذكاء الاصطناعي يقترح ويستدل؛ النظام يملك الحالة والسياسة والتفويض والتنفيذ والتدقيق.
2. **كل فكرة في وثيقة المصدر لها بيت معماري** — 85/85 مغطاة.
3. **العملية مُصدَّرة، والسياسات خارج الكود، والأدلة قابلة للتتبع، والوكلاء محكومون.**
4. Modular Monolith — حدود Modules صارمة، استخراجها كخدمات لاحقًا ممكن دون إعادة بناء.

## البنية

```
apps/
  web/        Next.js — كل الواجهات (RTL Arabic)
  api/        REST API (Hono) + Seed
modules/      7 محركات + Model Gateway + Audit + Protocols + Governance
domain/       نموذج المجال الموحد
infrastructure/
  database/   migrations 0001_core + 0002_security (Supabase/Postgres)
tests/        Golden Dataset + اختبارات الحوكمة (إلزامية)
docs/         ADRs + Backlog + Architecture Reports
```

## الدورة الحياتية

```
DISCOVER → MODEL → AUDIT → GAUGE → DIAGNOSE → REDESIGN → ALLOCATE → SIMULATE
→ GOVERN → SPECIFY → EXECUTE → OBSERVE → MEASURE → LEARN → EVOLVE → REDESIGN
```

## التشغيل

```bash
pnpm install
# أنشئ .env.local من .env.example (المفاتيح موجودة)
pnpm db:push        # supabase db push
pnpm --filter @ghal/api seed   # بيانات Pilot
pnpm dev            # web + api
pnpm test           # unit + integration + governance
```

## قاعدة البيانات (Supabase)

| الجدول | الوظيفة |
|--------|---------|
| organizations | عزل Multi-tenant |
| users, roles, user_roles | RBAC |
| actors | بشر + وكلاء + أنظمة (ثقة + سمعة) |
| processes, process_versions | نسخ العمليات |
| process_modules, process_steps, process_transitions | IR مفرّغ |
| cases, events | Event Sourcing |
| policies, parameters | Policy-as-Code + parameters خارج الكود |
| decisions, approvals | قرارات بأدلة + اعتماد |
| exceptions | استثناءات + تصنيف |
| audit_events | Append-only + SHA-256 hash chaining |
| change_proposals | تطوير مستمر |
| process_memories | ذاكرة العملية |

**الأمان:**
- RLS على 18 جدول — كل استعلام يمر عبر `current_tenant()`
- Audit Events: Append-only + SHA-256 chain + trigger `audit_chain()`
- `REVOKE UPDATE/DELETE` على audit_events

## Pilot: Invoice Processing

4 وحدات (Intake → Validation → Approval → Payment)، 5 خطوات، 3 KPIs (Cycle Time, Exception Rate, Auto-Approval).

## الاختبارات (CI = Gate)

| النوع | الوصف |
|-------|-------|
| Governance Tests | Deny by default, Agent tool abuse blocked, Approval thresholds |
| IR Validation | Outcome-First, no ALLOW on approval, no ALLOW on high-risk |
| Protocol Tests | P2, P4, P5, P7 transitions — illegal transitions throw |
| Runtime Tests | Authorization before execution, Autonomy boundary |

## المتبقي (Phases 2–7)

- Phase 2: Intelligence engines (Genome, Friction, Bottleneck, Anomaly)
- Phase 3: ZBPR + Allocation + Autonomy Boundary + Attention Router
- Phase 4: Simulation (Scenario runner, What-if, Stress)
- Phase 5: Governance (Provenance, Trust Score, Regulatory Adapter)
- Phase 6: Exception → Evolution trigger
- Phase 7: Memory + A.G.E.N.T wizard + Golden Dataset

## المراجع

- `docs/architecture/` — التقرير المعماري الكامل
- `docs/execution-plan/` — خطة التنفيذ الشاملة
- `docs/adr/` — قرارات معمارية (ADR-001, ADR-002)
- `docs/backlog/` — تفاصيل كل Phase → Tasks
