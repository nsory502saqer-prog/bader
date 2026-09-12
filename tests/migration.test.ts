import { describe, expect, it } from 'vitest';
import { RequestStatus } from '@prisma/client';
import {
  extractSize,
  mapIncomeSource,
  mapStatus,
  monthFromSheetName,
  parseItemsCell,
  resolveStatus,
  splitCity,
} from '../scripts/migrate-excel/dictionaries.js';

/**
 * اختبارات قواميس الترحيل.
 * كل حالة هنا مأخوذة من قيمة موجودة فعلًا في ملف Excel الأصلي، لا مفترضة.
 */

describe('توحيد مصادر الدخل', () => {
  it('يطوي 22 صياغة إلى القائمة المعتمدة', () => {
    expect(mapIncomeSource('ضمان')).toBe('الضمان الاجتماعي');
    expect(mapIncomeSource('تقاعد')).toBe('متقاعد');
    expect(mapIncomeSource('متقاعد')).toBe('متقاعد');
    expect(mapIncomeSource('عاطل')).toBe('عاطل عن العمل');
    expect(mapIncomeSource('تأمينات')).toBe('التأمينات الاجتماعية');
    expect(mapIncomeSource('تامينات')).toBe('التأمينات الاجتماعية');
    expect(mapIncomeSource('تأهيل')).toBe('تأهيل شامل');
    expect(mapIncomeSource('تاهيل')).toBe('تأهيل شامل');
  });

  it('يوحّد كل صياغات «لا شيء»', () => {
    for (const raw of ['لاشي', 'لا شيء', 'لاشيء']) {
      expect(mapIncomeSource(raw), raw).toBe('لا يوجد دخل');
    }
  });

  it('يعيد null لما لا يُفهم بدل تخمينه', () => {
    expect(mapIncomeSource('ح م')).toBeNull();
    expect(mapIncomeSource('')).toBeNull();
  });
});

describe('توحيد الحالات', () => {
  it('يطوي كل صياغات «تم إصدار أمر صرف ومهمة» السبع إلى حالة واحدة', () => {
    const variants = [
      'تم اصدار امر صرف ومهمه',
      'تم إصدار مسير صرف وإنشاء مهمة',
      'تم اصدارامرصرف ومهمه',
      'تم اصدار أمر صرف ومهمه',
      'تم اصدار امر صرف ومهمة',
      'تم أصدار امر صرف ومهمة',
      'تم إصدار أمر صرف ومهمه',
      'تم الصرف وانشاء مهمة',
      'تم اصدارامرصرف',
    ];
    for (const raw of variants) {
      expect(mapStatus(raw), raw).toBe(RequestStatus.order_issued);
    }
  });

  it('يفهم بقية القيم الفعلية', () => {
    expect(mapStatus('منجز')).toBe(RequestStatus.delivered);
    expect(mapStatus('مشتروات')).toBe(RequestStatus.purchasing);
    expect(mapStatus('مشترواات')).toBe(RequestStatus.purchasing);
    expect(mapStatus('جاهز للصرف')).toBe(RequestStatus.ready_to_issue);
    expect(mapStatus('يوجل')).toBe(RequestStatus.on_hold);
    expect(mapStatus('ملغي')).toBe(RequestStatus.cancelled);
    expect(mapStatus('مرفوض')).toBe(RequestStatus.rejected);
  });

  it('يختار أبعد مرحلة وصلها الطلب عند تعارض الأعمدة', () => {
    // «مشتروات» في عمود و«منجز» في آخر: الطلب انتهى فعلًا.
    expect(resolveStatus(['مشتروات', 'منجز']).status).toBe(RequestStatus.delivered);
    expect(resolveStatus(['جاهز للصرف', 'تم اصدار امر صرف ومهمه']).status).toBe(
      RequestStatus.order_issued,
    );
  });

  it('يعتمد «مقدَّم» عند غياب أي قيمة مفهومة، ويعلّم ذلك', () => {
    const result = resolveStatus([null, '', 'قيمة غريبة']);
    expect(result.status).toBe(RequestStatus.submitted);
    expect(result.matched).toBe(false);
  });
});

