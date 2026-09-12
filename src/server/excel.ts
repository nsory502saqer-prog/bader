import ExcelJS from 'exceljs';

/**
 * التصدير إلى Excel.
 *
 * شرط غير قابل للتفاوض في هذا النظام: كل قائمة وكل تقرير له زر تصدير. بلا هذا
 * يعود الموظفون لملفاتهم الجانبية خلال شهرين، فيعود بالضبط ما بُني النظام
 * ليحلّه.
 *
 * الملفات المنتَجة عربية الاتجاه (`rightToLeft`)، وأعمدة الأرقام المرجعية
 * (الهوية، أرقام الطلبات) تُكتب نصًا لا رقمًا حتى لا يبتلع Excel الصفر البادئ
 * ولا يحوّلها لصيغة علمية.
 */

export type Column<Row> = {
  header: string;
  width?: number;
  /** يستخرج القيمة من الصف */
  value: (row: Row) => string | number | Date | null;
  /** نص صريح: يمنع Excel من تفسير الرقم المرجعي كعدد */
  asText?: boolean;
};

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF6F8FA' },
};

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD1D9E0' } },
  left: { style: 'thin', color: { argb: 'FFD1D9E0' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D9E0' } },
  right: { style: 'thin', color: { argb: 'FFD1D9E0' } },
};

export type SheetSpec<Row> = {
  name: string;
  columns: Column<Row>[];
  rows: Row[];
  /** أسطر ملخّص تُكتب فوق الجدول (مثل الفترة والفلاتر المطبّقة) */
  notes?: string[];
};

export async function buildWorkbook<Row>(
  sheets: SheetSpec<Row>[],
  meta: { title: string; generatedBy: string },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'نظام إدارة طلبات الإعانات';
  workbook.created = new Date();

  for (const spec of sheets) {
    // اسم الشيت في Excel محدود بـ31 محرفًا ولا يقبل بعض الرموز.
    const safeName = spec.name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31);
    const sheet = workbook.addWorksheet(safeName, {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: spec.notes?.length ? 2 : 1 }],
    });

    let cursor = 1;

    if (spec.notes?.length) {
      const noteRow = sheet.getRow(cursor);
      noteRow.getCell(1).value = spec.notes.join('  ·  ');
      noteRow.getCell(1).font = { size: 10, color: { argb: 'FF59636E' } };
      sheet.mergeCells(cursor, 1, cursor, Math.max(1, spec.columns.length));
      cursor += 1;
    }

    const headerRow = sheet.getRow(cursor);
    spec.columns.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = column.header;
      cell.font = { bold: true, size: 11 };
      cell.fill = HEADER_FILL;
      cell.border = BORDER;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    });
    headerRow.height = 22;
    cursor += 1;

    for (const row of spec.rows) {
      const sheetRow = sheet.getRow(cursor);
      spec.columns.forEach((column, index) => {
        const cell = sheetRow.getCell(index + 1);
        const value = column.value(row);

        if (value === null || value === undefined) {
          cell.value = '';
        } else if (column.asText) {
          cell.value = String(value);
          cell.numFmt = '@';
        } else if (value instanceof Date) {
          cell.value = value;
          cell.numFmt = 'yyyy/mm/dd';
        } else {
          cell.value = value;
        }

        cell.border = BORDER;
        cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: false };
      });
      cursor += 1;
    }

    spec.columns.forEach((column, index) => {
      sheet.getColumn(index + 1).width = column.width ?? 18;
    });

    // تصفية تلقائية على صف الترويسة — الموظف يفلتر بلا إعداد يدوي.
    if (spec.rows.length > 0) {
      const headerIndex = spec.notes?.length ? 2 : 1;
      sheet.autoFilter = {
        from: { row: headerIndex, column: 1 },
        to: { row: cursor - 1, column: spec.columns.length },
      };
    }
  }

  const info = workbook.addWorksheet('عن هذا الملف', { views: [{ rightToLeft: true }] });
  info.getColumn(1).width = 24;
  info.getColumn(2).width = 60;
  const rows: [string, string][] = [
    ['التقرير', meta.title],
    ['صُدِّر بواسطة', meta.generatedBy],
    ['تاريخ التصدير', new Date().toLocaleString('en-GB')],
    ['المصدر', 'نظام إدارة طلبات الإعانات — جمعية بادر للأجهزة الطبية'],
  ];
  rows.forEach(([key, value], index) => {
    const row = info.getRow(index + 1);
    row.getCell(1).value = key;
    row.getCell(1).font = { bold: true };
    row.getCell(1).alignment = { horizontal: 'right' };
    row.getCell(2).value = value;
    row.getCell(2).alignment = { horizontal: 'right' };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** ترويسة تنزيل باسم ملف عربي سليم الترميز. */
export function excelHeaders(filename: string): HeadersInit {
  const stamp = new Date().toISOString().slice(0, 10);
  const full = `${filename}-${stamp}.xlsx`;
  return {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(full)}`,
    'Cache-Control': 'private, no-store',
  };
}
