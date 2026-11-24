"use client";

import "leaflet/dist/leaflet.css";

import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";

type LatLng = {
  lat: number;
  lng: number;
};

const markerIcon = L.icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export function LocationPicker({
  value,
  onChange,
  interactive = true,
  className = "h-72",
}: {
  value: LatLng | null;
  onChange: (coords: LatLng) => void;
  interactive?: boolean;
  className?: string;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);

  function invalidateMapSize() {
    if (!mapRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      mapRef.current?.invalidateSize(false);
    });

    window.setTimeout(() => {
      mapRef.current?.invalidateSize(false);
    }, 150);
  }

  const placeMarker = useCallback((coords: LatLng) => {
    if (!mapRef.current) {
      return;
    }

    const latLng: L.LatLngExpression = [coords.lat, coords.lng];

    if (!markerRef.current) {
      markerRef.current = L.marker(latLng, {
        draggable: interactive,
        icon: markerIcon,
      }).addTo(mapRef.current);
      if (interactive) {
        markerRef.current.on("dragend", () => {
          const nextPosition = markerRef.current?.getLatLng();
          if (!nextPosition) {
            return;
          }
          onChangeRef.current({ lat: nextPosition.lat, lng: nextPosition.lng });
        });
      }
      markerRef.current.bindPopup("Selected location");
    } else {
      markerRef.current.setLatLng(latLng);
      if (markerRef.current.dragging && interactive !== markerRef.current.dragging.enabled()) {
        if (interactive) {
          markerRef.current.dragging.enable();
        } else {
          markerRef.current.dragging.disable();
        }
      }
    }
  }, [interactive]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const initialCenter: L.LatLngExpression = initialValueRef.current
      ? [initialValueRef.current.lat, initialValueRef.current.lng]
      : [20.5937, 78.9629];

    const map = L.map(mapContainerRef.current, {
      zoomControl: interactive,
      attributionControl: true,
      dragging: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      scrollWheelZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      tapHold: interactive,
    }).setView(initialCenter, initialValueRef.current ? 16 : 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    if (interactive) {
      map.on("click", (event: L.LeafletMouseEvent) => {
        const coords = { lat: event.latlng.lat, lng: event.latlng.lng };
        placeMarker(coords);
        onChangeRef.current(coords);
      });
    }

    mapRef.current = map;
    invalidateMapSize();

    if (initialValueRef.current) {
      placeMarker(initialValueRef.current);
    }

    const resizeObserver = new ResizeObserver(() => {
      invalidateMapSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [interactive, placeMarker]);

  useEffect(() => {
    if (!mapRef.current || !value) {
      return;
    }

    if (!markerRef.current) {
      const latLng: L.LatLngExpression = [value.lat, value.lng];
      mapRef.current.setView(latLng, 16);
      invalidateMapSize();
    }

    placeMarker(value);
  }, [interactive, placeMarker, value]);

  return <div ref={mapContainerRef} className={`${className} w-full overflow-hidden bg-stone-100 relative z-0`} />;
}
