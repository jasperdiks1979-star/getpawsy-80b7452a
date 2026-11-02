/** A product may only consume its sync checkpoint after its DB update succeeds. */
export function assertStockProductUpdateSucceeded(error: { message: string } | null): void {
  if (error) {
    throw new Error(`Stock product update failed; checkpoint preserved: ${error.message}`);
  }
}
