import { test, expect } from '@playwright/test'
import { pickFrance, resetStand } from './helpers.js'

// Le stand est singleton : ces tests restent volontairement séquentiels.
test.beforeEach(async ({ baseURL }) => {
  await resetStand(baseURL!)
})

test('accès direct, vraie 3D détaillée et confidentialité réseau, sans accueil ni formulaire de partie', async ({
  page,
}) => {
  let websocketOpened = false
  const errors: string[] = [],
    frames: string[] = [],
    requests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => requests.push(request.url()))
  // L'état initial peut arriver par polling avant l'upgrade WebSocket.
  page.on('response', (response) => {
    if (response.url().includes('/socket.io') && response.request().method() === 'GET') {
      void response
        .text()
        .then((body) => frames.push(body))
        .catch(() => undefined)
    }
  })
  page.on('websocket', (socket) => {
    if (socket.url().includes('/socket.io')) {
      websocketOpened = true
      socket.on('framereceived', (frame) => frames.push(String(frame.payload)))
    }
  })
  await page.goto('/')
  await expect(page).toHaveURL(/\/jouer$/)
  await expect(page.getByTestId('globe')).toHaveAttribute('data-renderer', 'webgl')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-lod', '50m')
  await expect(page.locator('.question-card h1')).not.toBeEmpty()
  await expect(page.getByRole('button', { name: 'Valider mon choix' })).toBeDisabled()
  await expect(page.locator('input')).toHaveCount(0)
  await expect(page.getByText(/Créer une salle|Rejoindre une partie/)).toHaveCount(0)
  await expect.poll(() => websocketOpened).toBeTruthy()
  await expect.poll(() => frames.some((frame) => frame.includes('stand:state'))).toBeTruthy()
  expect(
    frames
      .filter((frame) => frame.includes('stand:state'))
      .every(
        (frame) =>
          !frame.includes('"answer":') &&
          !frame.includes('"countryId":') &&
          !frame.includes('"location":'),
      ),
  ).toBeTruthy()
  expect(requests.some((url) => /rivers|fleuves|\/api\/questions/.test(url))).toBeFalsy()
  const graphics = await page.locator('.webgl-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2')
    return {
      webgl: gl instanceof WebGL2RenderingContext,
      lost: gl?.isContextLost(),
      ratio: canvas.width / canvas.getBoundingClientRect().width,
    }
  })
  expect(graphics.webgl).toBeTruthy()
  expect(graphics.lost).toBeFalsy()
  expect(graphics.ratio).toBeLessThanOrEqual(1.76)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  expect(errors).toEqual([])
})

test('clic sur la Terre, sélection puis validation ; aucun champ de réponse écrite', async ({
  page,
}) => {
  await page.goto('/jouer')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-lod', '50m')
  await pickFrance(page)
  await expect(page.locator('.selection-summary strong')).toHaveText('France')
  const validate = page.getByRole('button', { name: 'Valider mon choix' })
  await expect(validate).toBeEnabled()
  await validate.click()
  await expect
    .poll(
      async () =>
        Boolean(await page.locator('.feedback').count()) ||
        Boolean(await page.getByText(/seconde chance !/).count()),
    )
    .toBeTruthy()
  if (!(await page.locator('.feedback').count())) {
    await expect(page.getByText(/seconde chance !/)).toBeVisible()
    await expect(validate).toBeEnabled()
    await validate.click()
  }
  await expect(page.locator('.feedback')).toBeVisible()
  await expect(page.locator('.waiting-next')).toBeVisible()
  await expect(validate).toHaveCount(0)
})

