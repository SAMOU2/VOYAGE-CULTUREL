import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { CountryFact } from '../../shared/types.js'
import {
  chooseCorrect,
  endGame,
  openAdmin,
  openPlayer,
  pickFrance,
  resetStand,
  seedDemoScores,
  savePreview,
  stateOf,
  uniqueName,
  waitGlobe,
} from './helpers.js'

test.beforeAll(async ({ baseURL }, info) => {
  if (process.env.CAPTURE_DOCS === '1' && info.project.name === 'ordinateur')
    await seedDemoScores(baseURL!)
})

test.beforeEach(async ({ baseURL }) => {
  await resetStand(baseURL!)
})

test('marque, nom obligatoire, claviers tactile/physique, accents et arabe', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/jouer$/)
  await expect(page.getByAltText('ALGOMANIA Scientific Club')).toBeVisible()
  await expect(
    page.getByText(/VOYAGE CULTUREL|RENCONTRER · DÉCOUVRIR · PARTAGER|International Students Day/),
  ).toHaveCount(0)
  const play = page.getByRole('button', { name: 'Jouer', exact: true })
  await expect(play).toBeEnabled()
  await page.keyboard.press('Tab')
  await expect(play).toBeFocused()
  await play.click()
  const field = page.getByRole('textbox', { name: 'Nom et prénom', exact: true }),
    start = page.getByRole('button', { name: 'Commencer la partie', exact: true })
  await expect(page.getByRole('textbox')).toHaveCount(1)
  await expect(field).toHaveAttribute('required', '')
  await expect(start).toBeDisabled()
  for (const key of 'LINA BENALI')
    await page.getByRole('button', { name: key === ' ' ? 'Espace' : key, exact: true }).click()
  await expect(field).toHaveValue('Lina Benali')
  await page.getByRole('button', { name: 'Effacer le dernier caractère', exact: true }).click()
  await expect(field).toHaveValue('Lina Benal')
  await page.getByRole('button', { name: 'Clavier avec accents', exact: true }).click()
  await page.getByRole('button', { name: 'É', exact: true }).click()
  await expect(field).toHaveValue('Lina Benalé')
  if (process.env.CAPTURE_DOCS === '1' && page.viewportSize()!.width > 680) {
    await field.fill('Inès Amrani (démo)')
    await savePreview(page, 'clavier')
  }
  await page.getByRole('button', { name: 'Tout effacer', exact: true }).click()
  await page.getByRole('button', { name: 'Clavier arabe', exact: true }).click()
  for (const key of 'أمين بن علي')
    await page.getByRole('button', { name: key === ' ' ? 'Espace' : key, exact: true }).click()
  await expect(field).toHaveValue('أمين بن علي')
  const name = uniqueName()
  await field.fill(name)
  await start.click()
  await expect(page.locator('.player-shell')).toHaveAttribute('data-kiosk-view', 'game')
  await expect(page.locator('.player-identity strong')).toHaveText(name)
})

test('vrai globe : picking France, validation serveur, verdict et routes au zoom', async ({
  page,
}) => {
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await openPlayer(
    page,
    process.env.CAPTURE_DOCS === '1'
      ? page.viewportSize()!.width < 680
        ? 'Amine Saadi (démo)'
        : 'Nour Haddad (démo)'
      : uniqueName(),
  )
  await waitGlobe(page)
  await expect(page.getByRole('textbox')).toHaveCount(0)
  const before = await stateOf(page)
  await pickFrance(page)
  await expect(page.locator('.selection-summary strong')).toHaveText('France')
  await expect(page.getByRole('button', { name: 'Valider mon choix', exact: true })).toBeEnabled()
  await savePreview(
    page,
    page.viewportSize()!.width < 680 ? 'mobile' : 'joueur',
    page.viewportSize()!.width < 680,
  )
  await page.getByRole('button', { name: 'Valider mon choix', exact: true }).click()
  await expect(page.locator('.feedback')).toBeVisible()
  const after = await stateOf(page)
  expect(after.game!.answered).toBe(1)
  expect(after.feedback?.clickedCountry?.id).toBe('250')
  expect(after.feedback?.country.id).toBeTruthy()
  expect(after).not.toHaveProperty('answer')
  await page.getByRole('button', { name: 'Question suivante', exact: true }).click()
  await expect
    .poll(async () => (await stateOf(page)).question!.turn)
    .toBeGreaterThan(before.question!.turn)
  expect(requests.filter((url) => url.includes('roads-10m'))).toHaveLength(0)
  await page.getByRole('button', { name: 'Zoomer sur le globe', exact: true }).click()
  await expect(page.getByTestId('globe')).toHaveAttribute('data-roads', 'ready')
  await page.getByRole('button', { name: 'Zoomer sur le globe', exact: true }).click()
  expect(requests.filter((url) => url.includes('roads-10m'))).toHaveLength(1)
  expect(requests.some((url) => /rivers|lakes/i.test(url))).toBe(false)
})

