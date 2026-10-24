// Dark Themes Gallery: /themes opens a pane that lists the 62 free themes of
// 50 Dark Themes and Dark Themes Vol. 2 with swatches in their own colors,
// grouped by pack and filterable by accent family, and marks the theme the
// settings select.
//
// What it does, and all it does: it registers /themes, opens and draws one
// pane, keeps the family filter in $.state for the session, and reads two
// settings keys (`theme` and `enabledPlugins`). It writes no file, runs no
// process, makes no network or model call, and hooks no tool call, prompt or
// any of Claude Code's own drawing.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { FamilyFilter } from '../types'
import { THEMES } from './themes.ts'
import type { GalleryTheme, Pack } from './themes.ts'

const PANE = 'theme-gallery'
const MARKETPLACE_ADD = '/plugin marketplace add notgabriels-sys/claude-code-50-dark-themes'

const PACKS: readonly { id: Pack; title: string; install: string }[] = [
  {
    id: '50-dark-themes',
    title: '50 Dark Themes',
    install: '/plugin install 50-dark-themes@notgabriels-themes',
  },
  {
    id: 'dark-themes-vol-2',
    title: 'Dark Themes Vol. 2',
    install: '/plugin install dark-themes-vol-2@notgabriels-themes',
  },
]

// The website's finder offers the same families in the same order.
const FILTERS: readonly { id: FamilyFilter; label: string; hotkey: string }[] = [
  { id: 'all', label: 'All', hotkey: '0' },
  { id: 'warm', label: 'Warm', hotkey: '1' },
  { id: 'cool', label: 'Cool', hotkey: '2' },
  { id: 'green', label: 'Green', hotkey: '3' },
  { id: 'violet', label: 'Violet', hotkey: '4' },
  { id: 'neutral', label: 'Neutral', hotkey: '5' },
]

// Wide enough for the longest name in either pack.
const NAME_WIDTH = Math.max(...THEMES.map(theme => theme.name.length)) + 2

const familyFilter = atom({ plugin: 'theme-gallery', key: 'family' } as const, 'all')

type Selection =
  | { kind: 'unset' }
  | { kind: 'pack'; theme: GalleryTheme }
  | { kind: 'copy'; theme: GalleryTheme }
  | { kind: 'other'; value: string }

// Claude Code names a plugin's theme `custom:<plugin>:<file name>` and a theme
// file in ~/.claude/themes `custom:<file name>`, which is where the repository's
// manual install and install.sh copy the files. The second form is matched by
// file name alone: any absinthe.json there reads as Absinthe, whatever colors it
// holds, so the pane says only that a file of that name is selected. Editing a
// plugin theme with Ctrl+E in /theme also saves a copy in ~/.claude/themes; this
// mod does not assume that copy's file name, and one under another name reads
// as "not one of the themes below".
function selectionOf(setting: unknown): Selection {
  if (typeof setting !== 'string' || setting === '') return { kind: 'unset' }
  const parts = setting.split(':')
  if (parts[0] === 'custom' && parts.length === 3) {
    const theme = THEMES.find(one => one.pack === parts[1] && one.slug === parts[2])
    if (theme) return { kind: 'pack', theme }
  }
  if (parts[0] === 'custom' && parts.length === 2) {
    const theme = THEMES.find(one => one.slug === parts[1])
    if (theme) return { kind: 'copy', theme }
  }
  return { kind: 'other', value: setting }
}

// A pack counts as installed when the settings enable it under any
// marketplace (`/plugin install` writes `"<plugin>@<marketplace>": true`), or
// when the selected theme comes from it, which proves it is loaded.
function installedPacks(enabledPlugins: unknown, selection: Selection): Set<Pack> {
  const found = new Set<Pack>()
  if (enabledPlugins !== null && typeof enabledPlugins === 'object') {
    for (const [id, isOn] of Object.entries(enabledPlugins)) {
      const pack = PACKS.find(one => id.split('@')[0] === one.id)
      if (pack && isOn === true) found.add(pack.id)
    }
  }
  if (selection.kind === 'pack') found.add(selection.theme.pack)
  return found
}

function currentLine(selection: Selection): string {
  switch (selection.kind) {
    case 'unset':
      return 'Current theme: none set in your settings files (Claude Code defaults to dark)'
    case 'pack':
      return `Current theme: ${selection.theme.name}, from ${packTitle(selection.theme.pack)}`
    case 'copy':
      return `Current theme: ${selection.theme.name} (a theme file named ${selection.theme.slug}.json in ~/.claude/themes)`
    case 'other':
      return `Current theme: ${selection.value}, not one of the themes below`
  }
}

function packTitle(id: Pack): string {
  return PACKS.find(pack => pack.id === id)?.title ?? id
}

function isSelected(theme: GalleryTheme, selection: Selection): boolean {
  return (selection.kind === 'pack' || selection.kind === 'copy') && selection.theme === theme
}

