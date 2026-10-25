import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { MapPin, LocateFixed } from "lucide-react";
import "leaflet/dist/leaflet.css";

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function MapClickHandler({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      });
    },
  });

  return null;
}

export default function LocationPicker({ location, onChange }) {
  const defaultCenter = [17.385, 78.4867];
  const [center, setCenter] = useState(
    location ? [location.latitude, location.longitude] : defaultCenter,
  );

  useEffect(() => {
    if (location) {
      setCenter([location.latitude, location.longitude]);
    }
  }, [location?.latitude, location?.longitude]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        };

        onChange(next);
        setCenter([next.latitude, next.longitude]);
      },
      () =>
        alert(
          "Unable to get your location. Allow location access or select a point on the map.",
        ),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="location-picker">
      <div className="location-map-heading">
        <div>
          <strong>
            <MapPin size={16} /> Pin the issue location
          </strong>
          <p>Click anywhere on the map to place the marker.</p>
        </div>
        <button
          type="button"
          className="button-secondary"
          onClick={useCurrentLocation}
        >
          <LocateFixed size={15} /> Use my location
        </button>
      </div>

      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom
        className="location-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onSelect={onChange} />
        {location && (
          <Marker
            position={[location.latitude, location.longitude]}
            icon={markerIcon}
          />
        )}
      </MapContainer>

      <div className="coordinate-grid">
        <label>
          Latitude
          <input
            type="number"
            min="-90"
            max="90"
            step="any"
            value={location?.latitude ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              onChange({
                ...location,
                latitude: value === "" ? "" : Number(value),
              });
            }}
            placeholder="17.385000"
            required
          />
        </label>
        <label>
          Longitude
          <input
            type="number"
            min="-180"
            max="180"
            step="any"
            value={location?.longitude ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              onChange({
                ...location,
                longitude: value === "" ? "" : Number(value),
              });
            }}
            placeholder="78.486700"
            required
          />
        </label>
      </div>
    </div>
  );
}
