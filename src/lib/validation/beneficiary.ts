import { z } from 'zod';
import { normalizePhone, toLatinDigits } from '@/lib/arabic';

/**
 * مخططات التحقق للمستفيدين.
 * المخطط نفسه يُستهلك في الواجهة (React Hook Form) وفي الخادم (Server Actions)،
 * فلا تتفرّع القواعد بين الطرفين.
 */

/** 10 أرقام بالضبط، تبدأ بـ1 (مواطن) أو 2 (مقيم) */
export const nationalIdSchema = z
  .string()
  .trim()
  .transform(toLatinDigits)
  .refine((v) => /^\d{10}$/.test(v), {
    message: 'رقم الهوية يجب أن يتكوّن من 10 أرقام بالضبط.',
  })
  .refine((v) => v.startsWith('1') || v.startsWith('2'), {
    message: 'رقم الهوية يجب أن يبدأ بـ1 للمواطن أو 2 للمقيم.',
  });

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : normalizePhone(v)))
  .refine((v) => v !== null, {
    message: 'صيغة الجوال غير صحيحة. اكتبه هكذا: 05XXXXXXXX أو +9665XXXXXXXX.',
  });

/** الجوال اختياري، لكنه إن كُتب فيجب أن يكون صالحًا. يُخزَّن دائمًا بصيغة 05XXXXXXXX. */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .superRefine((v, ctx) => {
    if (!v) return;
    if (normalizePhone(v) === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'صيغة الجوال غير صحيحة. اكتبه هكذا: 05XXXXXXXX أو +9665XXXXXXXX.',
      });
    }
  })
  .transform((v) => (v ? normalizePhone(v) : null));

export const genderSchema = z.enum(['male', 'female']);

const optionalId = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  });

const requiredId = z
  .union([z.string(), z.number()])
  .transform((v) => Number(v))
  .refine((v) => Number.isFinite(v) && v > 0, { message: 'هذا الحقل مطلوب.' });

export const beneficiaryInputSchema = z.object({
  nationalId: nationalIdSchema,
  fullName: z
    .string()
    .trim()
    .min(5, 'اكتب الاسم الرباعي كاملًا.')
    .max(255, 'الاسم أطول من الحد المسموح.'),
  gender: genderSchema,
  birthDate: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (!v ? null : v))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), {
      message: 'تاريخ الميلاد غير صالح.',
    }),
  phone: optionalPhoneSchema,
  incomeSourceId: requiredId,
  cityId: requiredId,
  districtId: optionalId,
  addressNote: z.string().trim().max(500).optional().nullable().transform((v) => v || null),
  notes: z.string().trim().max(2000).optional().nullable().transform((v) => v || null),
});

export type BeneficiaryInput = z.input<typeof beneficiaryInputSchema>;
export type BeneficiaryParsed = z.output<typeof beneficiaryInputSchema>;

export const beneficiaryUpdateSchema = beneficiaryInputSchema.extend({
  id: z.string().uuid('معرّف المستفيد غير صالح.'),
});

export const beneficiarySearchSchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  cityId: optionalId,
  gender: genderSchema.optional().nullable(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
});
