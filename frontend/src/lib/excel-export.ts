/** Build a SpreadsheetML workbook Excel opens as .xls (no extra npm dependency). */

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cellXml(v: string | number): string {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${escXml(String(v ?? ''))}</Data></Cell>`;
}

/** Download rows as an Excel-compatible .xls file using the given header labels. */
export function downloadExcelFile(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const headerRow = `<Row>${headers.map((h) => cellXml(h)).join('')}</Row>`;
  const dataRows = rows.map((r) => `<Row>${r.map((c) => cellXml(c)).join('')}</Row>`).join('');
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${escXml(sheetName.slice(0, 31) || 'Sheet1')}">
  <Table>
   ${headerRow}
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xls') || filename.endsWith('.xlsx') ? filename.replace(/\.xlsx$/i, '.xls') : `${filename}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}
