/**
 * CSV export that is safe to open in Excel / Google Sheets.
 *
 * Cells that start with = + - @ (or tab/CR) are prefixed with an apostrophe
 * so a malicious message cannot run a spreadsheet formula (CSV injection).
 * A UTF-8 BOM keeps Arabic text readable in Excel.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
	let text = value === null || value === undefined ? "" : String(value);
	if (FORMULA_START.test(text)) text = `'${text}`;
	if (/[",\n\r]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
	return text;
}

export function toCsv<T extends Record<string, unknown>>(
	rows: T[],
	columns: { key: keyof T; header: string }[],
): string {
	const lines = [columns.map((column) => csvCell(column.header)).join(",")];
	for (const row of rows) {
		lines.push(columns.map((column) => csvCell(row[column.key])).join(","));
	}
	return `\uFEFF${lines.join("\r\n")}\r\n`;
}
