import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';

interface TruckMapProps {
  className?: string;
}

// Default center: Dallas, TX — a representative US road-assistance hub.
const DEFAULT_CENTER: [number, number] = [-96.797, 32.776];
const DEFAULT_ZOOM = 10;
const DEMO_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

/**
 * Stub MapLibre GL map container.
 * Initialises a MapLibre GL map on mount and cleans it up on unmount.
 * No truck markers or real data wiring — skeleton only.
 *
 * Requirements: Design — Frontend Components
 */
export default function TruckMap({ className }: TruckMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DEMO_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className ?? 'w-full h-full min-h-64'}
    />
  );
}
