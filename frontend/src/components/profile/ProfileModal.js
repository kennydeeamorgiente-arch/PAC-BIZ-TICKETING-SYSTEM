'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import api from '@/lib/api';

const DEFAULT_FORM = {
  full_name: '',
  email: '',
  shift_type: 'AM',
  avatar_data: null,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export default function ProfileModal({ open, onClose, user, onSaved }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [avatarSource, setAvatarSource] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarDirty, setAvatarDirty] = useState(false);
  const [cropZoom, setCropZoom] = useState(1.2);
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);

  useEffect(() => {
    if (!open) return;
    setIsEditing(false);
    setMessage('');
    setError('');
    setForm({
      full_name: user?.name || '',
      email: user?.email || '',
      shift_type: user?.shift_type || 'AM',
      avatar_data: user?.avatar_data || null,
    });
    setAvatarSource(user?.avatar_data || null);
    setAvatarPreview(user?.avatar_data || null);
    setAvatarDirty(false);
    setCropZoom(1.2);
    setCropX(50);
    setCropY(50);
  }, [open, user]);

  const generateCroppedAvatar = async () => {
    if (!avatarSource) return null;
    const img = await loadImage(avatarSource);

    const zoom = clamp(Number(cropZoom || 1), 1, 3);
    const minSide = Math.min(img.width, img.height);
    const cropSide = minSide / zoom;
    const centerX = (clamp(Number(cropX || 50), 0, 100) / 100) * img.width;
    const centerY = (clamp(Number(cropY || 50), 0, 100) / 100) * img.height;
    const sx = clamp(centerX - cropSide / 2, 0, img.width - cropSide);
    const sy = clamp(centerY - cropSide / 2, 0, img.height - cropSide);

    const size = 320;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');
    ctx.drawImage(img, sx, sy, cropSide, cropSide, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.9);
  };

  const onAvatarFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!String(file.type || '').startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }

    if (Number(file.size || 0) > 5 * 1024 * 1024) {
      setError('Image must be 5MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;
      setError('');
      setAvatarSource(dataUrl);
      setAvatarPreview(dataUrl);
      setAvatarDirty(true);
      setCropZoom(1.2);
      setCropX(50);
      setCropY(50);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!user?.id) {
      setError('Profile is not available right now.');
      return;
    }

    const payload = {
      full_name: String(form.full_name || '').trim(),
      email: String(form.email || '').trim(),
      shift_type: String(form.shift_type || 'AM'),
      avatar_data: form.avatar_data || null,
    };

    if (!payload.full_name || !payload.email) {
      setError('Full name and email are required.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');
    try {
      if (avatarDirty) {
        payload.avatar_data = await generateCroppedAvatar();
      }

      await api.updateUser(user.id, payload);
      await onSaved?.();
      setMessage('Profile updated.');
      setIsEditing(false);
      setForm((prev) => ({ ...prev, avatar_data: payload.avatar_data || null }));
      setAvatarSource(payload.avatar_data || null);
      setAvatarPreview(payload.avatar_data || null);
      setAvatarDirty(false);
    } catch (err) {
      setError(err?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const displayName = String(form.full_name || user?.name || 'IT Personnel');
  const initial = displayName.charAt(0).toUpperCase() || 'I';
  const currentAvatar = avatarPreview || form.avatar_data || user?.avatar_data || null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="My Profile"
      maxWidthClass="max-w-md"
      closeOnOverlay={false}
      footer={(
        <div key={isEditing ? 'editing-footer' : 'view-footer'} className="flex justify-end gap-2">
          {isEditing ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsEditing(false);
                  setMessage('');
                  setError('');
                  setForm({
                    full_name: user?.name || '',
                    email: user?.email || '',
                    shift_type: user?.shift_type || 'AM',
                    avatar_data: user?.avatar_data || null,
                  });
                  setAvatarSource(user?.avatar_data || null);
                  setAvatarPreview(user?.avatar_data || null);
                  setAvatarDirty(false);
                  setCropZoom(1.2);
                  setCropX(50);
                  setCropY(50);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" form="profile-modal-form" loading={saving}>
                Save
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMessage('');
                  setError('');
                  setTimeout(() => setIsEditing(true), 0);
                }}
              >
                Edit
              </Button>
            </>
          )}
        </div>
      )}
    >
      {isEditing ? (
        <form id="profile-modal-form" onSubmit={onSubmit} className="space-y-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Avatar</label>
            <div className="flex items-center gap-3">
              {currentAvatar ? (
                <img
                  src={currentAvatar}
                  alt="Avatar preview"
                  className="h-14 w-14 rounded-full border border-gray-200 object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary-500 text-lg font-bold text-white">
                  {initial}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onAvatarFileChange}
                  />
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setAvatarSource(null);
                    setAvatarPreview(null);
                    setAvatarDirty(true);
                    setForm((prev) => ({ ...prev, avatar_data: null }));
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>

            {avatarSource ? (
              <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
                <div className="mx-auto h-36 w-36 rounded-full border border-gray-300 bg-gray-100 bg-cover bg-no-repeat" style={{
                  backgroundImage: `url(${avatarSource})`,
                  backgroundPosition: `${cropX}% ${cropY}%`,
                  backgroundSize: `${Math.round(cropZoom * 100)}%`,
                }} />
                <div className="mt-3 space-y-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Zoom ({cropZoom.toFixed(2)}x)
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.05"
                    value={cropZoom}
                    onChange={(e) => {
                      setCropZoom(Number(e.target.value));
                      setAvatarDirty(true);
                    }}
                    className="w-full"
                  />

                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Horizontal Position
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={cropX}
                    onChange={(e) => {
                      setCropX(Number(e.target.value));
                      setAvatarDirty(true);
                    }}
                    className="w-full"
                  />

                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Vertical Position
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={cropY}
                    onChange={(e) => {
                      setCropY(Number(e.target.value));
                      setAvatarDirty(true);
                    }}
                    className="w-full"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Full Name</label>
            <input
              value={form.full_name}
              onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Your full name"
              spellCheck={false}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="you@company.com"
              spellCheck={false}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Shift</label>
            <select
              value={form.shift_type}
              onChange={(e) => setForm((prev) => ({ ...prev, shift_type: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="AM">AM Shift</option>
              <option value="PM">PM Shift</option>
              <option value="GY">GY Shift</option>
            </select>
          </div>

          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </form>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Avatar</p>
            <div className="mt-2">
              {currentAvatar ? (
                <img
                  src={currentAvatar}
                  alt="Profile avatar"
                  className="h-14 w-14 rounded-full border border-gray-200 object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary-500 text-lg font-bold text-white">
                  {initial}
                </div>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Full Name</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{form.full_name || 'N/A'}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Email</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{form.email || 'N/A'}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Shift</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{form.shift_type || 'N/A'}</p>
          </div>
          {message ? <p className="text-xs text-emerald-600">{message}</p> : null}
        </div>
      )}
    </Modal>
  );
}
