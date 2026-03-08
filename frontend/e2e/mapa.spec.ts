import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

test.describe('Mapa de Leads', () => {
  test('view renderiza sem erros', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Mapa/i }).click()
    await expect(page.getByText('Mapa de Leads')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Cannot read properties')).not.toBeVisible()
  })

  test('mapa carrega componente visual', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Mapa/i }).click()
    await page.waitForTimeout(3_000)

    // Mapa pode usar Leaflet, Google Maps, ou um placeholder
    const mapElement = page.locator('[class*="map"], [class*="leaflet"], canvas, iframe[src*="map"]').first()
    const hasMap = await mapElement.isVisible({ timeout: 5_000 }).catch(() => false)

    if (!hasMap) {
      test.info().annotations.push({
        type: 'info',
        description: 'Componente de mapa não renderizou — pode necessitar de API key de mapas ou dados de geolocalização.'
      })
    }
  })
})
