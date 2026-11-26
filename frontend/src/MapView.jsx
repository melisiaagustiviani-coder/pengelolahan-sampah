import { useMemo } from 'react';
import { CircleMarker, MapContainer, Marker, Polygon, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { getPhotoUrl } from './api.js';

const center = [-2.075, 106.085];

function makeIcon(kind, status) {
  const color = kind === 'bin'
    ? ({ AVAILABLE: '#33875a', FULL: '#d88832', MAINTENANCE: '#7c8390' }[status] || '#33875a')
    : ({ REPORTED: '#dc624d', IN_PROGRESS: '#d88832', CLEANED: '#33875a' }[status] || '#dc624d');
  const glyph = kind === 'bin' ? '▰' : '!';
  return L.divIcon({
    className: 'map-pin',
    html: `<span style="--pin-color:${color}">${glyph}</span>`,
    iconSize: [34, 40],
    iconAnchor: [17, 36],
    popupAnchor: [0, -32]
  });
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(event) {
      if (onMapClick) onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng });
    }
  });
  return null;
}

function coordinatesFromBoundary(boundary) {
  const ring = boundary?.coordinates?.[0] || [];
  return ring.map(([lng, lat]) => [lat, lng]);
}

export default function MapView({
  overview,
  onMapClick,
  selectedPoint,
  polygonPoints = [],
  className = ''
}) {
  const draftPolygon = useMemo(() => polygonPoints.map(({ lat, lng }) => [lat, lng]), [polygonPoints]);

  return (
    <MapContainer center={center} zoom={14} scrollWheelZoom className={`map-canvas ${className}`}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler onMapClick={onMapClick} />
      {(overview?.bins || []).map((bin) => (
        <Marker key={`bin-${bin.bin_id}`} position={[Number(bin.lat), Number(bin.lng)]} icon={makeIcon('bin', bin.status)}>
          <Popup>
            <div className="min-w-36">
              <strong className="block">{bin.bin_code}</strong>
              <span>{bin.capacity} L · {bin.status.replace('_', ' ')}</span>
            </div>
          </Popup>
        </Marker>
      ))}
      {(overview?.dumps || []).map((dump) => (
        <Marker key={`dump-${dump.dump_id}`} position={[Number(dump.lat), Number(dump.lng)]} icon={makeIcon('dump', dump.status)}>
          <Popup>
            <div className="w-48">
              {dump.photo_url && <img className="mb-2 h-24 w-full rounded-lg object-cover" src={getPhotoUrl(dump.photo_url)} alt="Foto lokasi sampah" />}
              <strong className="block">Laporan #{dump.dump_id}</strong>
              <span className="text-xs font-semibold text-rose-700">{dump.status.replace('_', ' ')}</span>
              <p className="mt-1 text-sm">{dump.description}</p>
              <span className="text-xs text-stone-500">Pelapor: {dump.reporter_name}</span>
            </div>
          </Popup>
        </Marker>
      ))}
      {(overview?.routes || []).map((route) => {
        const positions = coordinatesFromBoundary(route.boundary);
        return positions.length ? (
          <Polygon key={`route-${route.route_id}`} positions={positions} pathOptions={{ color: '#417953', fillColor: '#80b38d', fillOpacity: 0.16, weight: 2 }}>
            <Popup>
              <strong>{route.route_name}</strong>
              <br />{route.schedule}
              {route.officer_name && <><br />Petugas: {route.officer_name}</>}
            </Popup>
          </Polygon>
        ) : null;
      })}
      {draftPolygon.length >= 2 && <Polygon positions={draftPolygon} pathOptions={{ color: '#d88832', dashArray: '5 7', fillOpacity: 0.1 }} />}
      {selectedPoint && (
        <CircleMarker center={[selectedPoint.lat, selectedPoint.lng]} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#27563b', fillOpacity: 1 }}>
          <Popup>Lokasi dipilih · {selectedPoint.lat.toFixed(5)}, {selectedPoint.lng.toFixed(5)}</Popup>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
