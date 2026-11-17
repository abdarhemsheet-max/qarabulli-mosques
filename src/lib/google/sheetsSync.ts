import type { MosqueFormValues, MosqueRecord } from '../../types/mosque';
import { clearWorkspaceAccessToken } from '../supabase/auth';
import { formatEnglishDate } from '../utils/geo';

export interface DriveSpreadsheetItem {
  id: string;
  name: string;
  webViewLink: string;
  modifiedTime: string;
}

export interface SpreadsheetTabInfo {
  sheetId: number;
  title: string;
}

export interface SpreadsheetMeta {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheets: SpreadsheetTabInfo[];
}

export interface ParsedSheetMosqueRow {
  rowNumber: number;
  officialName: string;
  commonName: string;
  locality: string;
  landmark: string;
  notes: string;
  lat: number;
  lng: number;
  googlePlaceId: string;
}

const SHEET_HEADERS = [
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
  'تاريخ التوثيق',
  'معرّف جوجل (Place ID)',
  'معرّف السجل (ID)',
];

async function googleApiFetch<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401 || res.status === 403) {
    if (res.status === 401) {
      clearWorkspaceAccessToken();
      throw new Error('انتهت صلاحية جلسة Google، يرجى الضغط على زر الربط بحساب Google مجدداً.');
    }
    const errText = await res.text().catch(() => '');
    throw new Error(
      errText.includes('insufficient')
        ? 'صلاحيات الحساب غير كافية للوصول إلى Google Sheets، يرجى إعادة الربط بحساب Google والموافقة على جميع الأذونات.'
        : 'تم رفض الوصول إلى الملف في Google Drive / Sheets.'
    );
  }

  if (!res.ok) {
    let detail = '';
    try {
      const json = (await res.json()) as { error?: { message?: string } };
      detail = json.error?.message ?? '';
    } catch {
      // ignore
    }
    throw new Error(detail || `تعذّر الاتصال بخدمة Google Sheets (${res.status}).`);
  }

  return (await res.json()) as T;
}

export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch?.[1]) return urlMatch[1];

  if (/^[a-zA-Z0-9_-]{15,128}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export async function listDriveSpreadsheets(
  accessToken: string
): Promise<DriveSpreadsheetItem[]> {
  const q = encodeURIComponent(
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=25`;

  const data = await googleApiFetch<{ files?: DriveSpreadsheetItem[] }>(url, accessToken);
  return Array.isArray(data.files) ? data.files : [];
}

export async function fetchSpreadsheetMeta(
  accessToken: string,
  spreadsheetId: string
): Promise<SpreadsheetMeta> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets(properties(sheetId,title))`;

  const data = await googleApiFetch<{
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    properties?: { title?: string };
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  }>(url, accessToken);

  const sheets: SpreadsheetTabInfo[] = Array.isArray(data.sheets)
    ? data.sheets
        .map((s) => ({
          sheetId: Number(s.properties?.sheetId ?? 0),
          title: String(s.properties?.title ?? '').trim(),
        }))
        .filter((s) => Boolean(s.title))
    : [];

  return {
    spreadsheetId: data.spreadsheetId || spreadsheetId,
    title: data.properties?.title || 'ملف Google Sheets',
    spreadsheetUrl:
      data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    sheets,
  };
}

export async function createAwqafSpreadsheet(
  accessToken: string,
  title = 'مساجد مكتب أوقاف القره بوللي'
): Promise<SpreadsheetMeta> {
  const data = await googleApiFetch<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    properties?: { title?: string };
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  }>('https://sheets.googleapis.com/v4/spreadsheets', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        title: title.trim() || 'مساجد مكتب أوقاف القره بوللي',
        locale: 'ar_LY',
      },
      sheets: [
        {
          properties: {
            title: 'المساجد',
            rightToLeft: true,
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  const sheets: SpreadsheetTabInfo[] = Array.isArray(data.sheets)
    ? data.sheets
        .map((s) => ({
          sheetId: Number(s.properties?.sheetId ?? 0),
          title: String(s.properties?.title ?? '').trim(),
        }))
        .filter((s) => Boolean(s.title))
    : [{ sheetId: 0, title: 'المساجد' }];

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || title,
    spreadsheetUrl:
      data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    sheets,
  };
}

function escapeSheetTitle(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

export async function syncMosquesToGoogleSheet(params: {
  accessToken: string;
  spreadsheetId: string;
  sheetName: string;
  sheetId?: number;
  mosques: MosqueRecord[];
}): Promise<{ writtenCount: number }> {
  const { accessToken, spreadsheetId, sheetName, sheetId, mosques } = params;
  const escapedTab = escapeSheetTitle(sheetName);

  // 1. Clear existing range A:N so deleted records don't remain stale
  const clearRange = encodeURIComponent(`${escapedTab}!A:N`);
  await googleApiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${clearRange}:clear`,
    accessToken,
    { method: 'POST', body: '{}' }
  );

  // 2. Write headers + mosque rows
  const rows: Array<Array<string | number>> = [
    SHEET_HEADERS,
    ...mosques.map((m, idx) => [
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
      formatEnglishDate(m.createdAt),
      m.googlePlaceId || '',
      m.id,
    ]),
  ];

  const writeRange = encodeURIComponent(`${escapedTab}!A1:N${rows.length}`);
  await googleApiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${writeRange}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: rows,
      }),
    }
  );

  // 3. Apply clean RTL & Awqaf header styling if sheetId is known
  if (typeof sheetId === 'number' && Number.isFinite(sheetId)) {
    try {
      await googleApiFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}:batchUpdate`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            requests: [
              {
                updateSheetProperties: {
                  properties: {
                    sheetId,
                    rightToLeft: true,
                    gridProperties: { frozenRowCount: 1 },
                  },
                  fields: 'rightToLeft,gridProperties.frozenRowCount',
                },
              },
              {
                repeatCell: {
                  range: {
                    sheetId,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: SHEET_HEADERS.length,
                  },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.059, green: 0.298, blue: 0.227 },
                      textFormat: {
                        foregroundColor: { red: 1, green: 1, blue: 1 },
                        bold: true,
                      },
                      horizontalAlignment: 'CENTER',
                    },
                  },
                  fields:
                    'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
                },
              },
            ],
          }),
        }
      );
    } catch {
      // Non-fatal formatting failure
    }
  }

  return { writtenCount: mosques.length };
}

