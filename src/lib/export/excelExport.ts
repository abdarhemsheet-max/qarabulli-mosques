import * as XLSX from 'xlsx-js-style';
import type { MosqueRecord } from '../../types/mosque';
import { formatEnglishDate, formatEnglishDateTime } from '../utils/geo';

const HEADERS = [
  'م',
  'اسم المسجد',
  'المحلة / المنطقة',
  'رابط الموقع (خرائط جوجل)',
  'علامة دالة',
  'ملاحظات',
  'الاسم المتداول',
  'خط العرض',
  'خط الطول',
  'عدد الصور',
  'الموثِّق',
  'تاريخ ووقت التوثيق',
];

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12, name: 'Cairo' },
  fill: { fgColor: { rgb: '0F4C3A' }, patternType: 'solid' },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: '0A3528' } },
    bottom: { style: 'thin', color: { rgb: '0A3528' } },
    left: { style: 'thin', color: { rgb: '0A3528' } },
    right: { style: 'thin', color: { rgb: '0A3528' } },
  },
};

const CELL_STYLE = {
  font: { color: { rgb: '1A2421' }, sz: 11, name: 'Cairo' },
  alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: 'E2E0D8' } },
    bottom: { style: 'thin', color: { rgb: 'E2E0D8' } },
    left: { style: 'thin', color: { rgb: 'E2E0D8' } },
    right: { style: 'thin', color: { rgb: 'E2E0D8' } },
  },
};

const CENTER_CELL_STYLE = {
  ...CELL_STYLE,
  alignment: { horizontal: 'center', vertical: 'center' },
};

const LINK_STYLE = {
  font: { color: { rgb: '0F4C3A' }, underline: true, sz: 11, name: 'Cairo' },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: CELL_STYLE.border,
};

export function exportMosquesToExcel(mosques: MosqueRecord[]): void {
  const rows = mosques.map((m, idx) => [
    idx + 1,
    m.officialName,
    m.locality,
    m.mapsUrl,
    m.landmark || '',
    m.notes || '',
    m.commonName || '',
    Number(m.lat.toFixed(6)),
    Number(m.lng.toFixed(6)),
    m.photoCount ?? m.photos.length,
    m.createdByName,
    formatEnglishDateTime(m.createdAt),
  ]);

  const aoa = [HEADERS, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Set RTL worksheet view
  (ws as Record<string, unknown>)['!views'] = [{ rightToLeft: true, RTL: true }];

  // Style header row
  for (let colIdx = 0; colIdx < HEADERS.length; colIdx++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    if (ws[cellRef]) {
      ws[cellRef].s = HEADER_STYLE;
    }
  }

  // Style data rows and attach clickable hyperlinks to column 3 (رابط الموقع)
  const colWidths = HEADERS.map((h) => h.length + 6);

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const r = rowIdx + 1;
    const rowValues = rows[rowIdx];

    for (let colIdx = 0; colIdx < HEADERS.length; colIdx++) {
      const cellRef = XLSX.utils.encode_cell({ r, c: colIdx });
      const cell = ws[cellRef];
      if (!cell) continue;

      const textVal = String(rowValues[colIdx] ?? '');
      colWidths[colIdx] = Math.max(colWidths[colIdx], Math.min(textVal.length + 5, 52));

      if (colIdx === 3) {
        const url = String(rowValues[colIdx]);
        cell.t = 's';
        cell.v = url;
        cell.l = { Target: url, Tooltip: 'فتح الموقع في خرائط جوجل' };
        cell.s = LINK_STYLE;
      } else if (colIdx === 0 || colIdx === 7 || colIdx === 8 || colIdx === 9 || colIdx === 11) {
        cell.s = CENTER_CELL_STYLE;
      } else {
        cell.s = CELL_STYLE;
      }
    }
  }

  // Ensure sensible minimum column widths
  const minWidths = [6, 26, 20, 40, 26, 28, 22, 13, 13, 12, 20, 19];
  ws['!cols'] = colWidths.map((w, idx) => ({ wch: Math.max(w, minWidths[idx] ?? 14) }));

  // Header row height
  ws['!rows'] = [{ hpt: 30 }];

  const wb = XLSX.utils.book_new();
  wb.Workbook = {
    Views: [{ RTL: true }],
  };
  XLSX.utils.book_append_sheet(wb, ws, 'المساجد');

  const today = formatEnglishDate(new Date()).replace(/\//g, '-');
  XLSX.writeFile(wb, `مساجد_أوقاف_القره_بوللي_${today}.xlsx`);
}
