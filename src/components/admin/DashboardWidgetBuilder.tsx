import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  GripVertical,
  Eye,
  EyeOff,
  LayoutGrid,
  BarChart3,
  Table,
  List,
  RotateCcw,
  Settings2,
  Check,
  Minimize2,
  Square,
  Maximize2,
  RectangleHorizontal,
  Layers,
  LayoutList,
  TrendingUp,
  ShoppingCart,
  PieChart,
} from 'lucide-react';
import { DashboardWidget, WidgetSize, LayoutPreset, LAYOUT_PRESETS } from '@/hooks/useDashboardWidgets';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DashboardWidgetBuilderProps {
  widgets: DashboardWidget[];
  isCustomizing: boolean;
  setIsCustomizing: (value: boolean) => void;
  onToggleVisibility: (widgetId: string) => void;
  onSizeChange: (widgetId: string, size: WidgetSize) => void;
  onReorder: (activeId: string, overId: string) => void;
  onApplyPreset: (presetId: string) => void;
  onReset: () => void;
  activePreset: string | null;
}

const getWidgetIcon = (type: DashboardWidget['type']) => {
  switch (type) {
    case 'metric':
      return <BarChart3 className="w-4 h-4" />;
    case 'chart':
      return <LayoutGrid className="w-4 h-4" />;
    case 'table':
      return <Table className="w-4 h-4" />;
    case 'list':
      return <List className="w-4 h-4" />;
    default:
      return <LayoutGrid className="w-4 h-4" />;
  }
};

const getPresetIcon = (icon: LayoutPreset['icon']) => {
  switch (icon) {
    case 'compact':
      return <Minimize2 className="w-4 h-4" />;
    case 'detailed':
      return <LayoutList className="w-4 h-4" />;
    case 'analytics':
      return <TrendingUp className="w-4 h-4" />;
    case 'ecommerce':
      return <ShoppingCart className="w-4 h-4" />;
    case 'overview':
      return <PieChart className="w-4 h-4" />;
    default:
      return <Layers className="w-4 h-4" />;
  }
};

const getSizeLabel = (size: DashboardWidget['size']) => {
  switch (size) {
    case 'small':
      return 'Klein';
    case 'medium':
      return 'Medium';
    case 'large':
      return 'Groot';
    case 'full':
      return 'Volledig';
    default:
      return size;
  }
};

const getSizeIcon = (size: WidgetSize) => {
  switch (size) {
    case 'small':
      return <Minimize2 className="w-3 h-3" />;
    case 'medium':
      return <Square className="w-3 h-3" />;
    case 'large':
      return <Maximize2 className="w-3 h-3" />;
    case 'full':
      return <RectangleHorizontal className="w-3 h-3" />;
  }
};

interface SortableWidgetItemProps {
  widget: DashboardWidget;
  onToggleVisibility: (id: string) => void;
  onSizeChange: (id: string, size: WidgetSize) => void;
}

const SortableWidgetItem = ({ widget, onToggleVisibility, onSizeChange }: SortableWidgetItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-3 bg-card border rounded-lg transition-all",
        isDragging && "opacity-50 shadow-lg ring-2 ring-primary",
        !widget.visible && "opacity-60"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none p-1 hover:bg-muted rounded"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {getWidgetIcon(widget.type)}
          <span className={cn(
            "font-medium truncate",
            !widget.visible && "text-muted-foreground"
          )}>
            {widget.title}
          </span>
        </div>
        {widget.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {widget.description}
          </p>
        )}
      </div>

      <Select
        value={widget.size}
        onValueChange={(value: WidgetSize) => onSizeChange(widget.id, value)}
      >
        <SelectTrigger className="w-[110px] h-8">
          <SelectValue>
            <div className="flex items-center gap-1.5">
              {getSizeIcon(widget.size)}
              <span className="text-xs">{getSizeLabel(widget.size)}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="small">
            <div className="flex items-center gap-2">
              <Minimize2 className="w-3 h-3" />
              <span>Klein (25%)</span>
            </div>
          </SelectItem>
          <SelectItem value="medium">
            <div className="flex items-center gap-2">
              <Square className="w-3 h-3" />
              <span>Medium (50%)</span>
            </div>
          </SelectItem>
          <SelectItem value="large">
            <div className="flex items-center gap-2">
              <Maximize2 className="w-3 h-3" />
              <span>Groot (75%)</span>
            </div>
          </SelectItem>
          <SelectItem value="full">
            <div className="flex items-center gap-2">
              <RectangleHorizontal className="w-3 h-3" />
              <span>Volledig (100%)</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      <Switch
        checked={widget.visible}
        onCheckedChange={() => onToggleVisibility(widget.id)}
        aria-label={`${widget.visible ? 'Verberg' : 'Toon'} ${widget.title}`}
      />
    </div>
  );
};

const DragOverlayItem = ({ widget }: { widget: DashboardWidget }) => (
  <div className="flex items-center gap-3 p-3 bg-card border rounded-lg shadow-xl ring-2 ring-primary">
    <GripVertical className="w-4 h-4 text-muted-foreground" />
    <div className="flex items-center gap-2">
      {getWidgetIcon(widget.type)}
      <span className="font-medium">{widget.title}</span>
    </div>
    <Badge variant="outline" className="text-xs ml-auto">
      {getSizeLabel(widget.size)}
    </Badge>
  </div>
);

