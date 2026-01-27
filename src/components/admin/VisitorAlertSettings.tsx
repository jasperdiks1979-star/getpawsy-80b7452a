import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Bell, BellRing, Users, ShoppingCart, Volume2, VolumeX, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface AlertThresholds {
  visitors: number;
  checkouts: number;
  enabled: boolean;
  soundEnabled: boolean;
}

interface AlertState {
  visitorsTriggered: boolean;
  checkoutsTriggered: boolean;
  lastVisitorAlert: Date | null;
  lastCheckoutAlert: Date | null;
}

interface VisitorAlertSettingsProps {
  thresholds: AlertThresholds;
  alertState: AlertState;
  currentVisitors: number;
  currentCheckouts: number;
  onUpdateThresholds: (updates: Partial<AlertThresholds>) => void;
  onResetAlerts: () => void;
}

const VisitorAlertSettings = memo(function VisitorAlertSettings({
  thresholds,
  alertState,
  currentVisitors,
  currentCheckouts,
  onUpdateThresholds,
  onResetAlerts,
}: VisitorAlertSettingsProps) {
  const { permission, requestPermission, pushEnabled } = usePushNotifications();

  const formatLastAlert = (date: Date | null) => {
    if (!date) return "Nog geen alert";
    return date.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {thresholds.enabled ? (
              <BellRing className="h-5 w-5 text-primary animate-pulse" />
            ) : (
              <Bell className="h-5 w-5 text-muted-foreground" />
            )}
            Drempelwaarde Alerts
          </CardTitle>
          <Switch
            checked={thresholds.enabled}
            onCheckedChange={(enabled) => onUpdateThresholds({ enabled })}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Visitor Threshold */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Bezoekers Drempel
            </Label>
            <div className="flex items-center gap-2">
              <Badge variant={alertState.visitorsTriggered ? "destructive" : "secondary"}>
                {currentVisitors} / {thresholds.visitors}
              </Badge>
              {alertState.visitorsTriggered && (
                <span className="text-xs text-destructive font-medium">ACTIEF</span>
              )}
            </div>
          </div>
          <Slider
            value={[thresholds.visitors]}
            onValueChange={([value]) => onUpdateThresholds({ visitors: value })}
            min={5}
            max={200}
            step={5}
            disabled={!thresholds.enabled}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>5</span>
            <span>Trigger bij {thresholds.visitors} bezoekers</span>
            <span>200</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Laatste alert: {formatLastAlert(alertState.lastVisitorAlert)}
          </p>
        </div>

        {/* Checkout Threshold */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-green-500" />
              Checkout Drempel
            </Label>
            <div className="flex items-center gap-2">
              <Badge variant={alertState.checkoutsTriggered ? "destructive" : "secondary"}>
                {currentCheckouts} / {thresholds.checkouts}
              </Badge>
              {alertState.checkoutsTriggered && (
                <span className="text-xs text-destructive font-medium">ACTIEF</span>
              )}
            </div>
          </div>
          <Slider
            value={[thresholds.checkouts]}
            onValueChange={([value]) => onUpdateThresholds({ checkouts: value })}
            min={1}
            max={50}
            step={1}
            disabled={!thresholds.enabled}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1</span>
            <span>Trigger bij {thresholds.checkouts} checkouts</span>
            <span>50</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Laatste alert: {formatLastAlert(alertState.lastCheckoutAlert)}
          </p>
        </div>

        {/* Sound Toggle */}
        <div className="flex items-center justify-between py-2 border-t">
          <Label className="flex items-center gap-2">
            {thresholds.soundEnabled ? (
              <Volume2 className="h-4 w-4 text-primary" />
            ) : (
              <VolumeX className="h-4 w-4 text-muted-foreground" />
            )}
            Geluidsmeldingen
          </Label>
          <Switch
            checked={thresholds.soundEnabled}
            onCheckedChange={(soundEnabled) => onUpdateThresholds({ soundEnabled })}
            disabled={!thresholds.enabled}
          />
        </div>

        {/* Push Notifications */}
        <div className="flex items-center justify-between py-2 border-t">
          <Label className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Push Notificaties
          </Label>
          {permission === "granted" ? (
            <Badge variant="default" className="bg-green-500">
              Ingeschakeld
            </Badge>
          ) : permission === "denied" ? (
            <Badge variant="destructive">Geblokkeerd</Badge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={requestPermission}
              disabled={!thresholds.enabled}
            >
              Inschakelen
            </Button>
          )}
        </div>

        {/* Reset Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onResetAlerts}
          disabled={!thresholds.enabled}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset Alert Status
        </Button>

        {/* Info */}
        <p className="text-xs text-muted-foreground text-center">
          Alerts worden alleen getriggerd na 5 minuten cooldown om spam te voorkomen.
        </p>
      </CardContent>
    </Card>
  );
});

export default VisitorAlertSettings;
