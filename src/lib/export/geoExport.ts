import type { MosqueRecord } from '../../types/mosque';
import { formatEnglishDate } from '../utils/geo';

function escapeXml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeCsvCell(val: string | number): string {
  const s = String(val ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exports mosques to KML 2.2 suitable for direct import into Google My Maps.
 */
export function exportMosquesToKml(mosques: MosqueRecord[]): void {
  const placemarks = mosques
    .map((m) => {
      const lat = Number(m.lat.toFixed(6));
      const lng = Number(m.lng.toFixed(6));
      const descParts = [
        `المحلة / المنطقة: ${escapeXml(m.locality)}`,
        m.commonName ? `الاسم المتداول: ${escapeXml(m.commonName)}` : '',
        m.landmark ? `العلامة الدالة: ${escapeXml(m.landmark)}` : '',
        m.notes ? `ملاحظات: ${escapeXml(m.notes)}` : '',
        `رابط خرائط جوجل: ${escapeXml(m.mapsUrl)}`,
      ]
        .filter(Boolean)
        .join('<br/>');

      return `    <Placemark>
      <name>${escapeXml(m.officialName)}</name>
      <description><![CDATA[${descParts}]]></description>
      <styleUrl>#awqafMosqueStyle</styleUrl>
      <ExtendedData>
        <Data name="الاسم"><value>${escapeXml(m.officialName)}</value></Data>
        <Data name="المحلة / المنطقة"><value>${escapeXml(m.locality)}</value></Data>
        <Data name="العلامة الدالة"><value>${escapeXml(m.landmark || '')}</value></Data>
        <Data name="الاسم المتداول"><value>${escapeXml(m.commonName || '')}</value></Data>
        <Data name="خط العرض"><value>${lat}</value></Data>
        <Data name="خط الطول"><value>${lng}</value></Data>
        <Data name="رابط خرائط جوجل"><value>${escapeXml(m.mapsUrl)}</value></Data>
      </ExtendedData>
      <Point>
        <coordinates>${lng},${lat},0</coordinates>
      </Point>
    </Placemark>`;
    })
    .join('\n');

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml('مساجد مكتب أوقاف القره بوللي')}</name>
    <Style id="awqafMosqueStyle">
      <IconStyle>
        <color>ff3a4c0f</color>
        <scale>1.1</scale>
        <Icon>
          <href>https://maps.google.com/mapfiles/kml/paddle/grn-circle.png</href>
        </Icon>
      </IconStyle>
    </Style>
${placemarks}
  </Document>
</kml>`;

  const today = formatEnglishDate(new Date()).replace(/\//g, '-');
  triggerDownload(
    kml,
    `مساجد_أوقاف_القره_بوللي_${today}.kml`,
    'application/vnd.google-earth.kml+xml;charset=utf-8'
  );
}

/**
 * Exports mosques to UTF-8 BOM CSV compatible with Google My Maps (auto-detects Latitude & Longitude).
 */
export function exportMosquesToCsv(mosques: MosqueRecord[]): void {
  const headers = [
    'الاسم',
    'المحلة / المنطقة',
    'العلامة الدالة',
    'الاسم المتداول',
    'خط العرض (Latitude)',
    'خط الطول (Longitude)',
    'رابط خرائط جوجل',
    'ملاحظات',
  ];

  const rows = mosques.map((m) =>
    [
      escapeCsvCell(m.officialName),
      escapeCsvCell(m.locality),
      escapeCsvCell(m.landmark || ''),
      escapeCsvCell(m.commonName || ''),
      escapeCsvCell(m.lat.toFixed(6)),
      escapeCsvCell(m.lng.toFixed(6)),
      escapeCsvCell(m.mapsUrl),
      escapeCsvCell(m.notes || ''),
    ].join(',')
  );

  const csvContent = `\uFEFF${[headers.map(escapeCsvCell).join(','), ...rows].join('\r\n')}`;
  const today = formatEnglishDate(new Date()).replace(/\//g, '-');
  triggerDownload(
    csvContent,
    `مساجد_أوقاف_القره_بوللي_${today}.csv`,
    'text/csv;charset=utf-8;'
  );
}
