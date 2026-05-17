import { test, expect, chromium } from '@playwright/test';

test('Verify Login and Add Sauce Labs Bolt T-Shirt to Cart', async ({ page }) => {
  // Step 1: Navigate to the login page and login
  await page.goto('https://www.saucedemo.com/');
  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');

  // Step 2: Close any pop-up if it appears (assuming no pop-up for now)

  // Step 3: Add Sauce Labs Bolt T-Shirt to cart
  await page.click('[data-test="add-to-cart-sauce-labs-bolt-t-shirt"]');
  const removeButton = page.locator('[data-test="remove-sauce-labs-bolt-t-shirt"]');
  await expect(removeButton).toBeVisible();
});

test('Verify Product in Cart', async ({ page }) => {
  // Step 1: Navigate to the login page and login
  await page.goto('https://www.saucedemo.com/');
  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');

  // Step 2: Click on the Cart Logo
  await page.click('.shopping_cart_link');

  // Step 3: Verify if the "Sauce Labs Bolt T-Shirt" product is added to the cart
  const productInCart = page.locator('.cart_item').filter({ hasText: 'Sauce Labs Bolt T-Shirt' });
  await expect(productInCart).toBeVisible();
});

test('Verify Adding Second Product to Cart', async ({ page }) => {
  // Step 1: Navigate to the login page and login
  await page.goto('https://www.saucedemo.com/');
  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');

  // Step 2: Click on the "Continue Shopping" button (assuming it's the same as navigating back to products)
  await page.click('.shopping_cart_link');

  // Step 3: Add Sauce Labs Backpack to cart
  await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');

  // Step 4: Click on the Cart Logo
  await page.click('.shopping_cart_link');

  // Verify both products are in the cart
  const boltTShirtInCart = page.locator('.cart_item').filter({ hasText: 'Sauce Labs Bolt T-Shirt' });
  const backpackInCart = page.locator('.cart_item').filter({ hasText: 'Sauce Labs Backpack' });
  await expect(boltTShirtInCart).toBeVisible();
  await expect(backpackInCart).toBeVisible();
});

test('Verify Checkout Process', async ({ page }) => {
  // Step 1: Navigate to the login page and login
  await page.goto('https://www.saucedemo.com/');
  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');

  // Step 2: Click on the Cart Logo
  await page.click('.shopping_cart_link');

  // Step 3: Click on the "Checkout" button
  await page.click('[data-test="checkout"]');

  // Verify navigation to checkout page
  await expect(page).toHaveURL(/.*checkout-step-one/);
});

test('Verify Login with Invalid Credentials', async ({ page }) => {
  // Step 1: Navigate to the login page and attempt login with invalid credentials
  await page.goto('https://www.saucedemo.com/');
  await page.fill('#user-name', 'invalid_user');
  await page.fill('#password', 'invalid_password');
  await page.click('#login-button');

  // Verify error message is displayed
  const errorMessage = page.locator('[data-test="error"]');
  await expect(errorMessage).toContainText('Username and password do not match');
});