'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/lib/auth';

export type LoginState = { error?: string };

/**
 * تسجيل الدخول.
 * رسالة الفشل واحدة مهما كان السبب — حتى لا يُستدل من الرد على وجود بريد مسجّل.
 */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'اكتب البريد الإلكتروني وكلمة المرور.' };
  }

  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: '/dashboard',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة، أو الحساب معطَّل.' };
    }
    // signIn ينفّذ إعادة التوجيه برمي استثناء خاص بـNext — يجب تمريره كما هو.
    throw error;
  }

  return {};
}
