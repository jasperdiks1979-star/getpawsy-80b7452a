/** A checkpoint may advance only after exactly one matching product row was written.
 * PostgREST can return error=null for an UPDATE that matched zero rows.
 */
export function assertStockProductUpdateSucceeded(
  error: { message: string } | null,
  updatedRows: Array<{ id: string }> | null,
): void {
  if (error) {
    throw new Error(`Stock product update failed; checkpoint preserved: ${error.message}`);
  }
  if (!Array.isArray(updatedRows) || updatedRows.length !== 1) {
    throw new Error(`Stock product update affected ${updatedRows?.length ?? "unknown"} rows; checkpoint preserved`);
  }
}
