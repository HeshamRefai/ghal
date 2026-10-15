# ADR-002: AI ليس System of Record + حوكمة الوكلاء

**الحالة:** مقبول — من Phase 0 ولا يتغير أبدًا

## القرار
كل ناتج من نموذج لغوي هو **مقترح** يمر عبر: Intent → Policy Check (P2) → Authorization → Risk Check → Execution → Evidence → Audit (P10) → Outcome.

- الحالة الوحيدة للحقيقة: PostgreSQL.
- لا يحتفظ الـLLM بأي حالة بين الطلبات.
- Model Gateway هو المدخل الوحيد للنماذج.

## اختبار إلزامي في CI
سيناريو: وكيل يطلب أداة خارج `allowed_tools` → يجب أن يرفضه P2 ويسجّل P10. أي build يفشل هذا الاختبار مرفوض.
