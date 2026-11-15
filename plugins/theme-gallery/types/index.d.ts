// The one value the gallery keeps in $.state for the session: which accent
// family the list is filtered to. Nothing is written to disk.
export type FamilyFilter = 'all' | 'warm' | 'cool' | 'green' | 'violet' | 'neutral'

declare module 'claude-code' {
  interface PluginState {
    'theme-gallery': { family: FamilyFilter }
  }
}
