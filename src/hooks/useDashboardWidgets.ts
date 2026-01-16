import { useState, useEffect, useCallback } from 'react';

export interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'list';
  title: string;
  description?: string;
  size: 'small' | 'medium' | 'large' | 'full';
  visible: boolean;
  order: number;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'active-users', type: 'metric', title: 'Actieve Gebruikers', size: 'small', visible: true, order: 0 },
  { id: 'pageviews', type: 'metric', title: 'Paginaweergaven', size: 'small', visible: true, order: 1 },
  { id: 'session-duration', type: 'metric', title: 'Gem. Sessieduur', size: 'small', visible: true, order: 2 },
  { id: 'bounce-rate', type: 'metric', title: 'Bounce Rate', size: 'small', visible: true, order: 3 },
  { id: 'traffic-chart', type: 'chart', title: 'Verkeer Overzicht', description: 'Gebruikers en paginaweergaven', size: 'full', visible: true, order: 4 },
  { id: 'top-pages', type: 'table', title: 'Top Pagina\'s', description: 'Meest bezochte pagina\'s', size: 'full', visible: true, order: 5 },
  { id: 'devices', type: 'chart', title: 'Apparaten', description: 'Verdeling per apparaattype', size: 'medium', visible: true, order: 6 },
  { id: 'countries', type: 'list', title: 'Landen', description: 'Top landen op basis van gebruikers', size: 'medium', visible: true, order: 7 },
  { id: 'new-returning', type: 'chart', title: 'Nieuwe vs Terugkerend', description: 'Gebruikerstype verdeling', size: 'full', visible: true, order: 8 },
  { id: 'traffic-sources', type: 'chart', title: 'Verkeersbronnen', description: 'Waar bezoekers vandaan komen', size: 'full', visible: true, order: 9 },
  { id: 'browsers', type: 'chart', title: 'Browsers', description: 'Meest gebruikte browsers', size: 'medium', visible: true, order: 10 },
  { id: 'cities', type: 'list', title: 'Steden', description: 'Top steden van bezoekers', size: 'medium', visible: true, order: 11 },
  { id: 'realtime-counter', type: 'metric', title: 'Live Gebruikers', description: 'Nu actief op de site', size: 'small', visible: true, order: 12 },
  { id: 'ecommerce-revenue', type: 'metric', title: 'Omzet', description: 'Totale omzet', size: 'small', visible: true, order: 13 },
  { id: 'ecommerce-transactions', type: 'metric', title: 'Transacties', description: 'Aantal bestellingen', size: 'small', visible: true, order: 14 },
  { id: 'conversion-funnel', type: 'chart', title: 'Conversie Funnel', description: 'Van sessie naar aankoop', size: 'full', visible: true, order: 15 },
];

const STORAGE_KEY = 'dashboard-widgets-config';

export const useDashboardWidgets = () => {
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [isCustomizing, setIsCustomizing] = useState(false);

  // Load widgets from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Merge with defaults to ensure new widgets are added
        const merged = DEFAULT_WIDGETS.map(defaultWidget => {
          const storedWidget = parsed.find((w: DashboardWidget) => w.id === defaultWidget.id);
          return storedWidget ? { ...defaultWidget, ...storedWidget } : defaultWidget;
        });
        setWidgets(merged);
      } catch {
        setWidgets(DEFAULT_WIDGETS);
      }
    } else {
      setWidgets(DEFAULT_WIDGETS);
    }
  }, []);

  // Save widgets to localStorage whenever they change
  const saveWidgets = useCallback((newWidgets: DashboardWidget[]) => {
    setWidgets(newWidgets);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newWidgets));
  }, []);

  const toggleWidgetVisibility = useCallback((widgetId: string) => {
    const newWidgets = widgets.map(w => 
      w.id === widgetId ? { ...w, visible: !w.visible } : w
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

  const resetToDefaults = useCallback(() => {
    saveWidgets(DEFAULT_WIDGETS);
  }, [saveWidgets]);

  const getVisibleWidgets = useCallback(() => {
    return widgets.filter(w => w.visible).sort((a, b) => a.order - b.order);
  }, [widgets]);

  const getWidgetsByTab = useCallback((tabWidgetIds: string[]) => {
    return widgets
      .filter(w => tabWidgetIds.includes(w.id))
      .sort((a, b) => a.order - b.order);
  }, [widgets]);

  return {
    widgets,
    isCustomizing,
    setIsCustomizing,
    toggleWidgetVisibility,
    reorderWidgets,
    resetToDefaults,
    getVisibleWidgets,
    getWidgetsByTab,
  };
};
