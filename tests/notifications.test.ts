import { describe, expect, it } from 'vitest';
import { RequestStatus } from '@prisma/client';
import { renderTemplate, templateForStatus } from '../src/server/notifications/templates.js';

const CTX = {
  orgName: 'جمعية بادر للأجهزة الطبية',
  beneficiaryName: 'عائشة عبدالله محمد الزهراني',
  requestNo: 'AID-2026-00042',
};

describe('قوالب الإشعارات', () => {
  it('ترسل عند المحطات التي تعني المستفيد فقط', () => {
    expect(templateForStatus(RequestStatus.submitted)).toBe('request_submitted');
    expect(templateForStatus(RequestStatus.approved)).toBe('request_approved');
    expect(templateForStatus(RequestStatus.rejected)).toBe('request_rejected');
    expect(templateForStatus(RequestStatus.delivered)).toBe('request_delivered');
  });

  it('لا ترسل عن المراحل الداخلية', () => {
    // الفرز والمستودع والمشتريات شأن داخلي؛ إشعار عنها يدرّب المستفيد
    // على تجاهل رسائلنا.
    for (const status of [
      RequestStatus.screening,
      RequestStatus.warehouse,
      RequestStatus.purchasing,
      RequestStatus.draft,
    ]) {
      expect(templateForStatus(status), status).toBeNull();
    }
  });

  it('تخاطب بالاسم الأول لا بالاسم الرباعي', () => {
    const body = renderTemplate('request_submitted', CTX);
    expect(body).toContain('عائشة');
    expect(body).not.toContain('الزهراني');
  });

  it('تذكر رقم الطلب واسم الجمعية في كل رسالة', () => {
    for (const key of [
      'request_submitted',
      'request_approved',
      'request_rejected',
      'request_ready',
      'order_issued',
      'request_delivered',
    ] as const) {
      const body = renderTemplate(key, CTX);
      expect(body, key).toContain('AID-2026-00042');
      expect(body, key).toContain('جمعية بادر');
    }
  });

  it('لا تذكر أي تفصيل صحي أو اسم جهاز', () => {
    // الرسالة تصل هاتفًا قد يقرأه غير صاحبه.
    const forbidden = ['سرير', 'كرسي', 'حفاض', 'أكسجين', 'مرض', 'تقرير طبي'];
    for (const key of [
      'request_submitted',
      'request_approved',
      'request_ready',
      'order_issued',
      'request_delivered',
    ] as const) {
      const body = renderTemplate(key, CTX);
      for (const word of forbidden) {
        expect(body.includes(word), `${key} تذكر «${word}»`).toBe(false);
      }
    }
  });

  it('تُدرج سبب الرفض والتأجيل حين يوجد، وتحذفه حين لا يوجد', () => {
    const withReason = renderTemplate('request_rejected', {
      ...CTX,
      reason: 'لا ينطبق عليه شرط الاستحقاق.',
    });
    expect(withReason).toContain('لا ينطبق عليه شرط الاستحقاق.');

    const without = renderTemplate('request_rejected', CTX);
    expect(without).not.toContain('السبب:');
  });

  it('رسالة رمز الدخول تحذّر من مشاركته', () => {
    const body = renderTemplate('otp', { ...CTX, code: '123456' });
    expect(body).toContain('123456');
    expect(body).toContain('لا تشاركه');
    // لا تذكر رقم طلب — الرمز خارج سياق أي طلب.
    expect(body).not.toContain('AID-');
  });
});
