import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Rectangle,
  Tooltip,
} from 'react-leaflet';

type Props = {
  od: string;
  commodity: string;
  shares: Record<string, number>;
};

const COUNTRY_BOUNDS: Record<string, [[number, number], [number, number]]> = {
  DE: [
    [47.2, 5.5],
    [55.1, 15.5],
  ],
  AT: [
    [46.2, 9.3],
    [49.1, 17.2],
  ],
  CZ: [
    [48.5, 12.1],
    [51.1, 18.9],
  ],
  SK: [
    [47.7, 16.8],
    [49.7, 22.6],
  ],
  HU: [
    [45.6, 16.0],
    [48.7, 22.9],
  ],
  RO: [
    [43.6, 20.3],
    [48.4, 29.8],
  ],
};

const CITY: Record<string, [number, number]> = {
  'Wien (AT)': [48.2082, 16.3738],
  'Constanța (RO)': [44.1598, 28.6348],
  'Regensburg (DE)': [49.0134, 12.1016],
  'Budapest (HU)': [47.4979, 19.0402],
  'Linz (AT)': [48.3069, 14.2858],
  'Galați (RO)': [45.4353, 28.007],
  'München (DE)': [48.1374, 11.5755],
  'Bratislava (SK)': [48.1486, 17.1077],
};

function odToLatLngs(od: string): [[number, number], [number, number]] {
  const [a, b] = od.split(' – ');
  return [CITY[a.trim()], CITY[b.trim()]];
}

export default function CorridorMapLeaflet({ od, commodity }: Props) {
  const [from, to] = odToLatLngs(od);
  const center: [number, number] = [48.2, 17.0];
  const zoom = 5;

  return (
    <div className="map-container">
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={false}
        className="map-leaflet"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" // statt https://{s}.tile...
          crossOrigin="" // hilft im Sandbox/Preview
        />

        {Object.entries(COUNTRY_BOUNDS).map(([code, bounds]) => (
          <Rectangle
            key={code}
            bounds={bounds}
            pathOptions={{ color: '#60a5fa', weight: 1, fillOpacity: 0.08 }}
          />
        ))}

        <Polyline
          positions={[from, to]}
          pathOptions={{
            color: '#64748b',
            weight: 2,
            opacity: 0.7,
            dashArray: '6 4',
          }}
        />

        <CircleMarker
          center={from}
          radius={6}
          pathOptions={{ color: '#dc2626', fillOpacity: 1 }}
        >
          <Tooltip direction="right" offset={[8, 0]} permanent>
            {od.split(' – ')[0]}
          </Tooltip>
        </CircleMarker>
        <CircleMarker
          center={to}
          radius={6}
          pathOptions={{ color: '#dc2626', fillOpacity: 1 }}
        >
          <Tooltip direction="right" offset={[8, 0]} permanent>
            {od.split(' – ')[1]}
          </Tooltip>
        </CircleMarker>
      </MapContainer>

      <div className="map-badge">
        <span className="badge-label">OD:</span>
        <span className="badge-value">{od}</span>
        <span className="badge-commodity">{commodity}</span>
      </div>
    </div>
  );
}
