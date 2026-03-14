import { useEffect, useRef, useState } from "react";
import { MapPin, Shield, AlertTriangle, XCircle, Loader2, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSafetyMap } from "@/hooks/use-ai";
import { useEntitlements } from "@/hooks/use-entitlements";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface SafetyZone {
  name: string;
  lat: number;
  lng: number;
  radius: number;
  level: "safe" | "caution" | "avoid";
  description: string;
  commonIncidents?: string[];
  travelerNote?: string;
  timingNote?: string;
}

interface SafetyMapData {
  center: { lat: number; lng: number };
  summary?: string;
  zones: SafetyZone[];
}

const ZONE_COLORS = {
  safe: { fill: "#22c55e", stroke: "#16a34a", bg: "bg-green-500/10", text: "text-green-600", label: "Safe" },
  caution: { fill: "#f59e0b", stroke: "#d97706", bg: "bg-amber-500/10", text: "text-amber-600", label: "Caution" },
  avoid: { fill: "#ef4444", stroke: "#dc2626", bg: "bg-red-500/10", text: "text-red-600", label: "Avoid" },
};

const ZONE_ICONS = {
  safe: <Shield className="h-4 w-4" />,
  caution: <AlertTriangle className="h-4 w-4" />,
  avoid: <XCircle className="h-4 w-4" />,
};

