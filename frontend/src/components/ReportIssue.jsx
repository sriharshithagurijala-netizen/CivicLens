import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FilePlus2,
  MapPin,
  Send,
  ImagePlus,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import LocationPicker from "./LocationPicker";

const API = "http://localhost:5000/api";

const categories = [
  { value: "pothole", label: "Pothole" },
  { value: "streetlight", label: "Broken streetlight" },
  { value: "garbage", label: "Overflowing garbage" },
  { value: "drainage", label: "Drainage problem" },
  { value: "water_supply", label: "Water supply" },
  { value: "road_damage", label: "Road damage" },
  { value: "other", label: "Other issue" },
];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ReportIssue({ onBack, onCreated }) {
  const { token } = useAuth();

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "pothole",
    address: "",
  });

  const [location, setLocation] = useState({
    latitude: 17.385,
    longitude: 78.4867,
  });

  const [selectedImage, setSelectedImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [uploadWarning, setUploadWarning] = useState("");
  const [success, setSuccess] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function handleImageChange(event) {
    const file = event.target.files?.[0] || null;

    setError("");
    setUploadWarning("");

    if (!file) {
      setSelectedImage(null);
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setSelectedImage(null);
      event.target.value = "";
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setSelectedImage(null);
      event.target.value = "";
      setError("The image must be 5 MB or smaller.");
      return;
    }

    setSelectedImage(file);
  }

  function resetForm() {
    setForm({
      title: "",
      description: "",
      category: "pothole",
      address: "",
    });

    setLocation({
      latitude: 17.385,
      longitude: 78.4867,
    });

    setSelectedImage(null);
    setError("");
    setUploadWarning("");
    setSuccess(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setUploadWarning("");

    if (!token) {
      setError("Your session has expired. Please log in again.");
      return;
    }

    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);

    if (
      location.latitude === "" ||
      location.longitude === "" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setError(
        "Choose a valid location on the map or enter valid coordinates.",
      );
      return;
    }

    if (selectedImage) {
      if (!ALLOWED_IMAGE_TYPES.includes(selectedImage.type)) {
        setError("Choose a JPG, PNG, or WebP image.");
        return;
      }

      if (selectedImage.size > MAX_IMAGE_SIZE) {
        setError("The image must be 5 MB or smaller.");
        return;
      }
    }

    setSubmitting(true);

    try {
      // Step 1: Create the report in MongoDB.
      const response = await fetch(`${API}/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          location: {
            address: form.address.trim(),
            latitude,
            longitude,
          },
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Failed to submit the report.");
      }

      if (!data.report?._id) {
        throw new Error(
          "The report was created, but the server did not return its ID.",
        );
      }

      let finalReport = data.report;

      // Step 2: Upload the optional photo for this report.
      if (selectedImage) {
        try {
          const imageForm = new FormData();
          imageForm.append("image", selectedImage);

          const imageResponse = await fetch(
            `${API}/reports/${data.report._id}/image`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
              },
              body: imageForm,
            },
          );

          const imageData = await imageResponse.json().catch(() => ({}));

          if (!imageResponse.ok) {
            throw new Error(imageData.message || "The photo upload failed.");
          }

          finalReport = imageData.report || finalReport;
        } catch (imageError) {
          // Report creation succeeded even if photo upload failed.
          setUploadWarning(
            `Your report was created, but the photo could not be uploaded. ${
              imageError.message || "Please try again later."
            }`,
          );
        }
      }

      // Notify the dashboard so it can refresh its report list.
      if (onCreated) {
        onCreated(finalReport);
      }

      setSuccess(true);
    } catch (err) {
      setError(
        err.message || "Unable to submit the report. Check your connection.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <section className="report-page">
        <div className="success-card">
          <div className="success-icon">
            <CheckCircle2 size={34} />
          </div>

          <h1>Report submitted!</h1>

          <p>
            Your civic issue has been recorded. You can track its status from
            the reports dashboard.
          </p>

          {uploadWarning && (
            <div className="auth-error" role="alert">
              {uploadWarning}
            </div>
          )}

          <button className="auth-submit" type="button" onClick={onBack}>
            Back to dashboard <ArrowRight size={17} />
          </button>

          <button className="text-button" type="button" onClick={resetForm}>
            Submit another issue
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="report-page">
      <div className="report-page-heading">
        <div className="report-heading-icon">
          <FilePlus2 size={23} />
        </div>

        <div>
          <div className="eyebrow">COMMUNITY REPORTING</div>
          <h1>Report a civic issue</h1>
          <p>
            Share accurate details so the issue can be reviewed and addressed.
          </p>
        </div>
      </div>

      <form className="issue-form panel" onSubmit={handleSubmit}>
        <div className="form-section-title">
          <span>01</span>
          <div>
            <h2>Issue details</h2>
            <p>Describe the problem you noticed.</p>
          </div>
        </div>

        <div className="issue-form-fields">
          <label>
            Issue title <span>*</span>
            <input
              name="title"
              value={form.title}
              onChange={updateField}
              minLength={5}
              maxLength={120}
              placeholder="e.g. Deep pothole near the main road"
              required
              disabled={submitting}
            />
          </label>

          <label>
            Category <span>*</span>
            <select
              name="category"
              value={form.category}
              onChange={updateField}
              required
              disabled={submitting}
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="full-width">
            Description <span>*</span>
            <textarea
              name="description"
              value={form.description}
              onChange={updateField}
              minLength={10}
              maxLength={3000}
              rows={4}
              placeholder="Explain what happened, how severe it is, and how it affects people..."
              required
              disabled={submitting}
            />
            <small>{form.description.length}/3000 characters</small>
          </label>

          <label className="full-width">
            <span>
              <ImagePlus
                size={15}
                style={{
                  display: "inline",
                  verticalAlign: "middle",
                  marginRight: 6,
                }}
              />
              Issue photo (optional)
            </span>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange}
              disabled={submitting}
            />

            <small>JPG, PNG, or WebP. Maximum size: 5 MB.</small>

            {selectedImage && (
              <small>
                Selected: {selectedImage.name} (
                {(selectedImage.size / (1024 * 1024)).toFixed(2)} MB)
              </small>
            )}
          </label>
        </div>

        <div className="form-section-title location-section-title">
          <span>02</span>
          <div>
            <h2>Issue location</h2>
            <p>Pin the approximate location on the map.</p>
          </div>
        </div>

        <label className="address-field">
          <MapPin size={16} />
          <input
            name="address"
            value={form.address}
            onChange={updateField}
            maxLength={300}
            placeholder="Street, landmark, area (optional)"
            disabled={submitting}
          />
        </label>

        <LocationPicker location={location} onChange={setLocation} />

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <div className="form-actions">
          <span>Fields marked * are required.</span>

          <button className="auth-submit" type="submit" disabled={submitting}>
            <Send size={16} />
            {submitting ? "Submitting..." : "Submit report"}
          </button>
        </div>
      </form>
    </section>
  );
}
