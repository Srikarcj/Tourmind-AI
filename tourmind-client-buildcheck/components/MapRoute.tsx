"use client";

import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";

type Point = {
  name: string;
  lat: number;
  lng: number;
};

type Waypoint = Point & {
  label?: string;
};

type Props = {
  start: Point;
  destination: Point;
  polyline: [number, number][];
  waypoints?: Waypoint[];
};

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
});

const findCenter = (polyline: [number, number][], start: Point, destination: Point): [number, number] => {
  if (polyline.length === 0) {
    return [(start.lat + destination.lat) / 2, (start.lng + destination.lng) / 2];
  }

  const lat = polyline.reduce((sum, [currentLat]) => sum + currentLat, 0) / polyline.length;
  const lng = polyline.reduce((sum, [, currentLng]) => sum + currentLng, 0) / polyline.length;

  return [lat, lng];
};

export default function MapRoute({ start, destination, polyline, waypoints = [] }: Props) {
  const center = findCenter(polyline, start, destination);

  return (
    <div className="h-[280px] overflow-hidden rounded-2xl border border-base/20 sm:h-[380px] lg:h-[500px]">
      <MapContainer center={center} zoom={6} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={[start.lat, start.lng]}>
          <Popup>Start: {start.name}</Popup>
        </Marker>

        {waypoints.map((point, index) => (
          <Marker key={`${point.name}-${index}`} position={[point.lat, point.lng]}>
            <Popup>
              {point.label || `Stop ${index + 1}`}: {point.name}
            </Popup>
          </Marker>
        ))}

        <Marker position={[destination.lat, destination.lng]}>
          <Popup>Destination: {destination.name}</Popup>
        </Marker>

        <Polyline positions={polyline} pathOptions={{ color: "#2A9D8F", weight: 4 }} />
      </MapContainer>
    </div>
  );
}
