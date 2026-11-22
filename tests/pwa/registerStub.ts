// Stand-in for the plugin's virtual module so unit tests need no PWA plugin (see vite.config.ts).
export function registerSW(): (reload?: boolean) => Promise<void> {
  return () => Promise.resolve();
}
