/**
 * Secure Styled Excel Export Utility
 * 
 * This module provides advanced Excel export functionality with styling support
 * without using the vulnerable xlsx/sheetjs package. It generates valid XLSX files
 * using native browser APIs and JSZip for creating the Office Open XML format.
 * 
 * Security: This implementation avoids the Prototype Pollution and ReDoS
 * vulnerabilities present in the xlsx package (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9).
 */

import JSZip from 'jszip';

export interface CellStyle {
  fill?: { fgColor: { rgb: string } };
  font?: { 
    bold?: boolean; 
    color?: { rgb: string }; 
    sz?: number;
  };
  alignment?: { 
    horizontal?: 'left' | 'center' | 'right'; 
    vertical?: 'top' | 'center' | 'bottom';
    wrapText?: boolean;
  };
  border?: {
    top?: { style: string; color: { rgb: string } };
    bottom?: { style: string; color: { rgb: string } };
    left?: { style: string; color: { rgb: string } };
    right?: { style: string; color: { rgb: string } };
  };
}

export interface StyledCell {
  value: string | number | boolean | null | undefined;
  style?: CellStyle;
}

export interface StyledWorkSheet {
  data: (StyledCell | string | number | boolean | null | undefined)[][];
  name: string;
  columnWidths?: number[];
  freezePane?: { row: number; col: number };
}

export interface StyledWorkBook {
  sheets: StyledWorkSheet[];
  styles: Map<string, number>;
}