function filterOf(stored: unknown): FamilyFilter {
  return FILTERS.find(filter => filter.id === stored)?.id ?? 'all'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'themes',
        description: 'Browse the 62 free dark themes with color swatches',
        immediate: true,
      })
    } catch {
      // The name is taken in this session, for example by another plugin's
      // /themes: the gallery stays unreachable rather than taking that
      // command's place. The README's troubleshooting section says so.
    }

    return next(e)
  })

  on('command.run', { command: 'themes' }, async $ => {
    const opened = await $.ui.open({
      id: PANE,
      title: 'Theme gallery',
      focus: true,
      closeOnEscape: true,
    })
    // An open pane keeps its drawing: draw again so it reads the settings
    // as they are now.
    $.ui.invalidate('ui.render')
    if (!opened.isPlaced) {
      return { text: `The theme gallery opens as a pane, and no pane can be shown here (${opened.reason}).` }
    }

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const family = filterOf(await read($, familyFilter))
    const selection = selectionOf(await $.settings.read({ key: 'theme' }))
    const installed = installedPacks(await $.settings.read({ key: 'enabledPlugins' }), selection)
    const missing = PACKS.filter(pack => !installed.has(pack.id))
    const shown = THEMES.filter(theme => family === 'all' || theme.family === family)
    const filterLabel = FILTERS.find(filter => filter.id === family)?.label ?? 'All'
    // A selected theme file in ~/.claude/themes shows that this user runs theme
    // files copied there, so a pack the settings do not enable may still be in
    // /theme: the hints and the Switching section say both.
    const runsCopies = selection.kind === 'copy'

    // Short enough to fit beside the name in a pane docked next to the chat;
    // the Switching section below spells out the install commands.
    const row = (theme: GalleryTheme) => {
      const isCurrent = isSelected(theme, selection)
      const hint = isCurrent
        ? 'current theme'
        : installed.has(theme.pack)
          ? 'pick it in /theme'
          : runsCopies
            ? `in /theme if copied, else install ${packTitle(theme.pack)}`
            : `install ${packTitle(theme.pack)} first`

      return (
        <Box key={`theme-${theme.slug}`} flexDirection="row">
          <Text color="claude">{isCurrent ? '● ' : '  '}</Text>
          <Text backgroundColor={theme.accent}>{'  '}</Text>
          <Text backgroundColor={theme.text}>{'  '}</Text>
          <Text backgroundColor={theme.panel}>{'  '}</Text>
          <Text backgroundColor={theme.accent2}>{'  '}</Text>
          <Box width={NAME_WIDTH + 1} flexShrink={0} paddingLeft={1}>
            <Text weight={isCurrent ? 'bold' : 'regular'} wrap="truncate-end">
              {theme.name}
            </Text>
          </Box>
          <Text dimColor wrap="truncate-end">
            {hint}
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" width={e.props.bodyColumns}>
        <Text>{currentLine(selection)}</Text>
        <Text dimColor>
          Swatches: accent, text, panel, second accent. Showing {filterLabel}: {shown.length} of{' '}
          {THEMES.length}.
        </Text>
        <Box flexDirection="row" flexWrap="wrap" columnGap={2} marginTop={1}>
          {FILTERS.map(filter => (
            <Button
              key={`filter-${filter.id}`}
              label={`${filter.label} ${THEMES.filter(theme => filter.id === 'all' || theme.family === filter.id).length}`}
              hotkey={filter.hotkey}
              plain
              dimColor={filter.id === family ? undefined : true}
              onPress={() => update($, familyFilter, () => filter.id)}
            />
          ))}
        </Box>
        {PACKS.map(pack => {
          const list = shown.filter(theme => theme.pack === pack.id)
          const total = THEMES.filter(theme => theme.pack === pack.id).length

          return (
            <Box key={`pack-${pack.id}`} flexDirection="column" marginTop={1}>
              <Text weight="bold">
                {pack.title} ({list.length} of {total})
              </Text>
              {list.length === 0 && <Text dimColor>No {filterLabel.toLowerCase()} themes in this pack.</Text>}
              {list.map(row)}
            </Box>
          )
        })}
        <Box flexDirection="column" marginTop={1}>
          <Text weight="bold">Switching</Text>
          <Text>Run /theme and pick a theme by its name.</Text>
          {missing.length === 0 ? (
            <Text dimColor>Both packs are enabled in your settings.</Text>
          ) : (
            <Box flexDirection="column">
              <Text>
                {missing.map(pack => pack.title).join(' and ')} {missing.length === 1 ? 'is' : 'are'} not
                enabled in your settings.{' '}
                {runsCopies
                  ? 'Your current theme is a file in ~/.claude/themes, so theme files you copied there are in /theme already. To install a pack instead, run these at the prompt of a terminal session:'
                  : 'Install from the prompt of a terminal session:'}
              </Text>
              <Text color="suggestion">{`  ${MARKETPLACE_ADD}`}</Text>
              {missing.map(pack => (
                <Text key={`install-${pack.id}`} color="suggestion">{`  ${pack.install}`}</Text>
              ))}
              <Text dimColor>
                {runsCopies
                  ? 'Then restart Claude Code.'
                  : 'Then restart Claude Code. Theme files copied into ~/.claude/themes by hand work too; this check reads only your plugin settings.'}
              </Text>
            </Box>
          )}
        </Box>
        <Box flexDirection="row" flexWrap="wrap" columnGap={2} marginTop={1}>
          <Button key="refresh" label="Refresh" hotkey="r" plain onPress={() => $.ui.invalidate('ui.render')} />
          <Button key="close" label="Close" hotkey="q" plain role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
