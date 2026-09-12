import { z } from 'zod';
import { RequestStatus } from '@prisma/client';

/** مخططات التحقق للطلبات — مشتركة بين النموذج في المتصفح والحركة في الخادم. */

export const SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;
export const sizeSchema = z.enum(SIZES);

export const requestItemSchema = z.object({
  itemId: z.coerce.number().int().positive('اختر الصنف.'),
  size: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || (SIZES as readonly string[]).includes(v), {
      message: 'المقاس غير صالح.',
    }),
  quantity: z.coerce
    .number()
    .int('الكمية يجب أن تكون رقمًا صحيحًا.')
    .min(1, 'الكمية لا تقل عن 1.')
    .max(999, 'الكمية أكبر من الحد المعقول.'),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => v || null),
});

export type RequestItemInput = z.input<typeof requestItemSchema>;

export const createRequestSchema = z.object({
  beneficiaryId: z.string().uuid('اختر المستفيد.'),
  priority: z.enum(['normal', 'urgent']).default('normal'),
  source: z.enum(['walk_in', 'phone', 'portal']).default('walk_in'),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => v || null),
  // الطلب لا يُقدَّم بدون بند واحد على الأقل.
  items: z.array(requestItemSchema).min(1, 'أضف بندًا واحدًا على الأقل قبل حفظ الطلب.'),
  /** true = يُقدَّم فورًا، false = يُحفظ كمسودة */
  submit: z.boolean().default(true),
});

export type CreateRequestInput = z.input<typeof createRequestSchema>;

export const transitionSchema = z.object({
  requestId: z.string().uuid(),
  to: z.nativeEnum(RequestStatus),
  reason: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => v || null),
});

export const updateItemsSchema = z.object({
  requestId: z.string().uuid(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      quantity: z.coerce.number().int().min(1).max(999),
      itemStatus: z.enum(['pending', 'in_stock', 'to_purchase', 'issued', 'cancelled']),
      fulfilledQty: z.coerce.number().int().min(0).max(999),
      note: z
        .string()
        .trim()
        .max(500)
        .optional()
        .nullable()
        .transform((v) => v || null),
    }),
  ),
});

export const requestFilterSchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  status: z.nativeEnum(RequestStatus).optional().nullable(),
  programId: z.coerce.number().int().positive().optional().nullable(),
  cityId: z.coerce.number().int().positive().optional().nullable(),
  incomeSourceId: z.coerce.number().int().positive().optional().nullable(),
  gender: z.enum(['male', 'female']).optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  from: z.string().optional().nullable(),
  to: z.string().optional().nullable(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
});

export type RequestFilters = z.output<typeof requestFilterSchema>;
