'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/field';
import { Flash } from '@/components/ui/surface';
import { loginAction, type LoginState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" loading={pending} className="w-full">
      {pending ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {state.error ? <Flash tone="danger">{state.error}</Flash> : null}

      <FormField label="البريد الإلكتروني" htmlFor="email" required>
        <Input
          name="email"
          type="email"
          autoComplete="username"
          dir="ltr"
          className="text-start"
          required
        />
      </FormField>

      <FormField label="كلمة المرور" htmlFor="password" required>
        <Input name="password" type="password" autoComplete="current-password" required />
      </FormField>

      <SubmitButton />
    </form>
  );
}
