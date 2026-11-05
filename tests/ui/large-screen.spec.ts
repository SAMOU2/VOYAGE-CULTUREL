import { test, expect } from '@playwright/test'
import { openPlayer, pickFrance, resetStand, waitGlobe, savePreview } from './helpers.js'

for (const screen of [
  { name: '1080p', width: 1920, height: 1080, texture: 4096 },
  { name: '4K', width: 3840, height: 2160, texture: 8192 },
]) {
  test(`borne tactile 43 pouces ${screen.name} : globe dominant et interface lisible`, async ({
    page,
    baseURL,
  }) => {
    await resetStand(baseURL!)
    await page.setViewportSize({ width: screen.width, height: screen.height })
    await openPlayer(page)
    await waitGlobe(page)
    const max = await page
      .locator('canvas.webgl-canvas')
      .evaluate(
        (node) =>
          (node as HTMLCanvasElement)
            .getContext('webgl2')!
            .getParameter(WebGL2RenderingContext.MAX_TEXTURE_SIZE) as number,
      )
    await expect(page.getByTestId('globe')).toHaveAttribute(
      'data-texture',
      String(max >= 8192 ? screen.texture : 4096),
    )
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth === innerWidth &&
          document.documentElement.scrollHeight === innerHeight,
      ),
    ).toBe(true)
    const world = await page.locator('.player-world').boundingBox()
    expect(world!.width / screen.width).toBeGreaterThan(0.65)
    expect(world!.width / screen.width).toBeLessThan(0.75)
    const button = await page
      .getByRole('button', { name: 'Valider mon choix', exact: true })
      .boundingBox()
    expect(button!.height).toBeGreaterThanOrEqual(48)
    expect(
      await page
        .locator('.player-sidebar')
        .evaluate((node) => node.scrollHeight <= node.clientHeight + 2),
    ).toBe(true)
    await pickFrance(page)
    await expect(page.locator('.selection-summary strong')).toHaveText('France')
    await page.getByRole('button', { name: 'Valider mon choix', exact: true }).tap()
    await expect(page.locator('.feedback')).toBeVisible()
    const next = await page
      .getByRole('button', { name: 'Question suivante', exact: true })
      .boundingBox()
    expect(next!.y + next!.height).toBeLessThan(screen.height - 25)
    if (screen.name === '4K') await savePreview(page, '4k')
    await page.screenshot({ path: `.cache/large-${screen.name}.png`, animations: 'disabled' })
  })
}
