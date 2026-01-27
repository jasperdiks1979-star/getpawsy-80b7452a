import { useState, useEffect, useCallback } from 'react';

export type WidgetSize = 'small' | 'medium' | 'large' | 'full';

export interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'list';
  title: string;
  description?: string;
  size: WidgetSize;
  visible: boolean;
  order: number;
}

export interface LayoutPreset {
  id: string;
  name: string;
  description: string;
  icon: 'compact' | 'detailed' | 'analytics' | 'ecommerce' | 'overview' | 'custom';
  config: { [widgetId: string]: { visible: boolean; size: WidgetSize } };
  isCustom?: boolean;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'realtime-kpi', type: 'chart', title: 'Real-Time KPI\'s', description: 'Snelle insights met sparklines', size: 'full', visible: true, order: 0 },
  { id: 'active-users', type: 'metric', title: 'Actieve Gebruikers', size: 'small', visible: true, order: 1 },
  { id: 'pageviews', type: 'metric', title: 'Paginaweergaven', size: 'small', visible: true, order: 2 },
  { id: 'session-duration', type: 'metric', title: 'Gem. Sessieduur', size: 'small', visible: true, order: 3 },
  { id: 'bounce-rate', type: 'metric', title: 'Bounce Rate', size: 'small', visible: true, order: 4 },
  { id: 'traffic-chart', type: 'chart', title: 'Verkeer Overzicht', description: 'Gebruikers en paginaweergaven', size: 'full', visible: true, order: 5 },
  { id: 'top-pages', type: 'table', title: 'Top Pagina\'s', description: 'Meest bezochte pagina\'s', size: 'full', visible: true, order: 6 },
  { id: 'devices', type: 'chart', title: 'Apparaten', description: 'Verdeling per apparaattype', size: 'medium', visible: true, order: 7 },
  { id: 'countries', type: 'list', title: 'Landen', description: 'Top landen op basis van gebruikers', size: 'medium', visible: true, order: 8 },
  { id: 'new-returning', type: 'chart', title: 'Nieuwe vs Terugkerend', description: 'Gebruikerstype verdeling', size: 'full', visible: true, order: 9 },
  { id: 'traffic-sources', type: 'chart', title: 'Verkeersbronnen', description: 'Waar bezoekers vandaan komen', size: 'full', visible: true, order: 10 },
  { id: 'browsers', type: 'chart', title: 'Browsers', description: 'Meest gebruikte browsers', size: 'medium', visible: true, order: 11 },
  { id: 'cities', type: 'list', title: 'Steden', description: 'Top steden van bezoekers', size: 'medium', visible: true, order: 12 },
  { id: 'realtime-counter', type: 'metric', title: 'Live Gebruikers', description: 'Nu actief op de site', size: 'small', visible: true, order: 13 },
  { id: 'ecommerce-revenue', type: 'metric', title: 'Omzet', description: 'Totale omzet', size: 'small', visible: true, order: 14 },
  { id: 'ecommerce-transactions', type: 'metric', title: 'Transacties', description: 'Aantal bestellingen', size: 'small', visible: true, order: 15 },
  { id: 'conversion-funnel', type: 'chart', title: 'Conversie Funnel', description: 'Van sessie naar aankoop', size: 'full', visible: true, order: 16 },
];