test('pupitre, indices, verdict, question suivante et classement du prochain visiteur', async ({
  page,
  context,
}) => {
  await page.goto('/presentateur')
  await expect(page.locator('.private-answer h2')).toBeVisible()
  await page.getByLabel('Thématique', { exact: true }).selectOption('capitales')
  await expect(page.getByLabel('Difficulté', { exact: true })).toBeEnabled()
  await page.getByLabel('Difficulté', { exact: true }).selectOption('4')
  await expect(page.locator('.difficulty')).toContainText('Expert')
  await expect(page.getByLabel('Pseudo du visiteur')).toBeEnabled()
  await page.getByLabel('Pseudo du visiteur').fill('Culture-UI')
  await page.getByRole('button', { name: 'Enregistrer le pseudo' }).click()
  await expect(page.locator('.participant-row')).toContainText('Culture-UI')
  const country = await page.locator('.private-answer h2').innerText()
  const player = await context.newPage()
  await player.goto('/jouer')
  await expect(player.locator('.participant-row')).toContainText('Culture-UI')
  await expect(player.locator('.private-answer')).toHaveCount(0)
  await page.getByRole('button', { name: 'Indice 0/2' }).click()
  await expect(player.locator('.hints')).toContainText('Indice 1.')
  await page.getByRole('button', { name: 'Passer', exact: true }).click()
  await expect(player.locator('.feedback h2')).toHaveText(country)
  await page.getByRole('button', { name: 'Accepter', exact: true }).click()
  await expect(player.locator('.score-pill strong')).toHaveText('35')
  await page.getByRole('button', { name: 'Question suivante', exact: true }).click()
  await expect(player.locator('.feedback')).toHaveCount(0)
  await expect(player.locator('.selection-summary strong')).toHaveText(
    'Choisissez un pays sur le globe',
  )
  await page.getByRole('button', { name: 'Terminer le passage', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Passage enregistré')
  await expect(player.locator('.score-pill strong')).toHaveText('0')
  await expect(player.getByRole('region', { name: 'Classement du stand' })).toContainText(
    'Culture-UI',
  )
  await expect(player.getByRole('region', { name: 'Classement du stand' })).toContainText('35')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})

test('Ctrl+F et bouton tactile activent et quittent le plein écran', async ({ page }) => {
  await page.goto('/jouer')
  await expect(
    page.getByRole('button', { name: 'Plein écran (Ctrl+F)', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Control+f')
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBeTruthy()
  await page.keyboard.press('Control+f')
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBeFalsy()
  await page.getByRole('button', { name: 'Plein écran (Ctrl+F)', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBeTruthy()
  await page.getByRole('button', { name: 'Quitter le plein écran', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBeFalsy()
})

test('plein écran refusé : message explicite, interface toujours utilisable', async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = async () => {
      throw new Error('Refus simulé')
    }
  })
  await page.goto('/jouer')
  await page.getByRole('button', { name: 'Plein écran (Ctrl+F)', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('a refusé le plein écran')
  await expect(page.locator('.question-card h1')).not.toBeEmpty()
})

test('WebGL indisponible : carte de secours cliquable, pas d’écran vide', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null
      return Reflect.apply(original, this, [type, ...args])
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await page.goto('/jouer')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-renderer', '2d')
  await expect(page.locator('.flat-globe canvas')).toHaveAttribute('data-ready', 'true')
  await pickFrance(page, true)
  await expect(page.locator('.selection-summary strong')).toHaveText('France')
  await expect(page.getByRole('button', { name: 'Valider mon choix' })).toBeEnabled()
})

test('perte du contexte GPU : secours puis restauration volontaire de la vraie 3D', async ({
  page,
}) => {
  await page.goto('/jouer')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-renderer', 'webgl')
  await page.locator('.webgl-canvas').evaluate((canvas: HTMLCanvasElement) => {
    canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
  })
  await expect(page.getByTestId('globe')).toHaveAttribute('data-renderer', '2d')
  await page.getByRole('button', { name: 'Réessayer la 3D' }).click()
  await expect(page.getByTestId('globe')).toHaveAttribute('data-renderer', 'webgl')
})

test('optimisation : routes différées au zoom et rendu au repos sans boucle permanente', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const counted = window as unknown as { __globeRaf: number }
    counted.__globeRaf = 0
    const original = requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (callback) => {
      counted.__globeRaf++
      return original(callback)
    }
  })
  const roads: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('roads-10m')) roads.push(request.url())
  })
  await page.goto('/jouer')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-lod', '50m')
  expect(roads).toHaveLength(0)
  const zoom = page.getByRole('button', { name: 'Zoomer sur le globe', exact: true })
  await zoom.click()
  await zoom.click()
  await expect(page.getByTestId('globe')).toHaveAttribute('data-roads', 'ready')
  expect(roads).toHaveLength(1)
  await page.waitForTimeout(1_500)
  const before = await page.evaluate(() => (window as unknown as { __globeRaf: number }).__globeRaf)
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => (window as unknown as { __globeRaf: number }).__globeRaf)
  expect(after - before).toBeLessThanOrEqual(2)
})
