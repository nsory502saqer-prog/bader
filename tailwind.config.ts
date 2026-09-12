import type { Config } from 'tailwindcss';

/**
 * نظام التصميم: رموز GitHub Primer الرسمية موصولة بـTailwind.
 *
 * القاعدة: لا لون ولا مسافة ولا حجم خط خارج ما هو معرَّف هنا. أي قيمة عشوائية
 * في الواجهة (`text-[13px]`, `bg-[#f5f5f5]`) مخالفة يجب إصلاحها.
 *
 * الألوان كلها `var(--token)` من `@primer/primitives`، فالوضع الليلي يعمل
 * باستبدال قيم الرموز لا بقلب الألوان.
 */

const primer = (token: string) => `var(--${token})`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],

  // الوضع الليلي يُفعَّل بسمة data-color-mode على <html>، لا بتفضيل المتصفح وحده.
  darkMode: ['selector', '[data-color-mode="dark"]'],

  theme: {
    // مقياس مغلق: لا أحجام خطوط خارج هذه الخمسة.
    fontSize: {
      xs: ['12px', { lineHeight: '1.5' }], // تسميات ثانوية — الحد الأدنى المطلق
      sm: ['14px', { lineHeight: '1.5' }], // النص الأساسي والجداول
      base: ['16px', { lineHeight: '1.5' }], // عناوين فرعية
      lg: ['20px', { lineHeight: '1.4' }], // عنوان الصفحة
      xl: ['24px', { lineHeight: '1.35' }], // نادر جدًا
    },

    // وزنان فقط. لا bold ولا أثقل.
    fontWeight: {
      normal: '400',
      semibold: '600',
    },

    // شبكة 8px حصريًا (مع 4px للحشو الداخلي الدقيق في الشارات فقط).
    spacing: {
      0: '0px',
      px: '1px',
      0.5: '4px',
      1: '8px',
      2: '16px',
      3: '24px',
      4: '32px',
      6: '48px',
      8: '64px',
      12: '96px',
    },

    borderRadius: {
      none: '0',
      DEFAULT: '6px',
      md: '6px',
      lg: '6px',
      full: '9999px', // الصور الرمزية فقط
    },

    extend: {
      colors: {
        canvas: {
          DEFAULT: primer('bgColor-default'),
          subtle: primer('bgColor-muted'),
          inset: primer('bgColor-inset'),
          disabled: primer('bgColor-disabled'),
        },
        fg: {
          DEFAULT: primer('fgColor-default'),
          muted: primer('fgColor-muted'),
          disabled: primer('fgColor-disabled'),
          onEmphasis: primer('fgColor-onEmphasis'),
          accent: primer('fgColor-accent'),
          success: primer('fgColor-success'),
          attention: primer('fgColor-attention'),
          danger: primer('fgColor-danger'),
          done: primer('fgColor-done'),
          link: primer('fgColor-link'),
        },
        border: {
          DEFAULT: primer('borderColor-default'),
          muted: primer('borderColor-muted'),
          emphasis: primer('borderColor-emphasis'),
          accent: primer('borderColor-accent-emphasis'),
          success: primer('borderColor-success-emphasis'),
          attention: primer('borderColor-attention-emphasis'),
          danger: primer('borderColor-danger-emphasis'),
        },
        accent: {
          emphasis: primer('bgColor-accent-emphasis'),
          muted: primer('bgColor-accent-muted'),
        },
        success: {
          emphasis: primer('bgColor-success-emphasis'),
          muted: primer('bgColor-success-muted'),
        },
        attention: {
          emphasis: primer('bgColor-attention-emphasis'),
          muted: primer('bgColor-attention-muted'),
        },
        danger: {
          emphasis: primer('bgColor-danger-emphasis'),
          muted: primer('bgColor-danger-muted'),
        },
        done: {
          emphasis: primer('bgColor-done-emphasis'),
          muted: primer('bgColor-done-muted'),
        },
        neutral: {
          emphasis: primer('bgColor-neutral-emphasis'),
          muted: primer('bgColor-neutral-muted'),
        },
      },

      fontFamily: {
        sans: [
          'var(--font-plex-arabic)',
          'IBM Plex Sans Arabic',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Noto Sans',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        // للأرقام والمعرّفات: أرقام تُقرأ وتُقارن، لا نص.
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },

      // الظل مسموح في القوائم المنسدلة والنوافذ المنبثقة فقط.
      boxShadow: {
        none: 'none',
        overlay: primer('shadow-floating-small'),
      },

      // الحركة بوظيفة فقط: تغذية راجعة وهياكل تحميل.
      keyframes: {
        skeleton: {
          '0%': { opacity: '1' },
          '50%': { opacity: '0.4' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        skeleton: 'skeleton 1.4s ease-in-out infinite',
      },
    },
  },

  plugins: [],
};

export default config;
