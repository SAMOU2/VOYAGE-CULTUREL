import { expect, type Page } from '@playwright/test'
import { PerspectiveCamera, Vector3 } from 'three'
import { randomUUID } from 'node:crypto'
import { spherePoint } from '../../shared/geometry.js'
import { DEFAULT_SETTINGS } from '../../shared/game.js'
import { GLOBE_INITIAL } from '../../frontend/src/lib/globeConfig.js'
import type { CountryFact, PlayerState } from '../../shared/types.js'
import { claim, command, connect } from '../support/network.js'

export const uniqueName = () => `QA ${randomUUID().slice(0, 8)} Démonstration`
export async function resetStand(baseURL: string) {
  const socket = await connect(baseURL)
  try {
    const result = await claim(socket)
    if (!result.ok) throw new Error(result.error)
    const reset = await command(socket, { type: 'reset' })
    if (!reset.ok) throw new Error(reset.error)
    const settings = await command(socket, {
      type: 'settings',
      settings: structuredClone(DEFAULT_SETTINGS),
    })
    if (!settings.ok) throw new Error(settings.error)
  } finally {
    socket.disconnect()
  }
}
export async function stateOf(page: Page): Promise<PlayerState> {
  return (await page.request.get('/api/current-question')).json()
}
export async function openPlayer(page: Page, fullName = uniqueName()) {
  await page.goto('/jouer')
  const play = page.getByRole('button', { name: 'Jouer', exact: true })
  await expect(play).toBeEnabled()
  await play.click()
  await page.getByLabel('Nom et prénom', { exact: true }).fill(fullName)
  await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click()
  await expect(page.locator('.player-shell')).toHaveAttribute('data-kiosk-view', 'game')
  return fullName
}
export async function openAdmin(page: Page) {
  await page.goto('/presentateur')
  await expect(page.getByRole('region', { name: 'Réglages du stand' })).toBeVisible()
}
export async function waitGlobe(page: Page) {
  await expect(page.getByTestId('globe')).toHaveAttribute('data-renderer', 'webgl', {
    timeout: 45_000,
  })
  await expect(page.getByTestId('globe')).toHaveAttribute('data-lod', '50m', { timeout: 45_000 })
}
export async function chooseCountry(page: Page, id: string) {
  if (!(await page.getByLabel('Sélectionner un pays sur la carte', { exact: true }).isVisible()))
    await page.getByText('Choix au clavier', { exact: true }).click()
  await page.getByLabel('Sélectionner un pays sur la carte', { exact: true }).selectOption(id)
}
export async function chooseCorrect(page: Page, admin: Page) {
  const name = (await admin.locator('.private-answer h2').innerText()).trim()
  const facts = (await (await page.request.get('/api/facts')).json()) as CountryFact[]
  const country = facts.find((c) => c.countryName === name)
  if (!country) throw new Error(`Pays inconnu : ${name}`)
  await chooseCountry(page, country.countryId)
  return country
}
export async function endGame(admin: Page) {
  await admin.getByRole('button', { name: 'Terminer ce passage', exact: true }).click()
  await admin.getByRole('button', { name: 'Oui, terminer', exact: true }).click()
}
export async function pickFrance(page: Page, flat = false) {
  const canvas = page.getByLabel(
    flat
      ? 'Planisphère interactif de secours'
      : 'Globe terrestre 3D interactif : glisser pour tourner, cliquer pour choisir un pays',
    { exact: true },
  )
  await canvas.scrollIntoViewIfNeeded()
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('Canvas absent')
  let x: number, y: number
  if (flat) {
    const scale = Math.min(bounds.width / (2 * Math.PI), bounds.height / Math.PI) * 0.94
    x = bounds.width / 2 + ((2.3522 * Math.PI) / 180) * scale
    y = bounds.height / 2 - ((48.8566 * Math.PI) / 180) * scale
  } else {
    const aspect = bounds.width / bounds.height,
      fov =
        aspect < 1
          ? (2 * Math.atan(Math.tan((GLOBE_INITIAL.fov * Math.PI) / 360) / aspect) * 180) / Math.PI
          : GLOBE_INITIAL.fov
    const camera = new PerspectiveCamera(fov, aspect, 0.05, 30)
    camera.position.set(...spherePoint(GLOBE_INITIAL.coordinates, GLOBE_INITIAL.distance))
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const point = new Vector3(...spherePoint([2.3522, 48.8566])).project(camera)
    x = ((point.x + 1) / 2) * bounds.width
    y = ((1 - point.y) / 2) * bounds.height
  }
  if (await page.evaluate(() => navigator.maxTouchPoints > 0))
    await canvas.tap({ position: { x, y } })
  else await canvas.click({ position: { x, y } })
}

/** Illustrations reproductibles, uniquement dans les JSON temporaires du serveur UI. */
export async function savePreview(page: Page, name: string, fullPage = false) {
  if (process.env.CAPTURE_DOCS !== '1') return
  const timer = await page.evaluate(() =>
    window.setInterval(
      () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })),
      1000,
    ),
  )
  try {
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: `docs/apercus/interface-${name}.png`,
      fullPage,
      animations: 'disabled',
      timeout: 120000,
    })
  } finally {
    await page.evaluate((value) => window.clearInterval(value), timer)
  }
}
export async function seedDemoScores(baseURL: string) {
  if (process.env.UI_BASE_URL)
    throw new Error('CAPTURE_DOCS exige le serveur UI temporaire, sans UI_BASE_URL.')
  const { response, snapshot, watch } = await import('../support/network.js')
  const admin = await connect(baseURL),
    player = await connect(baseURL)
  const requireOk = (r: { ok: boolean }) => {
    if (!r.ok) throw new Error(JSON.stringify(r))
  }
  try {
    requireOk(await claim(admin))
    requireOk(await watch(player))
    requireOk(await command(admin, { type: 'reset' }))
    requireOk(
      await command(admin, { type: 'settings', settings: structuredClone(DEFAULT_SETTINGS) }),
    )
    const facts = (await (await fetch(`${baseURL}/api/facts`)).json()) as CountryFact[]
    for (const [fullName, wrongEvery] of [
      ['Lina Benali (démo)', 0],
      ['Sami Touati (démo)', 4],
      ['Maya Chen (démo)', 3],
    ] as const) {
      requireOk(
        await response((ack) =>
          player.emit('player:begin', { fullName, confirmExisting: true }, ack),
        ),
      )
      for (let i = 0; i < 12; i++) {
        const result = await snapshot(admin)
        if (
          !result.ok ||
          result.state.role !== 'presenter' ||
          !result.state.answer ||
          !result.state.question ||
          !result.state.game
        )
          throw new Error('Partie de démonstration absente')
        const { state } = result,
          correct = !wrongEvery || i % wrongEvery !== 0
        const country = facts.find((c) =>
          correct
            ? c.countryId === state.answer!.country.id
            : c.countryId !== state.answer!.country.id &&
              state.game!.scopeCountryIds?.includes(c.countryId),
        )!
        const turn = { attemptId: state.game!.id, turn: state.question!.turn }
        requireOk(
          await response((ack) => player.emit('player:submit', { ...turn, pin: country.pin }, ack)),
        )
        // La dernière validation termine la tentative : aucun « suivant » après elle.
        if (i < 11) requireOk(await response((ack) => player.emit('player:next', turn, ack)))
      }
      requireOk(await command(admin, { type: 'reset' }))
    }
  } finally {
    admin.disconnect()
    player.disconnect()
  }
}
