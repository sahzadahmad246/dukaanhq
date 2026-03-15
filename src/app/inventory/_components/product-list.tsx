import { Product } from "@/lib/types/inventory";

export function ProductList({
  products,
}: {
  products: (Product & { total_quantity: number })[];
}) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-stone-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm text-stone-600">
        <thead className="bg-stone-50 text-xs uppercase text-stone-500">
          <tr>
            <th className="px-6 py-4 font-medium">Product Name</th>
            <th className="px-6 py-4 font-medium">Type</th>
            <th className="px-6 py-4 font-medium">Purchase Price</th>
            <th className="px-6 py-4 font-medium">Selling Price</th>
            <th className="px-6 py-4 font-medium">In Stock</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {products.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-8 text-center text-stone-500">
                No products found in inventory. Add one to get started.
              </td>
            </tr>
          ) : (
            products.map((product) => (
              <tr key={product.id} className="transition-colors hover:bg-stone-50/50">
                <td className="px-6 py-4 font-medium text-stone-900">
                  {product.name}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${product.tracking_type === "SERIALIZED" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                    {product.tracking_type === "SERIALIZED" ? "Serialized" : "Qty Based"}
                  </span>
                </td>
                <td className="px-6 py-4">₹{product.base_purchase_price}</td>
                <td className="px-6 py-4">₹{product.base_selling_price}</td>
                <td className="px-6 py-4">
                  <span className={`font-medium ${product.total_quantity <= product.low_stock_threshold ? "text-red-600" : "text-stone-900"}`}>
                    {product.total_quantity}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
