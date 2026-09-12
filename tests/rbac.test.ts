import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { can, PERMISSIONS } from '@/lib/rbac';

describe('الصلاحيات — ما لا يراه كل دور', () => {
  it('الاستقبال لا يرى التقارير المالية', () => {
    expect(can(Role.reception, 'report:financial')).toBe(false);
  });

  it('الفرز لا يعدّل المخزون', () => {
    expect(can(Role.screener, 'inventory:update')).toBe(false);
  });

  it('المستودع لا يصدر أوامر الصرف', () => {
    expect(can(Role.warehouse, 'disbursement:issue')).toBe(false);
  });

  it('المشتريات لا تصدر أوامر الصرف ولا تعتمد الطلبات', () => {
    expect(can(Role.purchasing, 'disbursement:issue')).toBe(false);
    expect(can(Role.purchasing, 'inventory:update')).toBe(false);
  });

  it('المالية لا تعدّل بيانات المستفيد', () => {
    expect(can(Role.finance, 'beneficiary:update')).toBe(false);
    expect(can(Role.finance, 'beneficiary:create')).toBe(false);
  });

  it('المطّلع لا يرى البيانات الصحية التفصيلية ولا الهوية كاملة', () => {
    expect(can(Role.viewer, 'beneficiary:read_health')).toBe(false);
    expect(can(Role.viewer, 'beneficiary:read_full_id')).toBe(false);
  });

  it('لا دور غير المدير يدير المستخدمين', () => {
    for (const role of Object.values(Role)) {
      if (role === Role.admin) continue;
      expect(can(role, 'admin:users'), role).toBe(false);
    }
  });
});

describe('الصلاحيات — المدير', () => {
  it('يملك كل صلاحية معرَّفة', () => {
    for (const permission of PERMISSIONS) {
      expect(can(Role.admin, permission), permission).toBe(true);
    }
  });
});

describe('الصلاحيات — القراءة', () => {
  it('كل دور يقرأ الطلبات والمستفيدين', () => {
    for (const role of Object.values(Role)) {
      expect(can(role, 'request:read'), role).toBe(true);
      expect(can(role, 'beneficiary:read'), role).toBe(true);
    }
  });

  it('كل دور يستطيع التصدير إلى Excel', () => {
    for (const role of Object.values(Role)) {
      expect(can(role, 'report:export'), role).toBe(true);
    }
  });
});