test('WebGL absent : secours 2D réellement cliquable et validation conservée', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      options?: unknown,
    ) {
      if (/webgl/.test(type)) return null
      return (
        original as (
          this: HTMLCanvasElement,
          type: string,
          options?: unknown,
        ) => RenderingContext | null
      ).call(this, type, options)
    } as typeof original
  })
  await openPlayer(page)
  await expect(page.getByTestId('globe')).toHaveAttribute('data-renderer', '2d')
  await expect(
    page.getByLabel('Planisphère interactif de secours', { exact: true }),
  ).toHaveAttribute('data-ready', 'true')
  await pickFrance(page, true)
  await expect(page.locator('.selection-summary strong')).toHaveText('France')
  await page.getByRole('button', { name: 'Valider mon choix', exact: true }).click()
  await expect(page.locator('.feedback')).toBeVisible()
})

test('perte de contexte GPU : carte de secours puis nouvelle tentative 3D', async ({ page }) => {
  test.setTimeout(150_000)
  await openPlayer(page)
  await waitGlobe(page)
  const supported = await page.locator('canvas.webgl-canvas').evaluate((node) => {
    const canvas = node as HTMLCanvasElement,
      gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl'),
      extension = gl?.getExtension('WEBGL_lose_context')
    extension?.loseContext()
    return Boolean(extension)
  })
  expect(supported).toBe(true)
  await expect(page.getByTestId('globe')).toHaveAttribute('data-renderer', '2d')
  await expect(
    page.getByLabel('Planisphère interactif de secours', { exact: true }),
  ).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: 'Réessayer la 3D', exact: true }).click()
  await waitGlobe(page)
  await pickFrance(page)
  await expect(page.locator('.selection-summary strong')).toHaveText('France')
})

test('pupitre synchronisé : remplacer sans progression, indice, modes, fin et tentatives', async ({
  page,
  context,
}) => {
  const name = await openPlayer(page),
    admin = await context.newPage()
  await openAdmin(admin)
  await expect(admin.getByRole('region', { name: 'Corrigé privé' })).toBeVisible()
  if (page.viewportSize()!.width > 680) await savePreview(admin, 'presentateur', true)
  const before = await stateOf(page)
  await admin.getByRole('button', { name: 'Remplacer la question', exact: true }).click()
  await expect
    .poll(async () => (await stateOf(page)).question!.turn)
    .toBeGreaterThan(before.question!.turn)
  expect((await stateOf(page)).game!.answered).toBe(0)
  expect((await stateOf(page)).game!.score).toBe(0)
  const replaced = (await stateOf(page)).question!.prompt
  await expect(admin.locator('.question-title-row h1')).toHaveText(replaced)
  await expect(page.locator('.question-title-row h1')).toHaveText(replaced)
  await admin.getByRole('button', { name: 'Partager un indice', exact: true }).click()
  await expect(page.locator('.hints p')).toHaveCount(1)
  const publicState = await stateOf(page)
  expect(publicState).not.toHaveProperty('answer')
  expect(publicState.question).not.toHaveProperty('countryId')
  expect(publicState.feedback).toBeNull()
  await admin.getByRole('radio', { name: /Monde entier/ }).check()
  await admin.getByLabel('Questions par niveau', { exact: true }).selectOption('2')
  await admin.getByText('Personnaliser les 33 pays', { exact: false }).click()
  await admin.getByLabel('Rechercher un pays', { exact: true }).fill('Algérie')
  await admin.getByRole('checkbox', { name: /^Algérie/ }).uncheck()
  await admin.getByLabel('Rechercher un pays', { exact: true }).fill('Chili')
  await admin.getByRole('checkbox', { name: /^Chili/ }).check()
  await admin.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(
    admin.getByText('Enregistré pour la prochaine partie.', { exact: true }),
  ).toBeVisible()
  expect((await stateOf(page)).game!.mode).toBe('club33')
  await chooseCorrect(page, admin)
  await page.getByRole('button', { name: 'Valider mon choix', exact: true }).click()
  await expect(page.locator('.feedback-heading')).toContainText('Bonne réponse')
  await endGame(admin)
  await expect(page.locator('.player-shell')).toHaveAttribute('data-kiosk-view', 'summary')
  await expect(page.getByRole('region', { name: 'Résultat de la tentative' })).toBeVisible()
  await page.getByRole('button', { name: 'Rejouer avec ce nom', exact: true }).click()
  await expect(page.locator('.player-shell')).toHaveAttribute('data-kiosk-view', 'game')
  expect((await stateOf(page)).game!.mode).toBe('world')
  expect((await stateOf(page)).game!.totalQuestions).toBe(8)
  await endGame(admin)
  await expect(page.locator('.player-shell')).toHaveAttribute('data-kiosk-view', 'summary')
  const row = admin.locator('.admin-ranking tbody tr').filter({ hasText: name })
  await expect(row).toHaveCount(1)
  await expect(row.locator('td').nth(4)).toHaveText('2')
  await row.getByRole('button', { name: 'Tentatives', exact: true }).click()
  await expect(admin.locator('.history-panel tbody tr')).toHaveCount(2)
})

