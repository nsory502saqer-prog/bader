import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

/**
 * تهيئة ESLint.
 *
 * `eslint-config-next` ما زال بصيغة eslintrc القديمة بينما ESLint 9 يستعمل
 * التهيئة المسطّحة، فـ`FlatCompat` هو الجسر بينهما. الأمر `next lint` مهجور
 * في Next.js 16، لذا يُستدعى `eslint` مباشرة.
 */

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'reports/**',
      'storage/**',
      'next-env.d.ts',
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    rules: {
      // المتغيّر المهمل يُسمّى بشرطة سفلية، وما عداه خطأ لا تحذير.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // `any` يُسقط كل فائدة الوضع الصارم، فلا يمرّ صامتًا.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  {
    // ملفات العُقد والسكربتات تطبع عمدًا: مخرجاتها هي واجهتها.
    files: ['scripts/**/*.{ts,mjs}', 'prisma/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];

export default config;
