import type { OsmSettings, UserProfile } from '../../types/mosque';
import { supabase } from './client';
import { handleDbError, OperationType } from './errors';

export const DEFAULT_OSM_SETTINGS: OsmSettings = {
  osmPublishEnabled: false,
  osmUseProduction: false,
};

const SETTINGS_ID = 'osm';

export function subscribeOsmSettings(onData: (settings: OsmSettings) => void): () => void {
  let active = true;

  const load = async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('osm_publish_enabled, osm_use_production')
      .eq('id', SETTINGS_ID)
      .maybeSingle();
    if (!active) return;
    if (error || !data) {
      onData(DEFAULT_OSM_SETTINGS);
      return;
    }
    onData({
      osmPublishEnabled: Boolean(data.osm_publish_enabled),
      osmUseProduction: Boolean(data.osm_use_production),
    });
  };

  void load();

  const channel = supabase
    .channel(`app-settings-${Math.random().toString(36).slice(2, 10)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => {
      void load();
    })
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export async function saveOsmSettings(settings: OsmSettings, _adminUser: UserProfile): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert({
    id: SETTINGS_ID,
    osm_publish_enabled: Boolean(settings.osmPublishEnabled),
    osm_use_production: Boolean(settings.osmUseProduction),
  });
  if (error) handleDbError(error, OperationType.WRITE, `app_settings/${SETTINGS_ID}`);
}
