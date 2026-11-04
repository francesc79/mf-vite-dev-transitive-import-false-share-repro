// Workaround under test: after the provider's init(), publish every singleton it provides into the global
// Module Federation share cache, so a dev loadShare wrapper finds it whatever hostAutoInit seeded.
export const seedSharedCacheSource = `async (runtime) => {
  if (!runtime || typeof runtime.loadShare !== 'function') return;
  const moduleCache = (globalThis.__mf_module_cache__ ||= { share: {}, remote: {} });
  const cache = (moduleCache.share ||= {});
  moduleCache.remote ||= {};
  const ownersKey = Symbol.for('module-federation.shared-cache-owners');
  if (!Object.prototype.hasOwnProperty.call(cache, ownersKey)) {
    Object.defineProperty(cache, ownersKey, { value: Object.create(null), enumerable: false, configurable: false, writable: false });
  }
  const owners = cache[ownersKey];
  const listeners = cache[Symbol.for('module-federation.shared-cache-listeners')];
  await Promise.all(Object.entries(runtime.shareScopeMap || {}).flatMap(([scopeName, packages]) =>
    Object.entries(packages || {}).map(async ([pkg, versions]) => {
      const provided = Object.values(versions || {}).find((share) =>
        share?.from === runtime.name && share.shareConfig?.singleton === true && share.shareConfig.import !== false);
      if (!provided) return;
      const canonical = scopeName + ':' + pkg;
      const alias = scopeName === 'default' ? pkg : undefined;
      const cached = () => cache[canonical] !== undefined || (alias !== undefined && cache[alias] !== undefined);
      if (cached()) return;
      const factory = await runtime.loadShare(pkg, { customShareInfo: { scope: [scopeName], shareConfig: provided.shareConfig } });
      if (typeof factory !== 'function' || cached()) return;
      const value = { ...(await factory()) };
      Object.defineProperty(value, '__esModule', { value: true, enumerable: false });
      cache[canonical] = value;
      if (alias !== undefined) Object.defineProperty(cache, alias, { value, enumerable: true, configurable: true, writable: true });
      owners[canonical] = runtime.name;
      for (const listener of listeners?.[canonical] || []) listener(value);
    })));
}`;