test('nom déjà connu : réutiliser le profil ou saisir explicitement un autre nom', async ({
  page,
  context,
}) => {
  const name = await openPlayer(page),
    admin = await context.newPage()
  await openAdmin(admin)
  await endGame(admin)
  await page.getByRole('button', { name: 'Nouveau joueur', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Nom et prénom', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Nom et prénom', exact: true }).fill(name)
  await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Rejouer avec ce nom', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Écrire un autre nom', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Écrire un autre nom', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Nom et prénom', exact: true })).toHaveValue('')
  await page.getByRole('textbox', { name: 'Nom et prénom', exact: true }).fill(name)
  await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click()
  await page.getByRole('button', { name: 'Rejouer avec ce nom', exact: true }).click()
  await expect(page.locator('.player-shell')).toHaveAttribute('data-kiosk-view', 'game')
})

test('veille après 10 secondes hors partie : pays/faits aléatoires, pause et réveil tactile', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.install()
  await page.goto('/jouer')
  await expect(page.getByRole('button', { name: 'Jouer', exact: true })).toBeEnabled()
  await page.clock.fastForward(10_050)
  await expect(page.locator('.player-shell')).toHaveAttribute('data-kiosk-view', 'attract')
  await expect(page.getByRole('complementary', { name: 'Découvrir un pays' })).toBeVisible()
  await expect(page.getByTestId('globe')).toHaveAttribute('data-rotating', 'true')
  const first = await page.locator('.attract-fact h1').innerText()
  await page.clock.fastForward(9_050)
  await expect(page.locator('.attract-fact h1')).not.toHaveText(first)
  await page.getByRole('button', { name: 'Suspendre l’animation', exact: true }).click()
  const paused = await page.locator('.attract-fact h1').innerText()
  await expect(page.getByTestId('globe')).toHaveAttribute('data-rotating', 'false')
  await page.clock.fastForward(9_050)
  await expect(page.locator('.attract-fact h1')).toHaveText(paused)
  if (page.viewportSize()!.width > 680) await savePreview(page, 'veille')
  await page.getByRole('button', { name: 'Toucher l’écran pour jouer', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Jouer', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Jouer', exact: true }).click()
  await page.getByRole('textbox', { name: 'Nom et prénom', exact: true }).fill(uniqueName())
  await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click()
  await expect(page.locator('.player-shell')).toHaveAttribute('data-kiosk-view', 'game')
  await page.clock.fastForward(12_000)
  await expect(page.locator('.player-shell')).toHaveAttribute('data-kiosk-view', 'game')
})

