'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * لوحة التوقيع.
 *
 * موظف المستودع يسلّم الجهاز واقفًا ومعه جوال، فالتوقيع يُلتقط باللمس على
 * الشاشة — لا بطابعة ولا ماسح. القماش يعمل بالفأرة واللمس والقلم معًا عبر
 * أحداث المؤشّر الموحّدة.
 *
 * القماش يُرسم بدقّة الشاشة (`devicePixelRatio`) وإلا خرج التوقيع مهترئًا
 * على شاشات الجوال عالية الكثافة، وهو أثر قانوني يجب أن يُقرأ.
 */
export function SignaturePad({
  onChange,
  disabled,
}: {
  /** يعيد التوقيع كـdata URL، أو null إن كان فارغًا */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.scale(ratio, ratio);
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    // لون الحبر ثابت لا يتبع السمة: التوقيع يُطبع على ورق أبيض دائمًا.
    context.strokeStyle = '#1f2328';
  }, []);

  function position(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;

    // التقاط المؤشّر: الخط لا ينقطع لو خرج الإصبع خارج حدود القماش.
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;

    const { x, y } = position(event);
    context.beginPath();
    context.moveTo(x, y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;

    const { x, y } = position(event);
    context.lineTo(x, y);
    context.stroke();

    if (!hasInk) setHasInk(true);
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;

    const canvas = canvasRef.current;
    if (canvas && hasInk) onChange(canvas.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-1">
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="مساحة التوقيع"
        className="h-[140px] w-full rounded border border-border bg-[var(--bgColor-white)] touch-none"
      />

      <div className="flex items-center gap-1">
        <Button type="button" size="sm" onClick={clear} disabled={disabled || !hasInk}>
          مسح التوقيع
        </Button>
        <span className="text-xs text-fg-muted">
          {hasInk ? 'التوقيع مُلتقَط.' : 'وقّع بالإصبع أو الفأرة داخل الإطار.'}
        </span>
      </div>
    </div>
  );
}
