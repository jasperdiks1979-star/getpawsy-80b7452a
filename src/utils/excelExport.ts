/**
 * Secure Excel Export Utility
 * 
 * This module provides Excel export functionality without using the vulnerable
 * xlsx/sheetjs package. It generates valid XLSX files using native browser APIs
 * and JSZip for creating the Office Open XML format.
 * 
 * Security: This implementation avoids the Prototype Pollution and ReDoS
 * vulnerabilities present in the xlsx package (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9).
 */

import JSZip from 'jszip';

export interface WorkSheet {
  data: (string | number | boolean | null | undefined)[][];
  name: string;
  columnWidths?: number[];
}

export interface WorkBook {
  sheets: WorkSheet[];
}

/**
 * Escape XML special characters to prevent XML injection
 */
function escapeXml(str: string): string {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert column index to Excel column letter (0 -> A, 1 -> B, 26 -> AA, etc.)
 */
function getColumnLetter(index: number): string {
  let letter = '';
  let temp = index;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Generate the content types XML file
 */
function generateContentTypes(sheetCount: number): string {
  const sheetTypes = Array.from({ length: sheetCount }, (_, i) => 
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  ${sheetTypes}
</Types>`;
}

/**
 * Generate the root relationships file
 */
function generateRootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

/**
 * Generate the workbook relationships file
 */
function generateWorkbookRels(sheetCount: number): string {
  const sheetRels = Array.from({ length: sheetCount }, (_, i) => 
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId${sheetCount + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;
}

/**
 * Generate the workbook XML file
 */
function generateWorkbook(sheets: WorkSheet[]): string {
  const sheetElements = sheets.map((sheet, i) => 
    `<sheet name="${escapeXml(sheet.name.substring(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheetElements}
  </sheets>
</workbook>`;
}

/**
 * Generate the styles XML file with basic header styling
 */
function generateStyles(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font>
      <sz val="11"/>
      <name val="Calibri"/>
    </font>
    <font>
      <b/>
      <sz val="11"/>
      <name val="Calibri"/>
    </font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE5E5E5"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border>
      <left/><right/><top/><bottom/><diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">
      <alignment wrapText="1"/>
    </xf>
  </cellXfs>
</styleSheet>`;
}

/**
 * Generate a worksheet XML file
 */
function generateWorksheet(sheet: WorkSheet, sharedStrings: Map<string, number>): string {
  const { data, columnWidths } = sheet;
  const rows: string[] = [];

  // Calculate dimensions
  const maxRow = data.length;
  const maxCol = Math.max(...data.map(row => row.length), 0);
  const dimension = maxRow > 0 && maxCol > 0 
    ? `A1:${getColumnLetter(maxCol - 1)}${maxRow}` 
    : 'A1';

  // Generate column widths
  let colsXml = '';
  if (columnWidths && columnWidths.length > 0) {
    const colDefs = columnWidths.map((width, i) => 
      `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`
    ).join('');
    colsXml = `<cols>${colDefs}</cols>`;
  }

  // Generate rows
  data.forEach((rowData, rowIndex) => {
    const cells: string[] = [];
    
    rowData.forEach((cellValue, colIndex) => {
      const cellRef = `${getColumnLetter(colIndex)}${rowIndex + 1}`;
      const styleId = rowIndex === 0 ? '1' : '0'; // Header style for first row
      
      if (cellValue === null || cellValue === undefined || cellValue === '') {
        cells.push(`<c r="${cellRef}" s="${styleId}"/>`);
      } else if (typeof cellValue === 'number') {
        cells.push(`<c r="${cellRef}" s="${styleId}"><v>${cellValue}</v></c>`);
      } else if (typeof cellValue === 'boolean') {
        cells.push(`<c r="${cellRef}" s="${styleId}" t="b"><v>${cellValue ? 1 : 0}</v></c>`);
      } else {
        // String value - use shared strings
        const strValue = String(cellValue);
        let stringIndex = sharedStrings.get(strValue);
        if (stringIndex === undefined) {
          stringIndex = sharedStrings.size;
          sharedStrings.set(strValue, stringIndex);
        }
        cells.push(`<c r="${cellRef}" s="${styleId}" t="s"><v>${stringIndex}</v></c>`);
      }
    });

    rows.push(`<row r="${rowIndex + 1}">${cells.join('')}</row>`);
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimension}"/>
  ${colsXml}
  <sheetData>
    ${rows.join('\n    ')}
  </sheetData>
</worksheet>`;
}

/**
 * Generate the shared strings XML file
 */
function generateSharedStrings(sharedStrings: Map<string, number>): string {
  const sortedStrings = Array.from(sharedStrings.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([str]) => `<si><t>${escapeXml(str)}</t></si>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.size}" uniqueCount="${sharedStrings.size}">
  ${sortedStrings}
</sst>`;
}

/**
 * Create an Excel workbook from sheets data
 */
export function createWorkbook(): WorkBook {
  return { sheets: [] };
}

/**
 * Add a sheet to the workbook
 */
export function addSheet(workbook: WorkBook, name: string, data: (string | number | boolean | null | undefined)[][], columnWidths?: number[]): void {
  workbook.sheets.push({ name, data, columnWidths });
}

/**
 * Convert JSON data to a 2D array for the worksheet
 */
export function jsonToSheet<T extends Record<string, unknown>>(data: T[]): (string | number | boolean | null | undefined)[][] {
  if (data.length === 0) return [];
  
  const headers = Object.keys(data[0]);
  const rows: (string | number | boolean | null | undefined)[][] = [headers];
  
  for (const item of data) {
    const row = headers.map(header => {
      const value = item[header];
      if (value === null || value === undefined) return null;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
      }
      return String(value);
    });
    rows.push(row);
  }
  
  return rows;
}

/**
 * Generate and download an Excel file
 */
export async function writeFile(workbook: WorkBook, filename: string): Promise<void> {
  const zip = new JSZip();
  const sharedStrings = new Map<string, number>();

  // First pass: collect all shared strings
  for (const sheet of workbook.sheets) {
    for (const row of sheet.data) {
      for (const cell of row) {
        if (cell !== null && cell !== undefined && typeof cell === 'string') {
          if (!sharedStrings.has(cell)) {
            sharedStrings.set(cell, sharedStrings.size);
          }
        }
      }
    }
  }

  // Generate all XML files
  zip.file('[Content_Types].xml', generateContentTypes(workbook.sheets.length));
  zip.file('_rels/.rels', generateRootRels());
  zip.file('xl/_rels/workbook.xml.rels', generateWorkbookRels(workbook.sheets.length));
  zip.file('xl/workbook.xml', generateWorkbook(workbook.sheets));
  zip.file('xl/styles.xml', generateStyles());
  zip.file('xl/sharedStrings.xml', generateSharedStrings(sharedStrings));

  // Generate worksheet files
  workbook.sheets.forEach((sheet, index) => {
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, generateWorksheet(sheet, sharedStrings));
  });

  // Generate the blob and trigger download
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Convenience API matching the xlsx package API for easier migration
export const utils = {
  book_new: createWorkbook,
  book_append_sheet: (workbook: WorkBook, data: (string | number | boolean | null | undefined)[][], sheetName: string) => {
    addSheet(workbook, sheetName, data);
  },
  json_to_sheet: jsonToSheet,
  aoa_to_sheet: (data: (string | number | boolean | null | undefined)[][]) => data,
};