test('plein écran Ctrl+F et message accessible en cas de refus du navigateur', async ({ page }) => {
  await openPlayer(page)
  await page.keyboard.press('Control+f')
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true)
  await page.keyboard.press('Control+f')
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false)
  await page.evaluate(() => {
    document.documentElement.requestFullscreen = async () => {
      throw new Error('Refus simulé')
    }
  })
  await page.getByRole('button', { name: 'Plein écran (Ctrl+F)', exact: true }).click()
  await expect(
    page.getByText('Le navigateur a refusé le plein écran. Utilisez son menu ou le bouton.', {
      exact: true,
    }),
  ).toBeVisible()
})

test('navigation et reprise : état conservé, ancien pupitre révoqué et données privées retirées', async ({
  page,
  context,
}) => {
  await openPlayer(page)
  const admin = await context.newPage()
  await openAdmin(admin)
  await admin.getByRole('button', { name: 'Partager un indice', exact: true }).click()
  const before = await stateOf(page)
  await page.reload()
  await expect(page.locator('.player-shell')).toHaveAttribute('data-kiosk-view', 'game')
  await expect(page.locator('.hints p')).toHaveCount(1)
  expect((await stateOf(page)).question?.turn).toBe(before.question?.turn)
  const token = await admin.evaluate(() => sessionStorage.getItem('algomania-presenter')),
    replacement = await context.newPage()
  await replacement.addInitScript((value) => {
    if (value) sessionStorage.setItem('algomania-presenter', value)
  }, token)
  await openAdmin(replacement)
  await expect(
    admin.getByText('Le pupitre a été repris dans un autre onglet.', { exact: true }),
  ).toBeVisible()
  await expect(admin.locator('.private-answer')).toHaveCount(0)
  await expect(replacement.locator('.private-answer')).toBeVisible()
  const link = replacement.getByRole('link', { name: 'Écran visiteur', exact: true })
  await link.evaluate((node) => node.removeAttribute('target'))
  await link.click()
  await expect(replacement.locator('.player-shell')).toHaveAttribute('data-kiosk-view', 'game')
  await expect(replacement.locator('.private-answer')).toHaveCount(0)
})

test('accessibilité automatique, focus du formulaire et absence de débordement horizontal', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000)
  await page.goto('/jouer')
  await page.getByRole('button', { name: 'Jouer', exact: true }).click()
  // Le scanner logiciel peut dépasser les dix secondes de veille. Garder une
  // interaction pendant le diagnostic et le démarrage, sans modifier la règle du jeu.
  const keepAlive = await page.evaluate(() =>
    window.setInterval(
      () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })),
      1000,
    ),
  )
  let scan
  try {
    scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(scan.violations).toEqual([])
    await expect(page.locator('.connection')).toHaveClass(/online/)
    await page.getByRole('textbox', { name: 'Nom et prénom', exact: true }).fill(uniqueName())
    await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click()
    await expect(page.locator('.player-shell')).toHaveAttribute('data-kiosk-view', 'game')
  } finally {
    await page.evaluate((timer) => window.clearInterval(timer), keepAlive)
  }
  scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(scan.violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const admin = await context.newPage()
  await openAdmin(admin)
  scan = await new AxeBuilder({ page: admin })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(scan.violations).toEqual([])
  expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('une réponse HTTP retardée ne remplace pas la question synchronisée en temps réel', async ({
  page,
}) => {
  let release: () => void = () => {},
    seen: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
      release = resolve
    }),
    captured = new Promise<void>((resolve) => {
      seen = resolve
    })
  let first = true
  await page.route('**/api/current-question', async (route) => {
    if (!first) {
      await route.continue()
      return
    }
    first = false
    const result = await route.fetch()
    seen()
    await gate
    try {
      await route.fulfill({ response: result })
    } catch {
      /* la requête a pu être annulée par React Query */
    }
  })
  try {
    await openPlayer(page)
    await captured
    const before = await stateOf(page)
    release()
    await expect(page.locator('.player-shell')).toHaveAttribute('data-kiosk-view', 'game')
    await expect(page.locator('.question-title-row h1')).toHaveText(before.question!.prompt)
  } finally {
    release()
  }
})
