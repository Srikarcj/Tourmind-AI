"use client";

import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";

type OptimizedPlace = {
  id: string;
  name: string;
  category: string;
  stateName: string;
  coordinates: {
    lat: number;
    lng: number;
  };
};

type Props = {
  places: OptimizedPlace[];
  polyline: [number, number][];
};

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
});

export default function MapOptimizedRoute({ places, polyline }: Props) {
  if (!places || places.length === 0) {
    return <p className="text-sm text-base/70">No route points available.</p>;
  }

  const center: [number, number] = [places[0].coordinates.lat, places[0].coordinates.lng];

  return (
    <div className="h-[300px] overflow-hidden rounded-2xl border border-base/20 sm:h-[420px]">
      <MapContainer center={center} zoom={6} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {places.map((place, index) => (
          <Marker key={place.id} position={[place.coordinates.lat, place.coordinates.lng]}>
            <Popup>
              <p className="font-semibold">Stop {index + 1}: {place.name}</p>
              <p>{place.category} - {place.stateName}</p>
            </Popup>
          </Marker>
        ))}

        {polyline.length > 1 && <Polyline positions={polyline} pathOptions={{ color: "#0D1B2A", weight: 4 }} />}
      </MapContainer>
    </div>
  );
}
