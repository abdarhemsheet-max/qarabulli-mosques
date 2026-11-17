import type { MosqueRecord } from '../../types/mosque';

// The Excel library is large (~800 KB); load it only when someone exports.
export async function exportExcel(mosques: MosqueRecord[]): Promise<void> {
  const { exportMosquesToExcel } = await import('./excelExport');
  exportMosquesToExcel(mosques);
}
