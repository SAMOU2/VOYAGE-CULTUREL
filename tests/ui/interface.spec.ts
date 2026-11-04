import { test, expect, type Page } from '@playwright/test'
import { geoNaturalEarth1 } from 'd3-geo'
import { io } from 'socket.io-client'
import { QUESTIONS, distanceKm } from '../../server/questions.mjs'
import { countryAt } from '../../server/geo.mjs'

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

const cleanupSessions: Array<{ code: string; hostToken: string; baseURL: string }> = []

test.afterEach(async () => {
  for (const session of cleanupSessions.splice(0)) {
    const socket = io(session.baseURL, { forceNew: true, transports: ['websocket'], reconnection: false })
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve)
        socket.once('connect_error', reject)
      })
      const result = await socket
        .timeout(5000)
        .emitWithAck('host:rejoin', { code: session.code, token: session.hostToken })
      if (result.ok) await socket.timeout(5000).emitWithAck('host:close', {})
    } finally {
      socket.close()
    }
  }
})

async function createRoom(page: Page, difficulty = '1') {
  await page.goto('/presentateur')
  await expect(page.getByRole('button', { name: 'Créer la salle', exact: true })).toBeEnabled()
  await page.getByLabel('Thème', { exact: true }).selectOption('capitales')
  await page.getByLabel('Difficulté', { exact: true }).selectOption(difficulty)
  await page.getByLabel('Questions', { exact: true }).selectOption('5')
  await page.getByRole('button', { name: 'Créer la salle', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Salle prête' })).toBeVisible()
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('voyage-culturel:host')!))
  cleanupSessions.push({ ...session, baseURL: new URL(page.url()).origin })
  await expect(page.locator('.room-code')).toHaveCount(0)
  await expect(page.getByRole('img', { name: /QR/ })).toHaveCount(0)
  return { ...session, name: (await page.locator('.session-room').innerText()).trim() }
}

async function pickOnMap(page: Page, coords: [number, number]) {
  await page.getByRole('button', { name: 'Carte', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Carte', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText('Chargement de la carte…', { exact: true })).toBeHidden()
  const bounds = await page.locator('.play-map').boundingBox()
  if (!bounds) throw new Error('Carte absente')
  const projection = geoNaturalEarth1()
    .fitSize([bounds.width - 20, bounds.height - 20], { type: 'Sphere' })
    .translate([bounds.width / 2, bounds.height / 2])
  const point = projection(coords)
  if (!point) throw new Error('Point non projeté')
  await page.locator('.play-map canvas').click({ position: { x: point[0], y: point[1] } })
}

test('accueil : deux actions, une carte, aucun bloc répétitif', async ({ page }) => {
  await page.goto('/')
  const main = page.getByRole('main')
  await expect(main.getByRole('link')).toHaveCount(2)
  await expect(main.getByRole('link', { name: 'Créer une salle' })).toBeVisible()
  await expect(main.getByRole('link', { name: 'Rejoindre une partie' })).toBeVisible()
  await expect(page.getByText('Chargement de la carte…', { exact: true })).toBeHidden()
  await expect(page.locator('.welcome-globe canvas')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Règles|Déroulement/ })).toHaveCount(0)
  await noHorizontalOverflow(page)
})

test('création : trois critères et des options repliées, difficulté conservée', async ({ page }) => {
  await page.goto('/presentateur')
  await expect(page.getByRole('combobox')).toHaveCount(3)
  await expect(page.getByLabel('Seconde chance à demi-points')).toBeHidden()
  await page.getByText('Options', { exact: true }).click()
  await expect(page.getByLabel('Seconde chance à demi-points')).toBeChecked()
  const session = await createRoom(page)
  await expect(page.getByRole('main')).not.toContainText(session.code)
  await expect(page.getByRole('link', { name: 'Ouvrir le joueur' })).toHaveAttribute('href', '/jouer')
  await expect(page.getByRole('button', { name: 'Démarrer', exact: true })).toBeDisabled()
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await page.getByText('Modifier les réglages', { exact: true }).click()
  // La valeur vient désormais de l'état serveur : une valeur « facile » non numérique
  // provoquerait un retour silencieux au mode mixte.
  await expect(page.getByLabel('Difficulté', { exact: true })).toHaveValue('1')
  await expect(page.getByLabel('Questions', { exact: true })).toHaveValue('5')
  await expect(page.getByLabel('Difficulté', { exact: true }).locator('option')).toHaveText([
    'Progressive',
    'Facile',
    'Moyen',
    'Difficile',
    'Expert',
  ])
  await page.getByLabel('Difficulté', { exact: true }).selectOption('4')
  await expect(page.getByLabel('Difficulté', { exact: true })).toBeEnabled()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Salle prête' })).toBeVisible()
  await page.getByText('Modifier les réglages', { exact: true }).click()
  await expect(page.getByLabel('Difficulté', { exact: true })).toHaveValue('4')
  await noHorizontalOverflow(page)
})