interface PresetCardProps {
  preset: LayoutPreset;
  isActive: boolean;
  onApply: (presetId: string) => void;
}

const PresetCard = ({ preset, isActive, onApply }: PresetCardProps) => {
  const visibleCount = Object.values(preset.config).filter(c => c.visible).length;

  return (
    <button
      onClick={() => onApply(preset.id)}
      className={cn(
        "flex flex-col items-start gap-2 p-3 rounded-lg border text-left transition-all hover:bg-accent/50",
        isActive && "ring-2 ring-primary bg-primary/5 border-primary"
      )}
    >
      <div className="flex items-center gap-2 w-full">
        <div className={cn(
          "p-1.5 rounded-md",
          isActive ? "bg-primary text-primary-foreground" : "bg-muted"
        )}>
          {getPresetIcon(preset.icon)}
        </div>
        <span className="font-medium flex-1">{preset.name}</span>
        {isActive && <Check className="w-4 h-4 text-primary" />}
      </div>
      <p className="text-xs text-muted-foreground">{preset.description}</p>
      <Badge variant="secondary" className="text-xs">
        {visibleCount} widgets
      </Badge>
    </button>
  );
};

export const DashboardWidgetBuilder = ({
  widgets,
  isCustomizing,
  setIsCustomizing,
  onToggleVisibility,
  onSizeChange,
  onReorder,
  onApplyPreset,
  onReset,
  activePreset,
}: DashboardWidgetBuilderProps) => {
  const [activeWidget, setActiveWidget] = useState<DashboardWidget | null>(null);
  const [showPresets, setShowPresets] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const widget = widgets.find(w => w.id === event.active.id);
    setActiveWidget(widget || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveWidget(null);

    if (over && active.id !== over.id) {
      onReorder(active.id as string, over.id as string);
    }
  };

  const visibleCount = widgets.filter(w => w.visible).length;
  const hiddenCount = widgets.filter(w => !w.visible).length;

  const handleReset = () => {
    onReset();
    toast.success('Dashboard gereset naar standaard instellingen');
  };

  const handleApplyPreset = (presetId: string) => {
    onApplyPreset(presetId);
    const preset = LAYOUT_PRESETS.find(p => p.id === presetId);
    toast.success(`Preset "${preset?.name}" toegepast`);
    setShowPresets(false);
  };

  const handleDone = () => {
    setIsCustomizing(false);
    toast.success('Dashboard aangepast');
  };

  return (
    <Sheet open={isCustomizing} onOpenChange={setIsCustomizing}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <Settings2 className="w-4 h-4" />
          Aanpassen
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5" />
            Dashboard Aanpassen
          </SheetTitle>
          <SheetDescription>
            Kies een preset of pas individuele widgets aan.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2 py-4 border-b">
          <Button
            variant={showPresets ? "default" : "outline"}
            size="sm"
            onClick={() => setShowPresets(true)}
            className="flex items-center gap-2"
          >
            <Layers className="w-4 h-4" />
            Presets
          </Button>
          <Button
            variant={!showPresets ? "default" : "outline"}
            size="sm"
            onClick={() => setShowPresets(false)}
            className="flex items-center gap-2"
          >
            <Settings2 className="w-4 h-4" />
            Handmatig
          </Button>
          <div className="flex-1" />
          <Badge variant="default" className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {visibleCount}
          </Badge>
          <Badge variant="secondary" className="flex items-center gap-1">
            <EyeOff className="w-3 h-3" />
            {hiddenCount}
          </Badge>
        </div>

        {showPresets ? (
          <ScrollArea className="h-[calc(100vh-280px)] pr-4 py-4">
            <div className="grid gap-3">
              {LAYOUT_PRESETS.map(preset => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  isActive={activePreset === preset.id}
                  onApply={handleApplyPreset}
                />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <>
            <div className="py-3 px-1 bg-muted/50 rounded-lg my-4">
              <p className="text-xs text-muted-foreground text-center">
                <strong>Grootte:</strong> Klein = 25%, Medium = 50%, Groot = 75%, Volledig = 100% breedte
              </p>
            </div>

            <ScrollArea className="h-[calc(100vh-380px)] pr-4">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={widgets.map(w => w.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="space-y-2">
                    {widgets.sort((a, b) => a.order - b.order).map(widget => (
                      <SortableWidgetItem
                        key={widget.id}
                        widget={widget}
                        onToggleVisibility={onToggleVisibility}
                        onSizeChange={onSizeChange}
                      />
                    ))}
                  </div>
                </SortableContext>

                <DragOverlay>
                  {activeWidget && <DragOverlayItem widget={activeWidget} />}
                </DragOverlay>
              </DndContext>
            </ScrollArea>
          </>
        )}

        <SheetFooter className="flex-row gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleReset}
            className="flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </Button>
          <Button
            onClick={handleDone}
            className="flex-1 flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Klaar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
