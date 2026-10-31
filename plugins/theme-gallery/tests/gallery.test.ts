import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// The 62 free themes and nothing else: 50 Dark Themes, then Dark Themes Vol. 2.
// Written out here rather than read from hooks/themes.ts, so a theme that
// reaches the data module from anywhere else fails this test.
const FREE_50 = [
  'absinthe', 'acid', 'amber-room', 'anaglyph', 'blackout', 'blueprint', 'cassette', 'clay',
  'cobalt-hour', 'concrete', 'coral', 'crossfade', 'deep-field', 'dubplate', 'ember', 'fathom',
  'fjord', 'furnace', 'glacier', 'graphite', 'greenhouse', 'harbor', 'hearth', 'ink', 'iris',
  'lagoon', 'lichen', 'moss', 'mulberry', 'nachtschicht', 'night-vision', 'nightshade', 'off-air',
  'orchid', 'oxide', 'petrol', 'plasma', 'signal-red', 'sonar', 'soot', 'static', 'terminal',
  'tidepool', 'tungsten', 'ultraviolet', 'undergrowth', 'undertow', 'velvet', 'verdigris',
  'vu-meter',
]
const FREE_VOL_2 = [
  'afterglow', 'aurora-borealis', 'basalt', 'biolume', 'cryosleep', 'darkroom', 'gaslight',
  'heliotrope', 'magnetite', 'monsoon', 'neon-noir', 'ozone',
]
const FREE = [...FREE_50, ...FREE_VOL_2]

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