describe('تفكيك المدينة والحي', () => {
  it('يفصل «جده الحمدانية» إلى مدينة وحي', () => {
    expect(splitCity('جده الحمدانية')).toEqual({ city: 'جدة', district: 'الحمدانية' });
    expect(splitCity('جده الصفا')).toEqual({ city: 'جدة', district: 'الصفا' });
  });

  it('يقبل المدينة وحدها بلا حي', () => {
    expect(splitCity('الطائف')).toEqual({ city: 'الطائف', district: null });
    expect(splitCity('خليص')).toEqual({ city: 'خليص', district: null });
  });

  it('يوحّد «جده» و«جدة»', () => {
    expect(splitCity('جدة النسيم').city).toBe('جدة');
    expect(splitCity('جده النسيم').city).toBe('جدة');
  });

  it('يترك المدينة فارغة إن لم يعرفها بدل أن يخمّنها', () => {
    expect(splitCity('عسفان')).toEqual({ city: null, district: 'عسفان' });
  });
});

describe('استخراج المقاس', () => {
  it('يميّز اكس اكس لارج عن اكس لارج عن لارج', () => {
    expect(extractSize('حفاضات كلوت مقاس اكس اكس لارج').size).toBe('XXL');
    expect(extractSize('حفائظ مقاس اكس لارج').size).toBe('XL');
    expect(extractSize('حفائظ مقاس لارج').size).toBe('L');
    expect(extractSize('حفاضات لاصق مقاس ميديم').size).toBe('M');
  });

  it('يعيد null لصنف بلا مقاس', () => {
    expect(extractSize('مفارش طبية').size).toBeNull();
  });
});

describe('تفكيك خلية البنود', () => {
  it('يحوّل نص خلية واحدة إلى بنود مستقلة', () => {
    const items = parseItemsCell('سرير طبي كهربائي ، مرتبة طبية عادية', 'LARTAH');
    expect(items).toHaveLength(2);
    expect(items[0]?.itemName).toBe('سرير طبي كهربائي');
    expect(items[1]?.itemName).toBe('مرتبة طبية عادية');
  });

  it('يستخرج الصنف والمقاس معًا', () => {
    const items = parseItemsCell('حفاضات كلوت مقاس اكس اكس لارج', 'PATIENT_CARE');
    expect(items[0]?.itemName).toBe('حفاضات كلوت');
    expect(items[0]?.size).toBe('XXL');
  });

  it('يحفظ النص الأصلي دائمًا حتى عند نجاح المطابقة', () => {
    const items = parseItemsCell('حفائظ مقاس لارج', 'PATIENT_CARE');
    expect(items[0]?.itemName).toBe('حفاضات لاصق');
    expect(items[0]?.legacyText).toBe('حفائظ مقاس لارج');
  });

  it('يتجاهل «لاشي» ولا ينتج منها بندًا', () => {
    expect(parseItemsCell('لاشي')).toHaveLength(0);
    expect(parseItemsCell('لا شيء')).toHaveLength(0);
    expect(parseItemsCell('')).toHaveLength(0);
    expect(parseItemsCell(null)).toHaveLength(0);
  });

  it('يفصل على الفاصلة العربية واللاتينية معًا', () => {
    expect(parseItemsCell('مفارش طبية, مناديل مبللة', 'PATIENT_CARE')).toHaveLength(2);
    expect(parseItemsCell('مفارش طبية، مناديل مبللة', 'PATIENT_CARE')).toHaveLength(2);
  });

  it('يلتقط بادئة «تبديل» كملاحظة لا كجزء من اسم الصنف', () => {
    const items = parseItemsCell('تبديل سرير طبي كهربائي', 'LARTAH');
    expect(items[0]?.itemName).toBe('سرير طبي كهربائي');
    expect(items[0]?.note).toBe('استبدال');
  });

  it('يحسم الكلمة المبهمة بسياق عمود البرنامج', () => {
    // «هوائية» وحدها لا تعني شيئًا، وفي عمود لارتاح تعني المرتبة.
    expect(parseItemsCell('هوائية', 'LARTAH')[0]?.itemName).toBe('مرتبة طبية هوائية');
    expect(parseItemsCell('هوائية')[0]?.itemName).toBeNull();
  });

  it('يترك ما لا يعرفه بلا مطابقة بدل أن ينسبه لصنف خاطئ', () => {
    const items = parseItemsCell('حليب بديا شور نكهه الشوكولاتة', 'PATIENT_CARE');
    expect(items[0]?.itemName).toBeNull();
    expect(items[0]?.legacyText).toBe('حليب بديا شور نكهه الشوكولاتة');
  });
});

describe('أسماء الشهور', () => {
  it('يقرأ اسم الشيت كشهر', () => {
    expect(monthFromSheetName('يناير')).toBe(1);
    expect(monthFromSheetName('سبتمبر')).toBe(9);
    expect(monthFromSheetName(' يونيو ')).toBe(6);
  });

  it('يعيد null لاسم غير معروف', () => {
    expect(monthFromSheetName('ملخص')).toBeNull();
  });
});
