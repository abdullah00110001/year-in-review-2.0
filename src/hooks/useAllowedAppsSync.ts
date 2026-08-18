/**
 * useAllowedAppsSync — mirrors the Sleep to Rise allowlist to Supabase.
 *
 * The local config stays the source of truth for enforcement (it is what gets
 * pushed to native preferences), but the list is also persisted per user in
 * `night_to_rise_allowed_apps` so it survives reinstalls and device changes.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AllowedApp } from '@/components/rise/night-to-rise/types';

export function useAllowedAppsSync(
  allowedApps: AllowedApp[],
  onRemoteLoaded?: (apps: AllowedApp[]) => void,
) {
  const hydrated = useRef(false);
  const lastPushed = useRef<string>('');

  // Pull once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) { hydrated.current = true; return; }
      const { data, error } = await supabase
        .from('night_to_rise_allowed_apps')
        .select('package_name, app_label')
        .eq('user_id', uid);
      if (cancelled) return;
      if (!error && data && data.length > 0 && onRemoteLoaded) {
        onRemoteLoaded(
          data.map((r) => ({ id: r.package_name, name: r.app_label || r.package_name })),
        );
      }
      hydrated.current = true;
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push on change.
  useEffect(() => {
    if (!hydrated.current) return;
    const key = allowedApps.map((a) => a.id).sort().join(',');
    if (key === lastPushed.current) return;
    lastPushed.current = key;

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;
      const ids = allowedApps.map((a) => a.id);

      if (ids.length === 0) {
        await supabase.from('night_to_rise_allowed_apps').delete().eq('user_id', uid);
        return;
      }
      // Drop rows that are no longer allowed, then upsert the current list.
      await supabase
        .from('night_to_rise_allowed_apps')
        .delete()
        .eq('user_id', uid)
        .not('package_name', 'in', `(${ids.map((i) => `"${i}"`).join(',')})`);

      await supabase
        .from('night_to_rise_allowed_apps')
        .upsert(
          allowedApps.map((a) => ({ user_id: uid, package_name: a.id, app_label: a.name })),
          { onConflict: 'user_id,package_name' },
        );
    })();
  }, [allowedApps]);
}