const PANE = {
  plugin: 'theme-gallery',
  component: 'Pane',
  requestId: 'theme-gallery',
  viewport: { columns: 140, rows: 40 },
  props: {
    title: 'Theme gallery',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

// /themes typed at the prompt of a fullscreen terminal session.
const RUN = {
  command: 'themes',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 140 },
} as const

type Found = { type: string; key: string | undefined; props: Record<string, unknown>; text: string; children: unknown[] }

function rowKeys(boxes: Found[]): string[] {
  return boxes.map(box => box.key ?? '').filter(key => key.startsWith('theme-'))
}

// The settings the stub answers with; each test sets what it needs.
let settings: Record<string, unknown> = {}

function stubEngine(on: Parameters<TestBody>[1]) {
  on('settings.read', () => ({ value: settings }))
  on('command.register', () => ({ value: { command: 'themes' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
}

test('/themes opens the gallery as a focused pane and prints nothing', async ($, on) => {
  settings = {}
  const opened: unknown[] = []
  const registered: unknown[] = []
  on('settings.read', () => ({ value: settings }))
  on('command.register', (_, e) => {
    registered.push(e)
    return { value: { command: 'themes' } }
  })
  on('ui.open', (_, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('session.start', () => ({ cwd: '/work' }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(registered).toHaveLength(1)
  expect((registered[0] as { name: string }).name).toBe('themes')

  const result = await $.command.run(RUN)
  expect(result.text).toBeUndefined()
  expect(opened).toHaveLength(1)
  expect(opened[0]).toMatchObject({ id: 'theme-gallery', focus: true, closeOnEscape: true })
})

test('/themes says why where no pane can be shown', async ($, on) => {
  settings = {}
  on('settings.read', () => ({ value: settings }))
  on('command.register', () => ({ value: { command: 'themes' } }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no-surface: a -p run' } }))
  on('session.start', () => ({ cwd: '/work' }))

  await $.session.start({ surface: 'terminal', isInteractive: false, cwd: '/work' })
  const result = await $.command.run(RUN)
  expect(result.text).toMatch(/no pane can be shown here/)
})

test('the pane lists the 62 free themes, and only those, on every surface', async ($, on) => {
  settings = {}
  stubEngine(on)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const keys = rowKeys(await ui.findAll({ type: 'Box' }))
    expect(keys).toEqual(FREE.map(slug => `theme-${slug}`))
    expect(await ui.find({ type: 'Text', text: '50 Dark Themes (50 of 50)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Dark Themes Vol. 2 (12 of 12)' })).toBeDefined()
    expect(await ui.findAll({ text: /vol\.? ?3|vol-3|volume 3/i })).toHaveLength(0)
    await ui.unmount()
  }
})

test('each row draws its swatches in the theme file colors', async ($, on) => {
  settings = {}
  stubEngine(on)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const row = (await ui.find({ type: 'Box', key: 'theme-absinthe' })) as Found | undefined
    expect(row).toBeDefined()
    const swatches = (row?.children ?? [])
      .map(child => (child as { props?: { backgroundColor?: unknown } }).props?.backgroundColor)
      .filter(color => color !== undefined)
    // accent (claude), text, panel (userMessageBackground), second accent (permission)
    expect(swatches).toEqual(['#C0D648', '#EBEDE8', '#282A22', '#D1E17A'])
    expect(row?.text).toMatch(/Absinthe/)
    await ui.unmount()
  }
})

test('marks the theme the settings select, from either pack', async ($, on) => {
  stubEngine(on)

  const cases = [
    { theme: 'custom:50-dark-themes:absinthe', key: 'theme-absinthe', line: 'Current theme: Absinthe, from 50 Dark Themes' },
    { theme: 'custom:dark-themes-vol-2:ozone', key: 'theme-ozone', line: 'Current theme: Ozone, from Dark Themes Vol. 2' },
    {
      theme: 'custom:night-vision',
      key: 'theme-night-vision',
      line: 'Current theme: Night Vision (a theme file named night-vision.json in ~/.claude/themes)',
    },
  ]
  for (const one of cases) {
    settings = { theme: one.theme }
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: one.line })).toBeDefined()
      const marked = (await ui.findAll({ type: 'Box' })).filter(
        box => box.key?.startsWith('theme-') && /current theme/.test(box.text),
      )
      expect(marked.map(box => box.key)).toEqual([one.key])
      await ui.unmount()
    }
  }
})

test('marks nothing for a built-in theme, another custom theme or no setting', async ($, on) => {
  stubEngine(on)

  const cases = [
    { theme: 'dark', line: 'Current theme: dark, not one of the themes below' },
    { theme: 'custom:someone-else:absinthe', line: 'Current theme: custom:someone-else:absinthe, not one of the themes below' },
    { theme: undefined, line: 'Current theme: none set in your settings files (Claude Code defaults to dark)' },
  ]
  for (const one of cases) {
    settings = one.theme === undefined ? {} : { theme: one.theme }
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: one.line })).toBeDefined()
    expect(await ui.findAll({ type: 'Text', text: 'current theme' })).toHaveLength(0)
    await ui.unmount()
  }
})

test('shows the install commands for the packs the settings do not enable', async ($, on) => {
  stubEngine(on)
  const add = '/plugin marketplace add notgabriels-sys/claude-code-50-dark-themes'
  const install50 = '/plugin install 50-dark-themes@notgabriels-themes'
  const installVol2 = '/plugin install dark-themes-vol-2@notgabriels-themes'

  settings = {}
  const none = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await none.find({ type: 'Text', text: add })).toBeDefined()
  expect(await none.find({ type: 'Text', text: install50 })).toBeDefined()
  expect(await none.find({ type: 'Text', text: installVol2 })).toBeDefined()
  expect(await none.find({ type: 'Text', text: 'install Dark Themes Vol. 2 first' })).toBeDefined()
  expect(await none.findAll({ type: 'Text', text: 'install 50 Dark Themes first' })).toHaveLength(50)
  await none.unmount()

  settings = { enabledPlugins: { '50-dark-themes@notgabriels-themes': true, 'dark-themes-vol-2@notgabriels-themes': false } }
  const one = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await one.find({ type: 'Text', text: add })).toBeDefined()
  expect(await one.find({ type: 'Text', text: install50 })).toBeUndefined()
  expect(await one.find({ type: 'Text', text: installVol2 })).toBeDefined()
  await one.unmount()

  settings = {
    enabledPlugins: { '50-dark-themes@notgabriels-themes': true, 'dark-themes-vol-2@notgabriels-themes': true },
  }
  const both = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await both.find({ type: 'Text', text: 'Both packs are enabled in your settings.' })).toBeDefined()
  expect(await both.find({ type: 'Text', text: add })).toBeUndefined()
  expect(await both.findAll({ type: 'Text', text: 'pick it in /theme' })).toHaveLength(62)
  await both.unmount()

  // A theme selected from a pack proves the pack is loaded, settings or not.
  settings = { theme: 'custom:dark-themes-vol-2:basalt' }
  const selected = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await selected.find({ type: 'Text', text: install50 })).toBeDefined()
  expect(await selected.find({ type: 'Text', text: installVol2 })).toBeUndefined()
  await selected.unmount()
})

