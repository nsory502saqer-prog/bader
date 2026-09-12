import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { compare } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * المصادقة: Auth.js v5 بجلسات مخزَّنة في قاعدة البيانات.
 *
 * لماذا هذا الترتيب بالذات؟ Auth.js يرفض `session.strategy: 'database'` عندما
 * يكون Credentials هو المزوّد الوحيد (انظر UnsupportedStrategy في @auth/core).
 * والجلسة القاعديّة شرط هنا لا رفاهية: تعطيل موظف أو تغيير كلمة مروره يجب أن
 * يقطع وصوله في الحال، وهو ما لا يوفّره رمز JWT موقَّع يظل صالحًا حتى ينتهي.
 *
 * الحل: نبقي الاستراتيجية `jwt` من منظور الإطار، لكن نستبدل ترميز الرمز وفكّه
 * فيصير محتوى الكوكي **معرّفًا مبهمًا** لا JWT، ويقابله صفٌّ حقيقي في جدول
 * `sessions`. النتيجة سلوك جلسة قاعديّة كامل:
 *   - لا بيانات مستخدم داخل الكوكي إطلاقًا.
 *   - حذف صف الجلسة يُنهي الوصول فورًا.
 *   - الدور والحالة يُقرآن من قاعدة البيانات في كل طلب، لا من رمز قديم.
 */

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // ثماني ساعات — يوم عمل واحد

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
      isActive: boolean;
    } & DefaultSession['user'];
  }

  interface User {
    role: Role;
    isActive: boolean;
  }
}

/**
 * مفتاح الجلسة داخل الرمز. نوع JWT في Auth.js هو `Record<string, unknown>`،
 * فنقرأ المفتاح بتحقق صريح من النوع بدل توسيع وحدة خارجية.
 */
const SESSION_TOKEN_KEY = 'sessionToken';

function readSessionToken(token: Record<string, unknown> | null | undefined): string | null {
  const value = token?.[SESSION_TOKEN_KEY];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('صيغة البريد الإلكتروني غير صحيحة.'),
  password: z.string().min(1, 'كلمة المرور مطلوبة.'),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(db),
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  trustHost: true,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'البريد الإلكتروني', type: 'email' },
        password: { label: 'كلمة المرور', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await db.user.findFirst({
          where: { email: parsed.data.email, deletedAt: null },
        });

        // ردّ واحد لكل حالات الفشل: لا نكشف ما إذا كان البريد مسجّلًا.
        if (!user?.password || !user.isActive) return null;

        const valid = await compare(parsed.data.password, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },

    /**
     * الدور والحالة يُقرآن من قاعدة البيانات في كل طلب.
     * فلو غيّر المدير دور موظف الآن، انعكس التغيير على طلبه التالي مباشرة.
     */
    async session({ session, token }) {
      const userId = token.sub;
      if (!userId) return session;

      const user = await db.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });

      if (!user) {
        session.user = { ...session.user, id: '', role: Role.viewer, isActive: false };
        return session;
      }

      session.user = {
        ...session.user,
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      };
      return session;
    },
  },
  jwt: {
    /**
     * بدل توقيع JWT: ينشئ صفًّا في `sessions` ويعيد معرّفه المبهم كقيمة للكوكي.
     * إن كان الرمز قادمًا من `decode` (طلب لاحق في نفس الجلسة) يُعاد كما هو،
     * فلا يتضخّم الجدول بصف جديد مع كل طلب.
     */
    async encode({ token }) {
      const existing = readSessionToken(token);
      if (existing) return existing;

      const userId = token?.sub;
      if (!userId) throw new Error('تعذّر إنشاء الجلسة: لا يوجد معرّف مستخدم.');

      const sessionToken = randomUUID();
      await db.session.create({
        data: {
          sessionToken,
          userId,
          expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
        },
      });

      return sessionToken;
    },

    /** بدل التحقق من التوقيع: بحث عن الجلسة في قاعدة البيانات. */
    async decode({ token }) {
      if (!token) return null;

      const session = await db.session.findUnique({
        where: { sessionToken: token },
        select: { sessionToken: true, userId: true, expires: true },
      });

      if (!session) return null;

      // الجلسة المنتهية تُحذف بدل أن تُترك تتراكم.
      if (session.expires.getTime() <= Date.now()) {
        await db.session.deleteMany({ where: { sessionToken: token } });
        return null;
      }

      return { sub: session.userId, [SESSION_TOKEN_KEY]: session.sessionToken };
    },
  },
  events: {
    /** الخروج يحذف صف الجلسة، فلا يبقى رمز صالح بعد مغادرة الموظف. */
    async signOut(message) {
      const sessionToken = 'token' in message ? readSessionToken(message.token) : null;
      if (sessionToken) {
        await db.session.deleteMany({ where: { sessionToken } });
      }
    },
  },
});
