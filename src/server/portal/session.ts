import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { db, notDeleted } from '@/lib/db';

/**
 * جلسة بوابة المستفيد.
 *
 * منفصلة تمامًا عن جلسات الموظفين: كوكي مختلف، وجدول مختلف، ومدة أقصر.
 * الخلط بين الاثنين كان سيعني أن ثغرة في البوابة العامة تفتح النظام الداخلي.
 *
 * قيمة الكوكي معرّف مبهم يقابل صفًّا في `portal_sessions`، فحذف الصف يقطع
 * الوصول في الحال.
 */

const COOKIE_NAME = 'bader_portal_session';
const MAX_AGE_SECONDS = 60 * 60 * 2; // ساعتان — البوابة للاستعمال العابر

export type PortalUser = {
  id: string;
  fullName: string;
  nationalId: string;
  phone: string | null;
};

export async function createPortalSession(beneficiaryId: string): Promise<void> {
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + MAX_AGE_SECONDS * 1000);

  const requestHeaders = await headers();
  const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  await db.portalSession.create({
    data: { sessionToken, beneficiaryId, expires, ip },
  });

  const jar = await cookies();
  jar.set(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  });
}

export async function destroyPortalSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;

  if (token) {
    await db.portalSession.deleteMany({ where: { sessionToken: token } });
  }
  jar.delete(COOKIE_NAME);
}

/** المستفيد صاحب الجلسة، أو null. ملفوفة بـ`cache` لطلب واحد. */
export const getPortalUser = cache(async (): Promise<PortalUser | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await db.portalSession.findUnique({
    where: { sessionToken: token },
    select: {
      expires: true,
      beneficiary: {
        select: { id: true, fullName: true, nationalId: true, phone: true, deletedAt: true },
      },
    },
  });

  if (!session || session.beneficiary.deletedAt) return null;

  if (session.expires.getTime() <= Date.now()) {
    await db.portalSession.deleteMany({ where: { sessionToken: token } });
    return null;
  }

  return {
    id: session.beneficiary.id,
    fullName: session.beneficiary.fullName,
    nationalId: session.beneficiary.nationalId,
    phone: session.beneficiary.phone,
  };
});

export async function requirePortalUser(): Promise<PortalUser> {
  const user = await getPortalUser();
  if (!user) redirect('/portal');
  return user;
}

/** يتحقق أن الطلب يخصّ صاحب الجلسة — لا يكفي معرفة رقمه. */
export async function getPortalRequest(requestId: string, beneficiaryId: string) {
  return db.request.findFirst({
    where: { id: requestId, beneficiaryId, ...notDeleted },
    select: {
      id: true,
      requestNo: true,
      status: true,
      createdAt: true,
      submittedAt: true,
      closedAt: true,
      items: {
        where: notDeleted,
        select: {
          id: true,
          size: true,
          quantity: true,
          legacyText: true,
          item: { select: { name: true, program: { select: { name: true } } } },
        },
      },
      statusHistory: {
        orderBy: { changedAt: 'asc' },
        select: { id: true, toStatus: true, changedAt: true },
      },
    },
  });
}
