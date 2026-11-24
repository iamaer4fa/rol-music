import { test, expect } from '@playwright/test'

test('redirects an unsigned-in user to sign-in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/signin/)
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
})
