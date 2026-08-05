import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Feuille de style et icônes prises dans node_modules plutôt que sur unpkg :
// un CDN voit l'adresse IP de chaque visiteur, sans raison pour trois images de
// 1 ko. Vite les intègre au bundle et les sert en même origine.
import 'leaflet/dist/leaflet.css';
import urlIcone from 'leaflet/dist/images/marker-icon.png';
import urlIcone2x from 'leaflet/dist/images/marker-icon-2x.png';
import urlOmbre from 'leaflet/dist/images/marker-shadow.png';

const markerIcon = new L.Icon({
  iconUrl: urlIcone,
  iconRetinaUrl: urlIcone2x,
  shadowUrl: urlOmbre,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface CommuneMapProps {
  lat: number;
  lng: number;
  name: string;
  department: string;
}

function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 13, { animate: true });
  }, [map, lat, lng]);
  return null;
}

export function CommuneMap({ lat, lng, name, department }: CommuneMapProps) {
  return (
    <div className="h-[350px] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <MapContainer
        center={[lat, lng]}
        zoom={13}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[lat, lng]} icon={markerIcon}>
          <Popup>
            <span className="font-semibold">{name}</span>
            <br />
            <span className="text-gray-500">{department}</span>
          </Popup>
        </Marker>
        <MapRecenter lat={lat} lng={lng} />
      </MapContainer>
    </div>
  );
}
