import { PrismaClient } from '@prisma/client';

/**
 * عميل Prisma وحيد لكل عملية.
 * في التطوير يُعاد استعمال العميل عبر globalThis حتى لا يفتح إعادة التحميل
 * الساخن اتصالًا جديدًا في كل مرة فيستنزف مجمّع الاتصالات.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

/**
 * شرط الحذف الناعم. لا حذف نهائي في هذا النظام إطلاقًا،
 * فكل استعلام قراءة يجب أن يمرّ بهذا الشرط.
 */
export const notDeleted = { deletedAt: null } as const;