test('mode progressif : facile → moyen → difficile → expert sur les deux écrans', async ({ page }) => {
  test.setTimeout(120_000)
  await createRoom(page, 'mixte')
  const player = await page.context().newPage()
  try {
    await player.goto('/jouer')
    await expect(player.getByRole('heading', { name: 'En attente du présentateur' })).toBeVisible()
    await page.getByRole('button', { name: 'Démarrer', exact: true }).click()
    for (const [index, level] of ['Facile', 'Facile', 'Moyen', 'Difficile', 'Expert'].entries()) {
      await expect(player.locator('.round-counter')).toHaveText(`Question ${index + 1} / 5`)
      await expect(player.getByLabel('Difficulté de la question', { exact: true })).toHaveText(level)
      await expect(page.getByLabel('Difficulté de la question', { exact: true })).toHaveText(level)
      await expect(player.getByRole('textbox')).toHaveCount(0)
      await noHorizontalOverflow(player)
      await noHorizontalOverflow(page)
      await page.getByRole('button', { name: 'Passer', exact: true }).click()
      await expect(player.locator('.feedback.mid')).toBeVisible()
      await page
        .getByRole('button', { name: index === 4 ? 'Voir le bilan' : 'Question suivante', exact: true })
        .click()
    }
    await expect(player.getByText('Partie terminée', { exact: true })).toBeVisible()
  } finally {
    await player.close()
  }
})

