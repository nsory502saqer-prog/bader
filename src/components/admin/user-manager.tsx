'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Role } from '@prisma/client';
import { PlusIcon } from '@primer/octicons-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/field';
import { Box, BoxHeader, BoxTitle, Flash } from '@/components/ui/surface';
import { StatusLabel } from '@/components/ui/label';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/workflow';
import { createUser, updateUser } from '@/server/actions/user-actions';

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
};

export function UserManager({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    name: '',
    email: '',
    role: Role.reception as Role,
    password: '',
  });

  const [edit, setEdit] = useState({
    name: '',
    role: Role.reception as Role,
    isActive: true,
    password: '',
  });

  function submitCreate() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await createUser(draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreating(false);
      setDraft({ name: '', email: '', role: Role.reception, password: '' });
      setSuccess('أُنشئ الحساب.');
      router.refresh();
    });
  }

  function submitEdit(id: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await updateUser({ id, ...edit, password: edit.password || null });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      setSuccess('حُفظت التعديلات.');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <Flash tone="danger">{error}</Flash> : null}
      {success ? <Flash tone="success">{success}</Flash> : null}

      <Box>
        <BoxHeader>
          <BoxTitle>
            المستخدمون <span className="tnum font-normal text-fg-muted">({users.length})</span>
          </BoxTitle>
          <Button
            type="button"
            size="sm"
            leadingIcon={<PlusIcon size={16} />}
            onClick={() => setCreating((v) => !v)}
          >
            {creating ? 'إخفاء نموذج الإضافة' : 'مستخدم جديد'}
          </Button>
        </BoxHeader>

        {creating ? (
          <div className="grid gap-2 border-b border-border p-2 sm:grid-cols-2">
            <FormField label="الاسم" htmlFor="new-name" required>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </FormField>

            <FormField label="البريد الإلكتروني" htmlFor="new-email" required>
              <Input
                type="email"
                dir="ltr"
                className="text-start"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </FormField>

            <FormField label="الدور" htmlFor="new-role" required>
              <Select
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}
              >
                {Object.values(Role).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="كلمة المرور"
              htmlFor="new-password"
              required
              hint="10 محارف على الأقل، وتحتوي حرفًا كبيرًا وصغيرًا ورقمًا."
            >
              <Input
                type="password"
                dir="ltr"
                className="text-start"
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              />
            </FormField>

            <div className="sm:col-span-2">
              <Button type="button" variant="primary" loading={pending} onClick={submitCreate}>
                إنشاء الحساب
              </Button>
            </div>
          </div>
        ) : null}

        <TableContainer>
          <Table className="min-w-[720px]">
            <thead>
              <tr>
                <Th>الاسم</Th>
                <Th>البريد الإلكتروني</Th>
                <Th>الدور</Th>
                <Th>الحالة</Th>
                <Th>تاريخ الإنشاء</Th>
                <Th textAlign="center">إجراء</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <Tr key={u.id}>
                  <Td>{u.name}</Td>
                  <Td dir="ltr" className="text-start text-fg-muted">
                    {u.email}
                  </Td>
                  <Td>{ROLE_LABELS[u.role]}</Td>
                  <Td>
                    <StatusLabel tone={u.isActive ? 'success' : 'neutral'}>
                      {u.isActive ? 'نشط' : 'معطَّل'}
                    </StatusLabel>
                  </Td>
                  <Td className="tnum text-fg-muted">{formatDate(u.createdAt)}</Td>
                  <Td textAlign="center">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setEditingId(editingId === u.id ? null : u.id);
                        setEdit({
                          name: u.name,
                          role: u.role,
                          isActive: u.isActive,
                          password: '',
                        });
                      }}
                    >
                      {editingId === u.id ? 'إغلاق' : 'تعديل'}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableContainer>

        {editingId ? (
          <div className="grid gap-2 border-t border-border p-2 sm:grid-cols-2">
            <FormField label="الاسم" htmlFor="edit-name" required>
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </FormField>

            <FormField label="الدور" htmlFor="edit-role" required>
              <Select
                value={edit.role}
                onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}
              >
                {Object.values(Role).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="الحالة" htmlFor="edit-active">
              <Select
                value={edit.isActive ? 'active' : 'inactive'}
                onChange={(e) => setEdit({ ...edit, isActive: e.target.value === 'active' })}
              >
                <option value="active">نشط</option>
                <option value="inactive">معطَّل</option>
              </Select>
            </FormField>

            <FormField
              label="كلمة مرور جديدة"
              htmlFor="edit-password"
              hint="اتركها فارغة لعدم تغييرها. تغييرها يُنهي جلسات المستخدم فورًا."
            >
              <Input
                type="password"
                dir="ltr"
                className="text-start"
                value={edit.password}
                onChange={(e) => setEdit({ ...edit, password: e.target.value })}
              />
            </FormField>

            <div className="flex items-center gap-1 sm:col-span-2">
              <Button
                type="button"
                variant="primary"
                loading={pending}
                onClick={() => submitEdit(editingId)}
              >
                حفظ
              </Button>
              <Button type="button" onClick={() => setEditingId(null)}>
                إلغاء
              </Button>
              {editingId === currentUserId ? (
                <span className="text-xs text-fg-muted">
                  هذا حسابك — لا يمكنك تعطيله أو تغيير دورك بنفسك.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </Box>
    </div>
  );
}