export async function readRowsFromGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<ParsedSheetMosqueRow[]> {
  const escapedTab = escapeSheetTitle(sheetName);
  const range = encodeURIComponent(`${escapedTab}!A1:N1000`);
  const data = await googleApiFetch<{ values?: string[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${range}`,
    accessToken
  );

  const values = Array.isArray(data.values) ? data.values : [];
  if (values.length <= 1) return [];

  const headerRow = values[0].map((h) => String(h ?? '').trim());
  const findCol = (candidates: string[], fallbackIndex: number) => {
    const found = headerRow.findIndex((h) => {
      const lower = h.toLowerCase();
      return candidates.some((c) => lower.includes(c.toLowerCase()));
    });
    return found >= 0 ? found : fallbackIndex;
  };

  const nameIdx = findCol(['اسم المسجد', 'الاسم الرسمي', 'name'], 1);
  const localityIdx = findCol(['المحلة', 'المنطقة', 'locality'], 2);
  const mapsUrlIdx = findCol(['رابط', 'maps'], 3);
  const landmarkIdx = findCol(['علامة دالة', 'معلم'], 4);
  const notesIdx = findCol(['ملاحظات', 'notes'], 5);
  const commonIdx = findCol(['المتداول'], 6);
  const latIdx = findCol(['خط العرض', 'lat'], 7);
  const lngIdx = findCol(['خط الطول', 'lng', 'lon'], 8);
  const placeIdIdx = findCol(['Place ID', 'معرّف جوجل'], 12);

  const parsed: ParsedSheetMosqueRow[] = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i] ?? [];
    const officialName = String(row[nameIdx] ?? '').trim();
    if (!officialName) continue;

    let lat = Number(row[latIdx]);
    let lng = Number(row[lngIdx]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const mapsCell = String(row[mapsUrlIdx] ?? '');
      const m = mapsCell.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
      if (m) {
        lat = Number(m[1]);
        lng = Number(m[2]);
      }
    }

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      continue;
    }

    parsed.push({
      rowNumber: i + 1,
      officialName: officialName.slice(0, 150),
      commonName: String(row[commonIdx] ?? '').trim().slice(0, 150),
      locality: (String(row[localityIdx] ?? '').trim() || 'القره بوللي').slice(0, 100),
      landmark: String(row[landmarkIdx] ?? '').trim().slice(0, 200),
      notes: String(row[notesIdx] ?? '').trim().slice(0, 500),
      lat,
      lng,
      googlePlaceId: String(row[placeIdIdx] ?? '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 128),
    });
  }

  return parsed;
}

export function buildMosquePayloadFromSheetRow(
  row: ParsedSheetMosqueRow
): MosqueFormValues {
  return {
    officialName: row.officialName,
    commonName: row.commonName,
    locality: row.locality,
    landmark: row.landmark,
    notes: row.notes,
    lat: row.lat,
    lng: row.lng,
    accuracy: 10,
    photos: [],
    googlePlaceId: row.googlePlaceId || undefined,
  };
}
