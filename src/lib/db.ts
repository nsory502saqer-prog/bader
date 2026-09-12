import { PrismaClient } from '@prisma/client';
import { decrypt, encrypt, isEncrypted } from '@/lib/encryption';

/**
 * عميل Prisma وحيد لكل عملية.
 * في التطوير يُعاد استعمال العميل عبر globalThis حتى لا يفتح إعادة التحميل
 * الساخن اتصالًا جديدًا في كل مرة فيستنزف مجمّع الاتصالات.
 */

/**
 * الحقول المشفَّرة: نصوص حرة تحمل تفاصيل صحية ولا يُبحث فيها.
 * ما يُبحث فيه أو يحمل قيدًا فريدًا لا يُشفَّر — انظر `lib/encryption.ts`.
 */
const ENCRYPTED_FIELDS: Record<string, readonly string[]> = {
  Beneficiary: ['notes'],
  Request: ['notes'],
};

/**
 * يفكّ أي نص مشفَّر في شجرة النتيجة.
 *
 * المشي على الشجرة بدل استهداف حقول بعينها مقصود: النتائج تأتي بأشكال لا
 * تُحصى (`include` متداخل، `select` جزئي، مصفوفات داخل مصفوفات)، ونسيان
 * مسار واحد يعني عرض نص مشفَّر للموظف. البادئة `enc:v1:` تميّز ما يُفكّ،
 * فلا يُمسّ نص عادي.
 */
function decryptDeep(value: unknown, depth = 0): unknown {
  // حدّ عمق يحمي من دورة مرجعية غير متوقعة في نتيجة.
  if (depth > 12) return value;

  if (typeof value === 'string') return isEncrypted(value) ? decrypt(value) : value;
  if (Array.isArray(value)) return value.map((item) => decryptDeep(item, depth + 1));

  // التواريخ وBuffer وDecimal كائنات لا يصحّ المشي فيها.
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;

  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    output[key] = decryptDeep(source[key], depth + 1);
  }
  return output;
}

/** يشفّر الحقول المعرَّفة داخل كائن `data` الذاهب إلى الكتابة. */
function encryptData(model: string, data: unknown): unknown {
  const fields = ENCRYPTED_FIELDS[model];
  if (!fields || data === null || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map((item) => encryptData(model, item));

  const source = data as Record<string, unknown>;
  const output: Record<string, unknown> = { ...source };

  for (const field of fields) {
    const value = source[field];
    if (typeof value === 'string') {
      output[field] = encrypt(value);
    } else if (value !== null && typeof value === 'object' && 'set' in value) {
      // صيغة Prisma البديلة للتحديث: { set: '...' }
      const wrapped = value as { set?: unknown };
      if (typeof wrapped.set === 'string') {
        output[field] = { ...wrapped, set: encrypt(wrapped.set) };
      }
    }
  }

  return output;
}

const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'createManyAndReturn',
]);

function buildClient(): PrismaClient {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  return base.$extends({
    name: 'field-encryption',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (WRITE_OPERATIONS.has(operation)) {
            const input = args as Record<string, unknown>;

            if ('data' in input) input['data'] = encryptData(model, input['data']);
            // `upsert` يحمل جسمين منفصلين للإنشاء والتحديث.
            if ('create' in input) input['create'] = encryptData(model, input['create']);
            if ('update' in input) input['update'] = encryptData(model, input['update']);
          }

          return decryptDeep(await query(args));
        },
      },
    },
  }) as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

/**
 * شرط الحذف الناعم. لا حذف نهائي في هذا النظام إطلاقًا،
 * فكل استعلام قراءة يجب أن يمرّ بهذا الشرط.
 */
export const notDeleted = { deletedAt: null } as const;