test('attente puis connexion automatique : aucun compte, code ou pseudo obligatoire', async ({ page }) => {
  await page.goto('/jouer')
  await expect(page.getByText('En attente d’une partie…', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Code de la salle', { exact: true })).toHaveCount(0)
  await expect(page.locator('input[type="password"], input[type="email"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Rejoindre', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Pseudo', { exact: true })).toBeHidden()
  const host = await page.context().newPage()
  const session = await createRoom(host)
  await expect(page.getByRole('heading', { name: 'En attente du présentateur' })).toBeVisible()
  await expect(host.getByRole('button', { name: 'Démarrer', exact: true })).toBeEnabled()
  await expect(page.getByRole('main')).not.toContainText(session.code)
  await page.getByText('Pseudo (facultatif)', { exact: true }).click()
  await page.getByLabel('Pseudo', { exact: true }).fill('Amina')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(host.getByText('Amina est connecté', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Quitter', exact: true }).click()
  await expect(page).toHaveURL(new URL('/', page.url()).href)
  await expect(host.getByRole('button', { name: 'Démarrer', exact: true })).toBeDisabled()
  await page.goto('/jouer')
  await expect(page.getByRole('heading', { name: 'En attente du présentateur' })).toBeVisible()
  await expect(host.getByText('Amina est connecté', { exact: true })).toBeVisible()
  await host.getByRole('button', { name: 'Fermer', exact: true }).click()
  await expect(page.getByText('En attente d’une partie…', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rejoindre une partie' })).toBeVisible()
  await noHorizontalOverflow(page)
  await noHorizontalOverflow(host)
})

test('plusieurs parties : choix en un clic, puis bascule automatique si la salle ferme', async ({
  page,
  browser,
}, testInfo) => {
  const first = await createRoom(page)
  const otherContext = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL),
    viewport: page.viewportSize() ?? undefined,
    isMobile: testInfo.project.name === 'mobile',
    hasTouch: testInfo.project.name === 'mobile',
  })
  const otherHost = await otherContext.newPage()
  const second = await createRoom(otherHost)
  const player = await page.context().newPage()
  try {
    await player.goto('/jouer')
    await expect(player.getByRole('list', { name: 'Parties disponibles' }).getByRole('listitem')).toHaveCount(
      2,
    )
    await expect(page.getByRole('button', { name: 'Démarrer', exact: true })).toBeDisabled()
    await noHorizontalOverflow(player)
    await player.getByRole('button', { name: `Rejoindre ${second.name}`, exact: true }).click()
    await expect(player.locator('.session-room')).toHaveText(second.name)
    await expect(otherHost.getByRole('button', { name: 'Démarrer', exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Démarrer', exact: true })).toBeDisabled()
    await otherHost.getByRole('button', { name: 'Fermer', exact: true }).click()
    await expect(player.locator('.session-room')).toHaveText(first.name)
    await expect(page.getByRole('button', { name: 'Démarrer', exact: true })).toBeEnabled()
    await noHorizontalOverflow(player)
  } finally {
    await player.close()
    await otherContext.close()
  }
})

test('partie complète : clic, seconde chance, indice, correction, bilan et reprise', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const session = await createRoom(page)
  const playerContext = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL),
    viewport: page.viewportSize() ?? undefined,
    isMobile: testInfo.project.name === 'mobile',
    hasTouch: testInfo.project.name === 'mobile',
  })
  const player = await playerContext.newPage()
  player.on('pageerror', (error) => errors.push(error.message))
  try {
    await player.goto('/jouer')
    await expect(player.getByRole('heading', { name: 'En attente du présentateur' })).toBeVisible()
    await page.getByRole('button', { name: 'Démarrer', exact: true }).click()
    await expect(player.locator('.round-counter')).toHaveText('Question 1 / 5')
    await expect(player.getByRole('textbox')).toHaveCount(0)
    await expect(player.locator('aside')).toHaveCount(0)
    await expect(player.locator('body')).not.toContainText(session.code)
    await expect(player.getByRole('button', { name: 'Valider', exact: true })).toBeDisabled()

    const questionText = await page.getByRole('heading', { level: 1 }).innerText()
    const question = QUESTIONS.find((item: { question: string }) => item.question === questionText)
    if (!question) throw new Error(`Question inconnue : ${questionText}`)
    await expect(player.getByText(question.answer, { exact: true })).toHaveCount(0)

    const wrong = (
      [
        [3.06, 36.75],
        [139.69, 35.69],
        [2.35, 48.85],
      ] as [number, number][]
    ).find(
      (coords) =>
        countryAt(...coords)?.id !== question.isoN && (distanceKm(coords, question.coords) ?? 0) > 400,
    )!
    await pickOnMap(player, wrong)
    await expect(player.locator('.selected-country')).toHaveText(countryAt(...wrong)!.name)
    await player.getByRole('button', { name: 'Valider', exact: true }).click()
    await expect(player.getByText(/Cette seconde chance vaut la moitié des points/)).toBeVisible()
    await expect(player.locator('.feedback')).toHaveCount(0)
    await expect(player.getByText(question.answer, { exact: true })).toHaveCount(0)
    await expect(player.getByRole('button', { name: 'Valider', exact: true })).toBeDisabled()

    await page.getByRole('button', { name: 'Donner un indice', exact: true }).click()
    await expect(player.getByRole('list', { name: 'Indices reçus' }).getByRole('listitem')).toHaveCount(1)
    await pickOnMap(player, question.coords)
    await expect(player.locator('.selected-country')).toBeVisible()
    await noHorizontalOverflow(player)
    if (process.env.UI_SCREENSHOTS === '1')
      await player.screenshot({ path: testInfo.outputPath('joueur-epure.png'), fullPage: true })
    await player.getByRole('button', { name: 'Valider', exact: true }).click()
    await expect(player.getByRole('region', { name: 'Résultat' })).toBeVisible()
    await expect(player.locator('.feedback-answer')).toContainText(question.answer)
    await expect(player.locator('.question-details .disclosure-content')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Question suivante', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retirer les points', exact: true })).toBeHidden()
    await page.getByText('Autres actions', { exact: true }).click()
    await page.getByRole('button', { name: 'Retirer les points', exact: true }).click()
    await expect(player.locator('.feedback.ko')).toBeVisible()
    await page.getByRole('button', { name: 'Accorder les points', exact: true }).click()
    await expect(player.locator('.feedback.ok')).toBeVisible()
    await page.getByText('Autres actions', { exact: true }).click()
    await noHorizontalOverflow(page)
    if (process.env.UI_SCREENSHOTS === '1')
      await page.screenshot({ path: testInfo.outputPath('presentateur-epure.png'), fullPage: true })

    for (let index = 2; index <= 5; index += 1) {
      await page.getByRole('button', { name: 'Question suivante', exact: true }).click()
      await expect(player.locator('.round-counter')).toHaveText(`Question ${index} / 5`)
      await expect(player.getByRole('button', { name: 'Valider', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: 'Passer', exact: true }).click()
      await expect(player.locator('.feedback.mid')).toBeVisible()
    }
    await page.getByRole('button', { name: 'Voir le bilan', exact: true }).click()
    await expect(player.getByText('Partie terminée', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rejouer', exact: true })).toBeVisible()
    await expect(player.locator('.result-score')).toContainText('5')
    await page.getByRole('button', { name: 'Rejouer', exact: true }).click()
    await expect(player.locator('.round-counter')).toHaveText('Question 1 / 5')
    await expect(player.getByRole('textbox')).toHaveCount(0)

    // Les sessions locales permettent de recharger sans recréer ni rejoindre la salle.
    await player.reload()
    await expect(player.locator('.round-counter')).toHaveText('Question 1 / 5')
    await page.reload()
    await expect(page.locator('.round-counter')).toHaveText('Question 1 / 5')
    await noHorizontalOverflow(player)
    expect(errors).toEqual([])
  } finally {
    await playerContext.close()
  }
})