// The repository's manual install and install.sh copy the files into
// ~/.claude/themes, which leaves no enabledPlugins entry behind.
test('a theme file selected from ~/.claude/themes softens the install hints', async ($, on) => {
  stubEngine(on)
  settings = { theme: 'custom:absinthe' }

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(
      await ui.find({ type: 'Text', text: 'Current theme: Absinthe (a theme file named absinthe.json in ~/.claude/themes)' }),
    ).toBeDefined()
    expect(await ui.findAll({ type: 'Text', text: /first$/ })).toHaveLength(0)
    expect(await ui.findAll({ type: 'Text', text: 'in /theme if copied, else install 50 Dark Themes' })).toHaveLength(49)
    expect(await ui.findAll({ type: 'Text', text: 'in /theme if copied, else install Dark Themes Vol. 2' })).toHaveLength(12)
    expect(await ui.find({ type: 'Text', text: /theme files you copied there are in \/theme already/ })).toBeDefined()
    // The commands stay, for a user who would rather install the packs.
    expect(await ui.find({ type: 'Text', text: '/plugin install 50-dark-themes@notgabriels-themes' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '/plugin install dark-themes-vol-2@notgabriels-themes' })).toBeDefined()
    await ui.unmount()
  }

  // A pack the settings enable still says to pick the theme in /theme.
  settings = { theme: 'custom:absinthe', enabledPlugins: { 'dark-themes-vol-2@notgabriels-themes': true } }
  const mixed = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await mixed.findAll({ type: 'Text', text: 'pick it in /theme' })).toHaveLength(12)
  expect(await mixed.findAll({ type: 'Text', text: 'in /theme if copied, else install 50 Dark Themes' })).toHaveLength(49)
  await mixed.unmount()
})

test('filters by accent family and back', async ($, on) => {
  settings = {}
  stubEngine(on)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'filter-violet' })
    const violet = rowKeys(await ui.findAll({ type: 'Box' }))
    expect(violet.length).toBeGreaterThan(0)
    expect(violet.length).toBeLessThan(62)
    expect(await ui.find({ type: 'Text', text: `Showing Violet: ${violet.length} of 62.` })).toBeDefined()
    for (const key of violet) expect(FREE).toContain(key.slice('theme-'.length))

    await ui.press({ key: 'filter-neutral' })
    expect(rowKeys(await ui.findAll({ type: 'Box' })).length).toBeLessThan(62)

    await ui.press({ key: 'filter-all' })
    expect(rowKeys(await ui.findAll({ type: 'Box' }))).toHaveLength(62)
    await ui.unmount()
  }
})

test('every family filter adds up to the 62', async ($, on) => {
  settings = {}
  stubEngine(on)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  let total = 0
  for (const family of ['warm', 'cool', 'green', 'violet', 'neutral']) {
    await ui.press({ key: `filter-${family}` })
    total += rowKeys(await ui.findAll({ type: 'Box' })).length
  }
  expect(total).toBe(62)
  await ui.unmount()
})

test('Refresh reads the settings again', async ($, on) => {
  settings = { theme: 'dark' }
  stubEngine(on)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Current theme: dark, not one of the themes below' })).toBeDefined()
  settings = { theme: 'custom:50-dark-themes:moss' }
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Text', text: 'Current theme: Moss, from 50 Dark Themes' })).toBeDefined()
  await ui.unmount()
})

test('Close closes the pane', async ($, on) => {
  settings = {}
  const closed: unknown[] = []
  on('settings.read', () => ({ value: settings }))
  on('ui.close', (_, e) => {
    closed.push(e)
    return { value: undefined }
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'close' })
  expect(closed).toHaveLength(1)
  expect(closed[0]).toMatchObject({ id: 'theme-gallery' })
  await ui.unmount()
})

test('a narrow dock still draws every row', async ($, on) => {
  settings = {}
  stubEngine(on)

  const ui = await $.ui.mount({
    ...PANE,
    surface: 'terminal',
    viewport: { columns: 60, rows: 30 },
    props: { ...PANE.props, bodyColumns: 28 },
  })
  expect(rowKeys(await ui.findAll({ type: 'Box' }))).toHaveLength(62)
  await ui.unmount()
})

test('a pane the mod does not own goes to the engine', async ($, on) => {
  settings = {}
  stubEngine(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: ['engine'] })
  })

  const ui = await $.ui.mount({ ...PANE, requestId: 'other', surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
