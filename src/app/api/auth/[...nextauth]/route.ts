import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;

// جلسات قاعدة البيانات تحتاج Prisma، وهو لا يعمل على بيئة Edge.
export const runtime = 'nodejs';
