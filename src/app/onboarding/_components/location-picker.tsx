"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef } from "react";
import L from "leaflet";

type LatLng = {
  lat: number;
  lng: number;
};

const markerIcon = L.divIcon({
  className: "dukaanhq-map-pin",
  html: '<div class="dukaanhq-map-pin__dot"></div><div class="dukaanhq-map-pin__pulse"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export function LocationPicker({
  value,
  onChange,
}: {
  value: LatLng | null;
  onChange: (coords: LatLng) => void;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const initialCenter: L.LatLngExpression = value ? [value.lat, value.lng] : [20.5937, 78.9629];

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(initialCenter, value ? 16 : 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    map.on("click", (event: L.LeafletMouseEvent) => {
      onChangeRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    setTimeout(() => map.invalidateSize(), 0);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [value]);

  useEffect(() => {
    if (!mapRef.current || !value) {
      return;
    }

    const latLng: L.LatLngExpression = [value.lat, value.lng];
    mapRef.current.setView(latLng, 16);
    mapRef.current.invalidateSize();

    if (!markerRef.current) {
      markerRef.current = L.marker(latLng, { icon: markerIcon }).addTo(mapRef.current);
      markerRef.current.bindPopup("Selected location");
    } else {
      markerRef.current.setLatLng(latLng);
    }
  }, [value]);

  return <div ref={mapContainerRef} className="h-72 w-full rounded-[1.75rem]" />;
}