export function SafetyMap({ destination }: { destination: string }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const safetyMapMutation = useSafetyMap();
  const [mapData, setMapData] = useState<SafetyMapData | null>(null);
  const [selectedZone, setSelectedZone] = useState<SafetyZone | null>(null);
  const [filter, setFilter] = useState<"all" | "safe" | "caution" | "avoid">("all");
  const { data: entitlements } = useEntitlements(true);

  const handleLoadMap = () => {
    if (!entitlements?.enabledFeatures.includes("google_maps")) {
      window.location.href = "/pricing";
      return;
    }
    safetyMapMutation.mutate(destination, {
      onSuccess: (data) => setMapData(data),
    });
  };

  useEffect(() => {
    if (!mapData || !mapContainerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [mapData.center.lat, mapData.center.lng],
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
    }).addTo(map);

    const filteredZones = filter === "all" ? mapData.zones : mapData.zones.filter(z => z.level === filter);

    filteredZones.forEach((zone) => {
      const colors = ZONE_COLORS[zone.level];

      L.circle([zone.lat, zone.lng], {
        radius: zone.radius,
        color: colors.stroke,
        fillColor: colors.fill,
        fillOpacity: 0.25,
        weight: 2,
      })
        .addTo(map)
        .bindPopup(
          `<div style="min-width:180px">
            <strong style="font-size:14px">${zone.name}</strong>
            <div style="margin:6px 0;padding:3px 8px;border-radius:4px;display:inline-block;font-size:11px;font-weight:600;background:${colors.fill}22;color:${colors.stroke}">${colors.label}</div>
            <p style="margin:0 0 6px 0;font-size:13px;color:#555">${zone.description}</p>
            ${zone.timingNote ? `<p style="margin:0;font-size:12px;color:#666"><strong>Timing:</strong> ${zone.timingNote}</p>` : ""}
          </div>`
        );

      const icon = L.divIcon({
        className: "custom-marker",
        html: `<div style="background:${colors.fill};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      L.marker([zone.lat, zone.lng], { icon })
        .addTo(map)
        .on("click", () => setSelectedZone(zone));
    });

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapData, filter]);

  if (!mapData && !safetyMapMutation.isPending) {
    return (
      <div className="border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center p-12 text-center bg-card/50">
        <Map className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h3 className="text-xl font-semibold text-muted-foreground mb-2" data-testid="text-map-prompt">Interactive Safety Map</h3>
        <p className="text-sm text-muted-foreground/70 mb-6 max-w-md">
          Visualize safe zones, areas of caution, and neighborhoods to avoid on an interactive map.
        </p>
        <Button
          onClick={handleLoadMap}
          className="rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          data-testid="button-load-map"
        >
          <MapPin className="h-4 w-4 mr-2" /> {entitlements?.enabledFeatures.includes("google_maps") ? "Generate Safety Map" : "Unlock Safety Map"}
        </Button>
      </div>
    );
  }

  if (safetyMapMutation.isPending) {
    return (
      <div className="border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center p-16 bg-card/50">
        <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground animate-pulse font-medium" data-testid="text-map-loading">Mapping safety zones for {destination}...</p>
      </div>
    );
  }

  const resolvedMapData = mapData!;
  const visibleZones = filter === "all" ? resolvedMapData.zones : resolvedMapData.zones.filter((zone) => zone.level === filter);

  return (
    <div className="space-y-4" data-testid="safety-map-container">
      {resolvedMapData.summary ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          {resolvedMapData.summary}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "safe", "caution", "avoid"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            data-testid={`button-filter-${f}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? f === "all"
                  ? "bg-foreground text-background"
                  : `${ZONE_COLORS[f].bg} ${ZONE_COLORS[f].text} ring-1 ring-current`
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f === "all" ? "All Zones" : ZONE_COLORS[f].label}
          </button>
        ))}
        <Button
          onClick={handleLoadMap}
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground"
          data-testid="button-refresh-map"
        >
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="zone-summary-cards">
        {visibleZones.map((zone) => (
          <button
            key={`${zone.name}-${zone.level}`}
            type="button"
            onClick={() => {
              setSelectedZone(zone);
              mapRef.current?.setView([zone.lat, zone.lng], 14, { animate: true });
            }}
            className={`rounded-2xl border p-4 text-left transition hover:border-primary/40 hover:shadow-sm ${selectedZone?.name === zone.name ? "border-primary/50 bg-primary/5" : "border-border/60 bg-card"}`}
            data-testid={`zone-card-${zone.name}`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 ${ZONE_COLORS[zone.level].text}`}>
                {ZONE_ICONS[zone.level]}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-semibold text-foreground">{zone.name}</h4>
                  <span className={`text-xs font-semibold uppercase ${ZONE_COLORS[zone.level].text}`}>
                    {ZONE_COLORS[zone.level].label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{zone.description}</p>
                {zone.timingNote ? (
                  <p className="mt-2 text-xs font-medium text-muted-foreground">Timing: {zone.timingNote}</p>
                ) : null}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-2xl overflow-hidden border border-border shadow-lg">
        <div ref={mapContainerRef} style={{ height: "450px", width: "100%" }} />
      </div>

      {selectedZone && (
        <div className={`rounded-xl p-4 border ${ZONE_COLORS[selectedZone.level].bg}`} data-testid="selected-zone-info">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 ${ZONE_COLORS[selectedZone.level].text}`}>
              {ZONE_ICONS[selectedZone.level]}
            </div>
            <div>
              <h4 className="font-semibold">{selectedZone.name}</h4>
              <span className={`text-xs font-semibold uppercase ${ZONE_COLORS[selectedZone.level].text}`}>
                {ZONE_COLORS[selectedZone.level].label}
              </span>
              <p className="text-sm text-muted-foreground mt-1">{selectedZone.description}</p>
              {selectedZone.timingNote ? (
                <p className="text-xs font-medium text-muted-foreground mt-2">Timing: {selectedZone.timingNote}</p>
              ) : null}
              {selectedZone.travelerNote ? (
                <p className="text-sm text-foreground mt-2">{selectedZone.travelerNote}</p>
              ) : null}
              {selectedZone.commonIncidents?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedZone.commonIncidents.map((incident) => (
                    <span
                      key={incident}
                      className="inline-flex items-center rounded-full bg-background/70 px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-border"
                    >
                      {incident}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <button onClick={() => setSelectedZone(null)} className="ml-auto text-muted-foreground hover:text-foreground">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {mapData && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="zone-legend">
          {(["safe", "caution", "avoid"] as const).map((level) => {
            const count = resolvedMapData.zones.filter(z => z.level === level).length;
            return (
              <div key={level} className={`rounded-xl p-3 ${ZONE_COLORS[level].bg} flex items-center gap-3`}>
                <div className={ZONE_COLORS[level].text}>{ZONE_ICONS[level]}</div>
                <div>
                  <span className={`font-semibold text-sm ${ZONE_COLORS[level].text}`}>{count} {ZONE_COLORS[level].label}</span>
                  <span className="text-xs text-muted-foreground ml-1">
                    {level === "safe" ? "areas" : level === "caution" ? "areas" : "areas"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
