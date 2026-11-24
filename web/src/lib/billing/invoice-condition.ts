export function invoiceItemConditionLabel(
  invoice: { is_second_hand?: boolean },
  item: { product_id?: string | null },
) {
  return invoice.is_second_hand && item.product_id ? "Used phone" : null;
}

export function filterBillingProducts<T extends { is_second_hand?: boolean; total_quantity: number }>(
  products: T[], isSecondHand: boolean, editing = false,
) {
  return products.filter((product) => Boolean(product.is_second_hand) === isSecondHand &&
    (!isSecondHand || editing || product.total_quantity > 0));
}