export const BUILT_IN_PRESETS: LayoutPreset[] = [
  {
    id: 'compact',
    name: 'Compact',
    description: 'Alleen essentiële metrics, minimale ruimte',
    icon: 'compact',
    config: {
      'realtime-kpi': { visible: true, size: 'full' },
      'active-users': { visible: false, size: 'small' },
      'pageviews': { visible: false, size: 'small' },
      'session-duration': { visible: false, size: 'small' },
      'bounce-rate': { visible: false, size: 'small' },
      'traffic-chart': { visible: false, size: 'full' },
      'top-pages': { visible: false, size: 'full' },
      'devices': { visible: false, size: 'medium' },
      'countries': { visible: false, size: 'medium' },
      'new-returning': { visible: false, size: 'full' },
      'traffic-sources': { visible: false, size: 'full' },
      'browsers': { visible: false, size: 'medium' },
      'cities': { visible: false, size: 'medium' },
      'realtime-counter': { visible: true, size: 'small' },
      'ecommerce-revenue': { visible: true, size: 'small' },
      'ecommerce-transactions': { visible: true, size: 'small' },
      'conversion-funnel': { visible: false, size: 'full' },
    },
  },
  {
    id: 'detailed',
    name: 'Gedetailleerd',
    description: 'Alle widgets zichtbaar, maximale inzichten',
    icon: 'detailed',
    config: {
      'realtime-kpi': { visible: true, size: 'full' },
      'active-users': { visible: true, size: 'small' },
      'pageviews': { visible: true, size: 'small' },
      'session-duration': { visible: true, size: 'small' },
      'bounce-rate': { visible: true, size: 'small' },
      'traffic-chart': { visible: true, size: 'full' },
      'top-pages': { visible: true, size: 'full' },
      'devices': { visible: true, size: 'medium' },
      'countries': { visible: true, size: 'medium' },
      'new-returning': { visible: true, size: 'full' },
      'traffic-sources': { visible: true, size: 'full' },
      'browsers': { visible: true, size: 'medium' },
      'cities': { visible: true, size: 'medium' },
      'realtime-counter': { visible: true, size: 'small' },
      'ecommerce-revenue': { visible: true, size: 'small' },
      'ecommerce-transactions': { visible: true, size: 'small' },
      'conversion-funnel': { visible: true, size: 'full' },
    },
  },
  {
    id: 'analytics-focus',
    name: 'Analytics Focus',
    description: 'Focus op verkeer en gebruikersgedrag',
    icon: 'analytics',
    config: {
      'realtime-kpi': { visible: true, size: 'full' },
      'active-users': { visible: true, size: 'medium' },
      'pageviews': { visible: true, size: 'medium' },
      'session-duration': { visible: true, size: 'small' },
      'bounce-rate': { visible: true, size: 'small' },
      'traffic-chart': { visible: true, size: 'full' },
      'top-pages': { visible: true, size: 'full' },
      'devices': { visible: true, size: 'large' },
      'countries': { visible: true, size: 'large' },
      'new-returning': { visible: true, size: 'full' },
      'traffic-sources': { visible: true, size: 'full' },
      'browsers': { visible: true, size: 'medium' },
      'cities': { visible: true, size: 'medium' },
      'realtime-counter': { visible: false, size: 'small' },
      'ecommerce-revenue': { visible: false, size: 'small' },
      'ecommerce-transactions': { visible: false, size: 'small' },
      'conversion-funnel': { visible: false, size: 'full' },
    },
  },
  {
    id: 'ecommerce',
    name: 'E-commerce',
    description: 'Focus op verkoop en conversie',
    icon: 'ecommerce',
    config: {
      'realtime-kpi': { visible: true, size: 'full' },
      'active-users': { visible: true, size: 'small' },
      'pageviews': { visible: false, size: 'small' },
      'session-duration': { visible: false, size: 'small' },
      'bounce-rate': { visible: false, size: 'small' },
      'traffic-chart': { visible: false, size: 'full' },
      'top-pages': { visible: true, size: 'full' },
      'devices': { visible: false, size: 'medium' },
      'countries': { visible: true, size: 'large' },
      'new-returning': { visible: false, size: 'full' },
      'traffic-sources': { visible: true, size: 'full' },
      'browsers': { visible: false, size: 'medium' },
      'cities': { visible: false, size: 'medium' },
      'realtime-counter': { visible: true, size: 'medium' },
      'ecommerce-revenue': { visible: true, size: 'large' },
      'ecommerce-transactions': { visible: true, size: 'large' },
      'conversion-funnel': { visible: true, size: 'full' },
    },
  },
  {
    id: 'overview',
    name: 'Overzicht',
    description: 'Gebalanceerde weergave van alle belangrijke data',
    icon: 'overview',
    config: {
      'realtime-kpi': { visible: true, size: 'full' },
      'active-users': { visible: true, size: 'small' },
      'pageviews': { visible: true, size: 'small' },
      'session-duration': { visible: true, size: 'small' },
      'bounce-rate': { visible: true, size: 'small' },
      'traffic-chart': { visible: true, size: 'full' },
      'top-pages': { visible: true, size: 'full' },
      'devices': { visible: true, size: 'medium' },
      'countries': { visible: true, size: 'medium' },
      'new-returning': { visible: false, size: 'full' },
      'traffic-sources': { visible: false, size: 'full' },
      'browsers': { visible: false, size: 'medium' },
      'cities': { visible: false, size: 'medium' },
      'realtime-counter': { visible: true, size: 'small' },
      'ecommerce-revenue': { visible: true, size: 'small' },
      'ecommerce-transactions': { visible: true, size: 'small' },
      'conversion-funnel': { visible: false, size: 'full' },
    },
  },
];

