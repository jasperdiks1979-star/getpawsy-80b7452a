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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
} from 'lucide-react';
import { DashboardWidget } from '@/hooks/useDashboardWidgets';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DashboardWidgetBuilderProps {
  widgets: DashboardWidget[];
  isCustomizing: boolean;
  setIsCustomizing: (value: boolean) => void;
  onToggleVisibility: (widgetId: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onReset: () => void;
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

interface SortableWidgetItemProps {
  widget: DashboardWidget;
  onToggleVisibility: (id: string) => void;
}

const SortableWidgetItem = ({ widget, onToggleVisibility }: SortableWidgetItemProps) => {
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

      <Badge variant="outline" className="text-xs shrink-0">
        {getSizeLabel(widget.size)}
      </Badge>

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

export const DashboardWidgetBuilder = ({
  widgets,
  isCustomizing,
  setIsCustomizing,
  onToggleVisibility,
  onReorder,
  onReset,
}: DashboardWidgetBuilderProps) => {
  const [activeWidget, setActiveWidget] = useState<DashboardWidget | null>(null);

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
            Sleep widgets om de volgorde aan te passen. Schakel widgets in of uit om ze te tonen of verbergen.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-4 py-4 border-b">
          <Badge variant="default" className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {visibleCount} zichtbaar
          </Badge>
          <Badge variant="secondary" className="flex items-center gap-1">
            <EyeOff className="w-3 h-3" />
            {hiddenCount} verborgen
          </Badge>
        </div>

        <ScrollArea className="h-[calc(100vh-280px)] pr-4 py-4">
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
                  />
                ))}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeWidget && <DragOverlayItem widget={activeWidget} />}
            </DragOverlay>
          </DndContext>
        </ScrollArea>

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
