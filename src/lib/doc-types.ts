import { DocType } from '@prisma/client';

/**
 * مسميات أنواع المستندات.
 *
 * تعيش هنا لا في ملف الحركات، لأن ملف `'use server'` لا يُسمح له بتصدير أي
 * شيء غير دوال غير متزامنة — تصدير كائن منه يُسقط الصفحة وقت التشغيل.
 */
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  medical_report: 'تقرير طبي',
  id_copy: 'صورة الهوية',
  device_photo: 'صورة الجهاز',
  quotation: 'عرض سعر',
  other: 'أخرى',
};

export const DOC_TYPE_VALUES = new Set<string>(Object.values(DocType));