// Keep LAYOUT_PRESETS for backwards compatibility
export const LAYOUT_PRESETS = BUILT_IN_PRESETS;

const STORAGE_KEY = 'dashboard-widgets-config';
const CUSTOM_PRESETS_KEY = 'dashboard-custom-presets';

export const useDashboardWidgets = () => {
  // Initialize with default widgets to prevent empty array issues
  const [widgets, setWidgets] = useState<DashboardWidget[]>(DEFAULT_WIDGETS);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [customPresets, setCustomPresets] = useState<LayoutPreset[]>([]);

  // Load widgets and custom presets from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Validate that parsed is an array
        if (!Array.isArray(parsed)) {
          localStorage.removeItem(STORAGE_KEY);
          setWidgets(DEFAULT_WIDGETS);
        } else {
          // Merge with defaults to ensure new widgets are added
          const merged = DEFAULT_WIDGETS.map(defaultWidget => {
            const storedWidget = parsed.find((w: DashboardWidget) => w && w.id === defaultWidget.id);
            return storedWidget ? { ...defaultWidget, ...storedWidget } : defaultWidget;
          });
          setWidgets(merged);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setWidgets(DEFAULT_WIDGETS);
      }
    } else {
      setWidgets(DEFAULT_WIDGETS);
    }

    // Load custom presets
    const storedPresets = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (storedPresets) {
      try {
        const parsedPresets = JSON.parse(storedPresets);
        // Validate that parsed presets is an array
        if (Array.isArray(parsedPresets)) {
          setCustomPresets(parsedPresets.filter((p: LayoutPreset) => p && p.id));
        } else {
          localStorage.removeItem(CUSTOM_PRESETS_KEY);
          setCustomPresets([]);
        }
      } catch {
        localStorage.removeItem(CUSTOM_PRESETS_KEY);
        setCustomPresets([]);
      }
    }
  }, []);

  // Get all presets (built-in + custom)
  const allPresets = [...BUILT_IN_PRESETS, ...customPresets];

  // Save widgets to localStorage whenever they change
  const saveWidgets = useCallback((newWidgets: DashboardWidget[]) => {
    setWidgets(newWidgets);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newWidgets));
    setActivePreset(null); // Clear active preset when manually changing
  }, []);

  const toggleWidgetVisibility = useCallback((widgetId: string) => {
    const newWidgets = widgets.map(w => 
      w.id === widgetId ? { ...w, visible: !w.visible } : w
    );
    saveWidgets(newWidgets);
  }, [widgets, saveWidgets]);

  const setWidgetSize = useCallback((widgetId: string, size: WidgetSize) => {
    const newWidgets = widgets.map(w => 
      w.id === widgetId ? { ...w, size } : w
    );
    saveWidgets(newWidgets);
  }, [widgets, saveWidgets]);

  const reorderWidgets = useCallback((activeId: string, overId: string) => {
    const oldIndex = widgets.findIndex(w => w.id === activeId);
    const newIndex = widgets.findIndex(w => w.id === overId);
    
    if (oldIndex === -1 || newIndex === -1) return;

    const newWidgets = [...widgets];
    const [removed] = newWidgets.splice(oldIndex, 1);
    newWidgets.splice(newIndex, 0, removed);
    
    // Update order values
    const reordered = newWidgets.map((w, idx) => ({ ...w, order: idx }));
    saveWidgets(reordered);
  }, [widgets, saveWidgets]);

  const applyPreset = useCallback((presetId: string) => {
    const preset = allPresets.find(p => p.id === presetId);
    if (!preset) return;

    const newWidgets = widgets.map(w => {
      const presetConfig = preset.config[w.id];
      if (presetConfig) {
        return { ...w, visible: presetConfig.visible, size: presetConfig.size };
      }
      return w;
    });

    setWidgets(newWidgets);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newWidgets));
    setActivePreset(presetId);
  }, [widgets, allPresets]);

  const saveCustomPreset = useCallback((name: string, description: string) => {
    // Create config from current widgets
    const config: { [widgetId: string]: { visible: boolean; size: WidgetSize } } = {};
    widgets.forEach(w => {
      config[w.id] = { visible: w.visible, size: w.size };
    });

    const newPreset: LayoutPreset = {
      id: `custom-${Date.now()}`,
      name,
      description,
      icon: 'custom',
      config,
      isCustom: true,
    };

    const updatedPresets = [...customPresets, newPreset];
    setCustomPresets(updatedPresets);
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(updatedPresets));
    setActivePreset(newPreset.id);

    return newPreset;
  }, [widgets, customPresets]);

  const deleteCustomPreset = useCallback((presetId: string) => {
    const updatedPresets = customPresets.filter(p => p.id !== presetId);
    setCustomPresets(updatedPresets);
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(updatedPresets));
    
    if (activePreset === presetId) {
      setActivePreset(null);
    }
  }, [customPresets, activePreset]);

  const updateCustomPreset = useCallback((presetId: string) => {
    // Update existing preset with current widget configuration
    const config: { [widgetId: string]: { visible: boolean; size: WidgetSize } } = {};
    widgets.forEach(w => {
      config[w.id] = { visible: w.visible, size: w.size };
    });

    const updatedPresets = customPresets.map(p => 
      p.id === presetId ? { ...p, config } : p
    );
    setCustomPresets(updatedPresets);
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(updatedPresets));
  }, [widgets, customPresets]);

  const resetToDefaults = useCallback(() => {
    setWidgets(DEFAULT_WIDGETS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_WIDGETS));
    setActivePreset(null);
  }, []);

  const getVisibleWidgets = useCallback(() => {
    return widgets.filter(w => w.visible).sort((a, b) => a.order - b.order);
  }, [widgets]);

  const getWidgetsByTab = useCallback((tabWidgetIds: string[]) => {
    return widgets
      .filter(w => tabWidgetIds.includes(w.id))
      .sort((a, b) => a.order - b.order);
  }, [widgets]);

  const getWidgetSize = useCallback((widgetId: string): WidgetSize => {
    const widget = widgets.find(w => w.id === widgetId);
    return widget?.size ?? 'medium';
  }, [widgets]);

  return {
    widgets,
    isCustomizing,
    setIsCustomizing,
    activePreset,
    customPresets,
    allPresets,
    toggleWidgetVisibility,
    setWidgetSize,
    reorderWidgets,
    applyPreset,
    saveCustomPreset,
    deleteCustomPreset,
    updateCustomPreset,
    resetToDefaults,
    getVisibleWidgets,
    getWidgetsByTab,
    getWidgetSize,
  };
};