// Style registry to track unique styles
interface StyleRegistry {
  fills: Map<string, number>;
  fonts: Map<string, number>;
  borders: Map<string, number>;
  cellXfs: Map<string, number>;
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
 * Encode column index (for compatibility)
 */
export function encodeCol(index: number): string {
  return getColumnLetter(index);
}

/**
 * Encode cell reference
 */
export function encodeCell(ref: { r: number; c: number }): string {
  return `${getColumnLetter(ref.c)}${ref.r + 1}`;
}

/**
 * Decode cell range string to object
 */
export function decodeRange(rangeStr: string): { s: { r: number; c: number }; e: { r: number; c: number } } {
  const match = rangeStr.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
  if (!match) return { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  
  const colToNum = (col: string): number => {
    let num = 0;
    for (let i = 0; i < col.length; i++) {
      num = num * 26 + (col.charCodeAt(i) - 64);
    }
    return num - 1;
  };
  
  return {
    s: { r: parseInt(match[2]) - 1, c: colToNum(match[1]) },
    e: { r: parseInt(match[4]) - 1, c: colToNum(match[3]) }
  };
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
function generateWorkbook(sheets: StyledWorkSheet[]): string {
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
 * Build style registry from all cells
 */
function buildStyleRegistry(sheets: StyledWorkSheet[]): StyleRegistry {
  const registry: StyleRegistry = {
    fills: new Map([['none', 0], ['gray125', 1]]),
    fonts: new Map([['default', 0]]),
    borders: new Map([['none', 0]]),
    cellXfs: new Map([['0|0|0|0', 0]]) // fontId|fillId|borderId|numFmtId
  };

  // Add bold font
  registry.fonts.set('bold', 1);
  
  for (const sheet of sheets) {
    for (const row of sheet.data) {
      for (const cell of row) {
        if (cell && typeof cell === 'object' && 'style' in cell && cell.style) {
          const style = cell.style;
          
          // Register fill
          if (style.fill?.fgColor?.rgb) {
            const fillKey = style.fill.fgColor.rgb;
            if (!registry.fills.has(fillKey)) {
              registry.fills.set(fillKey, registry.fills.size);
            }
          }
          
          // Register font
          if (style.font) {
            const fontKey = JSON.stringify(style.font);
            if (!registry.fonts.has(fontKey)) {
              registry.fonts.set(fontKey, registry.fonts.size);
            }
          }
          
          // Register border
          if (style.border) {
            const borderKey = JSON.stringify(style.border);
            if (!registry.borders.has(borderKey)) {
              registry.borders.set(borderKey, registry.borders.size);
            }
          }
        }
      }
    }
  }
  
  return registry;
}

/**
 * Get style index for a cell
 */
function getStyleIndex(style: CellStyle | undefined, registry: StyleRegistry): number {
  if (!style) return 0;
  
  let fontId = 0;
  let fillId = 0;
  let borderId = 0;
  
  if (style.font) {
    const fontKey = JSON.stringify(style.font);
    fontId = registry.fonts.get(fontKey) ?? 0;
    if (fontId === 0 && style.font.bold) {
      fontId = 1; // Use bold font
    }
  }
  
  if (style.fill?.fgColor?.rgb) {
    fillId = registry.fills.get(style.fill.fgColor.rgb) ?? 0;
  }
  
  if (style.border) {
    const borderKey = JSON.stringify(style.border);
    borderId = registry.borders.get(borderKey) ?? 0;
  }
  
  // Simple style index calculation
  // For now, return based on whether it has fill and/or bold
  if (fillId > 1 && fontId === 1) return 3; // Filled + bold (header style)
  if (fillId > 1) return 2 + fillId; // Just filled
  if (fontId === 1) return 1; // Just bold
  return 0; // Default
}

/**
 * Generate the styles XML file with dynamic styles
 */
function generateStyles(registry: StyleRegistry): string {
  // Generate fonts
  const fontsXml = Array.from(registry.fonts.entries()).map(([key]) => {
    if (key === 'default') {
      return '<font><sz val="11"/><name val="Calibri"/></font>';
    }
    if (key === 'bold') {
      return '<font><b/><sz val="11"/><name val="Calibri"/></font>';
    }
    try {
      const font = JSON.parse(key);
      let fontXml = '<font>';
      if (font.bold) fontXml += '<b/>';
      fontXml += `<sz val="${font.sz || 11}"/>`;
      if (font.color?.rgb) fontXml += `<color rgb="FF${font.color.rgb}"/>`;
      fontXml += '<name val="Calibri"/></font>';
      return fontXml;
    } catch {
      return '<font><sz val="11"/><name val="Calibri"/></font>';
    }
  }).join('');

  // Generate fills
  const fillsXml = Array.from(registry.fills.entries()).map(([key]) => {
    if (key === 'none') return '<fill><patternFill patternType="none"/></fill>';
    if (key === 'gray125') return '<fill><patternFill patternType="gray125"/></fill>';
    return `<fill><patternFill patternType="solid"><fgColor rgb="FF${key}"/></patternFill></fill>`;
  }).join('');

  // Generate borders
  const bordersXml = Array.from(registry.borders.entries()).map(([key]) => {
    if (key === 'none') return '<border><left/><right/><top/><bottom/><diagonal/></border>';
    try {
      const border = JSON.parse(key);
      let xml = '<border>';
      if (border.left) xml += `<left style="${border.left.style}"><color rgb="FF${border.left.color.rgb}"/></left>`;
      else xml += '<left/>';
      if (border.right) xml += `<right style="${border.right.style}"><color rgb="FF${border.right.color.rgb}"/></right>`;
      else xml += '<right/>';
      if (border.top) xml += `<top style="${border.top.style}"><color rgb="FF${border.top.color.rgb}"/></top>`;
      else xml += '<top/>';
      if (border.bottom) xml += `<bottom style="${border.bottom.style}"><color rgb="FF${border.bottom.color.rgb}"/></bottom>`;
      else xml += '<bottom/>';
      xml += '<diagonal/></border>';
      return xml;
    } catch {
      return '<border><left/><right/><top/><bottom/><diagonal/></border>';
    }
  }).join('');

  // Generate cellXfs for styling combinations
  const numCellXfs = Math.max(registry.fills.size + 2, 5);
  let cellXfsXml = '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'; // Default
  cellXfsXml += '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'; // Bold
  
  // Add fills starting from index 2
  for (let i = 2; i < registry.fills.size; i++) {
    cellXfsXml += `<xf numFmtId="0" fontId="0" fillId="${i}" borderId="0" xfId="0" applyFill="1"/>`;
  }
  
  // Add header style (bold + fill)
  cellXfsXml += `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="${registry.fonts.size}">${fontsXml}</fonts>
  <fills count="${registry.fills.size}">${fillsXml}</fills>
  <borders count="${registry.borders.size}">${bordersXml}</borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="${numCellXfs}">${cellXfsXml}</cellXfs>
</styleSheet>`;
}

/**
 * Generate a worksheet XML file
 */
function generateWorksheet(
  sheet: StyledWorkSheet, 
  sharedStrings: Map<string, number>,
  registry: StyleRegistry
): string {
  const { data, columnWidths, freezePane } = sheet;
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

  // Generate sheet views with freeze pane
  let sheetViewsXml = '<sheetViews><sheetView tabSelected="1" workbookViewId="0">';
  if (freezePane && (freezePane.row > 0 || freezePane.col > 0)) {
    const topLeftCell = `${getColumnLetter(freezePane.col)}${freezePane.row + 1}`;
    sheetViewsXml += `<pane xSplit="${freezePane.col}" ySplit="${freezePane.row}" topLeftCell="${topLeftCell}" activePane="bottomRight" state="frozen"/>`;
  }
  sheetViewsXml += '</sheetView></sheetViews>';

  // Generate rows
  data.forEach((rowData, rowIndex) => {
    const cells: string[] = [];
    
    rowData.forEach((cellData, colIndex) => {
      const cellRef = `${getColumnLetter(colIndex)}${rowIndex + 1}`;
      
      // Handle styled cells vs plain values
      let cellValue: string | number | boolean | null | undefined;
      let styleId = 0;
      
      if (cellData && typeof cellData === 'object' && 'value' in cellData) {
        cellValue = cellData.value;
        styleId = getStyleIndex(cellData.style, registry);
      } else {
        cellValue = cellData as string | number | boolean | null | undefined;
        // Apply header style to first row by default
        styleId = rowIndex === 0 ? 1 : 0;
      }
      
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
  ${sheetViewsXml}
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
 * Create a styled Excel workbook
 */
export function createStyledWorkbook(): StyledWorkBook {
  return { sheets: [], styles: new Map() };
}

/**
 * Add a sheet to the workbook
 */
export function addStyledSheet(
  workbook: StyledWorkBook, 
  name: string, 
  data: (StyledCell | string | number | boolean | null | undefined)[][], 
  options?: { columnWidths?: number[]; freezePane?: { row: number; col: number } }
): void {
  workbook.sheets.push({ 
    name, 
    data, 
    columnWidths: options?.columnWidths,
    freezePane: options?.freezePane
  });
}

/**
 * Convert array of arrays to worksheet format (compatibility function)
 */
export function aoaToSheet(data: string[][]): string[][] {
  return data;
}

/**
 * Generate and download a styled Excel file
 */
export async function writeStyledFile(workbook: StyledWorkBook, filename: string): Promise<Uint8Array> {
  const zip = new JSZip();
  const sharedStrings = new Map<string, number>();
  const registry = buildStyleRegistry(workbook.sheets);

  // First pass: collect all shared strings
  for (const sheet of workbook.sheets) {
    for (const row of sheet.data) {
      for (const cell of row) {
        const value = cell && typeof cell === 'object' && 'value' in cell ? cell.value : cell;
        if (value !== null && value !== undefined && typeof value === 'string') {
          if (!sharedStrings.has(value)) {
            sharedStrings.set(value, sharedStrings.size);
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
  zip.file('xl/styles.xml', generateStyles(registry));
  zip.file('xl/sharedStrings.xml', generateSharedStrings(sharedStrings));

  // Generate worksheet files
  workbook.sheets.forEach((sheet, index) => {
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, generateWorksheet(sheet, sharedStrings, registry));
  });

  // Generate the blob
  const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' });
  return new Uint8Array(arrayBuffer);
}

/**
 * Download a styled Excel file
 */
export async function downloadStyledFile(workbook: StyledWorkBook, filename: string): Promise<void> {
  const data = await writeStyledFile(workbook, filename);
  const blob = new Blob([new Uint8Array(data)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  // Check if Web Share API is available (iOS Safari)
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const shareData = { files: [file] };
    
    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
      }
    }
  }
  
  // Fallback: regular download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Compatibility utils object matching xlsx-js-style API
export const styledUtils = {
  book_new: createStyledWorkbook,
  book_append_sheet: (workbook: StyledWorkBook, worksheet: string[][], sheetName: string) => {
    addStyledSheet(workbook, sheetName, worksheet);
  },
  aoa_to_sheet: aoaToSheet,
  encode_cell: encodeCell,
  encode_col: encodeCol,
  decode_range: decodeRange,
};
