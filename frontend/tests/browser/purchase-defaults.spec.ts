import { test, expect, type Page } from '@playwright/test';
import { mockApi, product, store } from './fixtures';
import { mockRollout } from './rollout-fixtures';

async function purchaseOptions(page: Page) {
  await page.route('**/products?**', (route) => route.fulfill({ json: {
    items: [
      { ...product, purchaseToBaseRatio: '24', suggestedUnitCost: '120006' },
      { ...product, id: 'product-2', sku: 'SECOND', name: 'Second product', suggestedUnitCost: '19500' },
      { ...product, id: 'product-3', sku: 'UNKNOWN', name: 'No default cost', suggestedUnitCost: null },
    ], total: 3, page: 1, pageSize: 100,
  } }));
}

for (const role of ['ADMIN', 'STORE_MANAGER']) {
  test(`${role} gets editable product-specific purchase costs without filling other fields`, async ({ page }) => {
    const api = await mockApi(page, { role });
    await purchaseOptions(page);
    await page.goto('/purchases');
    await page.getByRole('button', { name: 'Tạo phiếu nhập', exact: true }).click();
    const dialog = page.getByRole('dialog');
    if (role === 'ADMIN') await dialog.locator('#purchase-location').selectOption(store.id);
    const select = dialog.locator('#purchase-product-0');
    const cost = dialog.locator('#purchase-cost-0');
    const quantity = dialog.locator('#purchase-quantity-0');
    await select.selectOption(product.id);
    await expect(cost).toHaveValue('120006');
    await expect(quantity).toHaveValue('');
    await expect(dialog.locator('#purchase-lot-0')).toHaveValue('');
    await expect(dialog.locator('#purchase-expiry-0')).toHaveValue('');
    await quantity.fill('3.5');
    await dialog.locator('#purchase-lot-0').fill('LOT-USER');
    await dialog.locator('#purchase-expiry-0').fill('2027-12-31');
    await dialog.locator('#purchase-note').fill('Manual note');
    await cost.fill('110000');
    await dialog.getByRole('button', { name: 'English', exact: true }).click();
    await expect(cost).toHaveValue('110000');
    await select.selectOption('product-2');
    await expect(cost).toHaveValue('19500');
    await expect(quantity).toHaveValue('3.5');
    await expect(dialog.locator('#purchase-lot-0')).toHaveValue('LOT-USER');
    await expect(dialog.locator('#purchase-expiry-0')).toHaveValue('2027-12-31');
    await expect(dialog.locator('#purchase-note')).toHaveValue('Manual note');
    await select.selectOption('product-3');
    await expect(cost).toHaveValue('');
    await select.selectOption('');
    await expect(cost).toHaveValue('');
    await select.selectOption('product-2');
    await cost.fill('19000');
    await dialog.getByRole('button', { name: 'Add item', exact: true }).click();
    await dialog.locator('#purchase-product-1').selectOption(product.id);
    await expect(dialog.locator('#purchase-cost-1')).toHaveValue('120006');
    await expect(dialog.locator('#purchase-quantity-1')).toHaveValue('');
    await expect(cost).toHaveValue('19000');
    await dialog.locator('#purchase-quantity-1').fill('2');
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect.poll(() => api.writes.length).toBe(1);
    expect(api.writes[0].body).toMatchObject({
      note: 'Manual note',
      items: [
        { productId: 'product-2', purchaseQuantity: '3.5', unitCost: '19000', lotNumber: 'LOT-USER', expiryDate: '2027-12-31' },
        { productId: product.id, purchaseQuantity: '2', unitCost: '120006', lotNumber: null, expiryDate: null },
      ],
    });
  });
}

test('opening an existing purchase preserves its saved cost and quantity', async ({ page }) => {
  await mockRollout(page);
  await purchaseOptions(page);
  await page.goto('/purchases');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('#purchase-cost-0')).toHaveValue('5000.25');
  await expect(dialog.locator('#purchase-quantity-0')).toHaveValue('1.5');
  await dialog.locator('#purchase-quantity-0').fill('2');
  await expect(dialog.locator('#purchase-cost-0')).toHaveValue('5000.25');
});
