import { describe, expect, it } from 'vitest';
import { Role, RequestStatus } from '@prisma/client';
import {
  allowedTransitions,
  checkTransition,
  inboxStatusesFor,
  isTerminal,
} from '@/lib/workflow';

describe('آلة الحالات — المسارات المسموحة', () => {
  it('تسمح بالمسار الكامل من المسودة حتى التسليم', () => {
    const path: [RequestStatus, RequestStatus, Role][] = [
      [RequestStatus.draft, RequestStatus.submitted, Role.reception],
      [RequestStatus.submitted, RequestStatus.screening, Role.screener],
      [RequestStatus.screening, RequestStatus.approved, Role.screener],
      [RequestStatus.approved, RequestStatus.warehouse, Role.warehouse],
      [RequestStatus.warehouse, RequestStatus.ready_to_issue, Role.warehouse],
      [RequestStatus.ready_to_issue, RequestStatus.order_issued, Role.finance],
      [RequestStatus.order_issued, RequestStatus.delivered, Role.finance],
    ];

    for (const [from, to, role] of path) {
      expect(checkTransition({ from, to, role }), `${from} → ${to}`).toMatchObject({ ok: true });
    }
  });

  it('تسمح بالذهاب للمشتريات والعودة للمستودع', () => {
    expect(
      checkTransition({
        from: RequestStatus.warehouse,
        to: RequestStatus.purchasing,
        role: Role.warehouse,
      }),
    ).toMatchObject({ ok: true });

    expect(
      checkTransition({
        from: RequestStatus.purchasing,
        to: RequestStatus.warehouse,
        role: Role.purchasing,
      }),
    ).toMatchObject({ ok: true });
  });
});

describe('آلة الحالات — المسارات المرفوضة', () => {
  it('ترفض القفز من المسودة إلى التسليم مباشرة', () => {
    expect(
      checkTransition({
        from: RequestStatus.draft,
        to: RequestStatus.delivered,
        role: Role.admin,
      }),
    ).toMatchObject({ ok: false });
  });

  it('ترفض الرجوع من معتمد إلى قيد الفرز', () => {
    expect(
      checkTransition({
        from: RequestStatus.approved,
        to: RequestStatus.screening,
        role: Role.admin,
      }),
    ).toMatchObject({ ok: false });
  });

  it('ترفض أي انتقال من حالة نهائية', () => {
    for (const terminal of [
      RequestStatus.rejected,
      RequestStatus.delivered,
      RequestStatus.cancelled,
    ]) {
      expect(isTerminal(terminal)).toBe(true);
      expect(
        checkTransition({ from: terminal, to: RequestStatus.screening, role: Role.admin }),
      ).toMatchObject({ ok: false });
    }
  });

  it('ترفض الانتقال إلى نفس الحالة', () => {
    expect(
      checkTransition({
        from: RequestStatus.screening,
        to: RequestStatus.screening,
        role: Role.admin,
      }),
    ).toMatchObject({ ok: false });
  });
});

describe('آلة الحالات — الصلاحيات', () => {
  it('لا يعتمد المستودع طلبًا', () => {
    expect(
      checkTransition({
        from: RequestStatus.screening,
        to: RequestStatus.approved,
        role: Role.warehouse,
      }),
    ).toMatchObject({ ok: false });
  });

  it('لا يصدر الفرز أمر صرف', () => {
    expect(
      checkTransition({
        from: RequestStatus.ready_to_issue,
        to: RequestStatus.order_issued,
        role: Role.screener,
      }),
    ).toMatchObject({ ok: false });
  });

  it('المطّلع لا يملك أي انتقال', () => {
    for (const status of Object.values(RequestStatus)) {
      expect(allowedTransitions(status, Role.viewer)).toHaveLength(0);
    }
  });
});

describe('آلة الحالات — السبب الإجباري', () => {
  it('ترفض الرفض والتأجيل والإلغاء بلا سبب', () => {
    const cases: [RequestStatus, RequestStatus, Role][] = [
      [RequestStatus.screening, RequestStatus.rejected, Role.screener],
      [RequestStatus.screening, RequestStatus.on_hold, Role.screener],
      [RequestStatus.screening, RequestStatus.cancelled, Role.screener],
    ];

    for (const [from, to, role] of cases) {
      expect(checkTransition({ from, to, role }), `${to} بلا سبب`).toMatchObject({ ok: false });
      expect(
        checkTransition({ from, to, role, reason: 'سبب مكتوب' }),
        `${to} بسبب`,
      ).toMatchObject({ ok: true });
    }
  });

  it('ترفض سببًا من مسافات فقط', () => {
    expect(
      checkTransition({
        from: RequestStatus.screening,
        to: RequestStatus.rejected,
        role: Role.screener,
        reason: '   ',
      }),
    ).toMatchObject({ ok: false });
  });
});

describe('التأجيل والعودة منه', () => {
  it('يمكن العودة من التأجيل إلى أي مرحلة تشغيلية سابقة', () => {
    for (const stage of [
      RequestStatus.submitted,
      RequestStatus.screening,
      RequestStatus.approved,
      RequestStatus.warehouse,
      RequestStatus.purchasing,
      RequestStatus.ready_to_issue,
    ]) {
      expect(
        checkTransition({
          from: RequestStatus.on_hold,
          to: stage,
          role: Role.screener,
          reason: 'استئناف',
        }),
      ).toMatchObject({ ok: true });
    }
  });
});

describe('صندوق مهامي', () => {
  it('يعطي كل دور مراحله فقط', () => {
    expect(inboxStatusesFor(Role.screener)).toEqual(
      expect.arrayContaining([RequestStatus.submitted, RequestStatus.screening]),
    );
    expect(inboxStatusesFor(Role.screener)).not.toContain(RequestStatus.purchasing);
    expect(inboxStatusesFor(Role.purchasing)).toEqual([RequestStatus.purchasing]);
    expect(inboxStatusesFor(Role.viewer)).toHaveLength(0);
  });
});
