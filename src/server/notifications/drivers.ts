import type { NotificationChannel } from '@prisma/client';

/**
 * مزوّدو الإرسال.
 *
 * الواجهة مجرّدة عن المزوّد عمدًا: الجمعية قد تبدأ بمزوّد SMS محلي ثم تنتقل
 * لواتساب الرسمي، والتبديل يجب ألّا يمسّ منطق النظام — يكفي متغيّر بيئة.
 *
 * المزوّد الافتراضي في التطوير يكتب في السجل ولا يرسل شيئًا، فلا تُرسل رسالة
 * حقيقية لمستفيد حقيقي أثناء الاختبار.
 */

export type SendResult =
  | { ok: true; providerRef: string | null }
  | { ok: false; error: string; retryable: boolean };

export type NotificationDriver = {
  name: string;
  send(args: { channel: NotificationChannel; to: string; body: string }): Promise<SendResult>;
};

/** التطوير والاختبار: يسجّل ولا يرسل. */
const logDriver: NotificationDriver = {
  name: 'log',
  async send({ channel, to, body }) {
    console.info(
      `[إشعار/${channel}] → ${to}\n${body.replace(/^/gm, '    ')}\n(مزوّد السجل: لم تُرسل رسالة فعلية)`,
    );
    return { ok: true, providerRef: null };
  },
};

/**
 * واتساب عبر Cloud API الرسمي.
 *
 * القوالب خارج نافذة الـ24 ساعة يجب أن تكون معتمدة مسبقًا من واتساب، لذلك
 * يُرسل هنا نص حر ويُترك للجمعية ضبط القوالب المعتمدة عند التفعيل الحقيقي.
 */
function whatsappDriver(): NotificationDriver {
  const token = process.env['WHATSAPP_TOKEN'];
  const phoneId = process.env['WHATSAPP_PHONE_ID'];

  return {
    name: 'whatsapp',
    async send({ to, body }) {
      if (!token || !phoneId) {
        return { ok: false, error: 'إعدادات واتساب ناقصة.', retryable: false };
      }

      // الرقم الدولي بلا + كما يتوقعه المزوّد: 05XXXXXXXX ← 9665XXXXXXXX
      const international = to.startsWith('0') ? `966${to.slice(1)}` : to;

      try {
        const response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: international,
            type: 'text',
            text: { body },
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          return {
            ok: false,
            error: `${response.status}: ${text.slice(0, 300)}`,
            // 4xx خطأ في الطلب نفسه، فإعادة المحاولة لن تغيّر شيئًا.
            retryable: response.status >= 500 || response.status === 429,
          };
        }

        const payload = (await response.json()) as { messages?: { id?: string }[] };
        return { ok: true, providerRef: payload.messages?.[0]?.id ?? null };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'خطأ شبكة',
          retryable: true,
        };
      }
    },
  };
}

/** SMS عبر مزوّد متوافق مع HTTP بسيط — يُضبط بمتغيّرات البيئة. */
function smsDriver(): NotificationDriver {
  const endpoint = process.env['SMS_ENDPOINT'];
  const apiKey = process.env['SMS_API_KEY'];
  const sender = process.env['SMS_SENDER'] ?? 'BADER';

  return {
    name: 'sms',
    async send({ to, body }) {
      if (!endpoint || !apiKey) {
        return { ok: false, error: 'إعدادات SMS ناقصة.', retryable: false };
      }

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ to, sender, message: body }),
        });

        if (!response.ok) {
          const text = await response.text();
          return {
            ok: false,
            error: `${response.status}: ${text.slice(0, 300)}`,
            retryable: response.status >= 500 || response.status === 429,
          };
        }

        return { ok: true, providerRef: null };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'خطأ شبكة',
          retryable: true,
        };
      }
    },
  };
}

export function getDriver(): NotificationDriver {
  switch (process.env['NOTIFICATIONS_DRIVER']) {
    case 'whatsapp':
      return whatsappDriver();
    case 'sms':
      return smsDriver();
    default:
      return logDriver;
  }
}

/** القناة الافتراضية للرسائل الصادرة. */
export function defaultChannel(): NotificationChannel {
  return process.env['NOTIFICATIONS_DRIVER'] === 'sms' ? 'sms' : 'whatsapp';
}

/** هل الإشعارات مفعّلة أصلًا؟ تُطفأ بمتغيّر واحد بلا تعديل كود. */
export function notificationsEnabled(): boolean {
  return process.env['NOTIFICATIONS_ENABLED'] !== 'false';
}
