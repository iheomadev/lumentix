'use client';

import React, { useState, useEffect, useCallback } from 'react';

export type ScanResult = {
  success: boolean;
  ticketId?: string;
  attendeeName?: string;
  message: string;
};

export type AttendeePhoto = {
  attendeeId: string;
  attendeeName: string;
  photoUrl: string;
  ticketTier?: string;
};

export interface KioskModeProps {
  eventName: string;
  onScanRequest?: () => void;
  onExitKiosk?: () => void;
  className?: string;
}

/**
 * KioskMode — Full-screen gate staff tablet UI for ticket scanning.
 *
 * Exposes three primary functions via imperative handle / direct calls:
 *   launch_kiosk_mode   — enters full-screen kiosk presentation
 *   display_scan_result — shows a success/failure animation overlay
 *   show_attendee_photo — shows attendee photo for manual verification
 */
export const KioskMode: React.FC<KioskModeProps> = ({
  eventName,
  onScanRequest,
  onExitKiosk,
  className = '',
}) => {
  const [isKioskActive, setIsKioskActive] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [attendeePhoto, setAttendeePhoto] = useState<AttendeePhoto | null>(null);
  const [showPhotoPanel, setShowPhotoPanel] = useState(false);

  // ── launch_kiosk_mode ─────────────────────────────────────────────────────
  const launch_kiosk_mode = useCallback(async () => {
    if (document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        // Fullscreen may be blocked in some browsers/contexts — proceed anyway
      }
    }
    setIsKioskActive(true);
    setScanResult(null);
    setAttendeePhoto(null);
    setShowPhotoPanel(false);
  }, []);

  // ── display_scan_result ───────────────────────────────────────────────────
  const display_scan_result = useCallback(
    (result: ScanResult, autoDismissMs = 3000) => {
      setScanResult(result);
      setShowPhotoPanel(false);
      if (autoDismissMs > 0) {
        setTimeout(() => setScanResult(null), autoDismissMs);
      }
    },
    [],
  );

  // ── show_attendee_photo ───────────────────────────────────────────────────
  const show_attendee_photo = useCallback((photo: AttendeePhoto) => {
    setAttendeePhoto(photo);
    setShowPhotoPanel(true);
    setScanResult(null);
  }, []);

  // Exit kiosk on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isKioskActive) {
        setIsKioskActive(false);
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => undefined);
        }
        onExitKiosk?.();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isKioskActive, onExitKiosk]);

  // ── Idle / Not-active view ────────────────────────────────────────────────
  if (!isKioskActive) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-6 p-10 ${className}`}
        role="main"
        aria-label="Kiosk mode launcher"
      >
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
          {eventName}
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Tap the button below to start gate check-in kiosk mode.
        </p>
        <button
          onClick={launch_kiosk_mode}
          className="rounded-2xl bg-indigo-600 px-10 py-4 text-xl font-semibold text-white shadow-lg transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300"
          aria-label="Launch kiosk mode"
        >
          Launch Kiosk Mode
        </button>
      </div>
    );
  }

  // ── Active Kiosk View ─────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950 text-white"
      role="main"
      aria-label="Gate check-in kiosk"
      aria-live="polite"
    >
      {/* Header */}
      <header className="absolute top-0 w-full flex items-center justify-between px-8 py-4 bg-gray-900/80">
        <span className="text-lg font-semibold tracking-wide">{eventName}</span>
        <button
          onClick={() => {
            setIsKioskActive(false);
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => undefined);
            }
            onExitKiosk?.();
          }}
          className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-700 hover:text-white transition focus:outline-none focus:ring-2 focus:ring-gray-500"
          aria-label="Exit kiosk mode"
        >
          Exit Kiosk
        </button>
      </header>

      {/* Scan result overlay */}
      {scanResult && (
        <div
          role="alert"
          aria-live="assertive"
          className={`absolute inset-0 z-10 flex flex-col items-center justify-center transition-all duration-300 ${
            scanResult.success
              ? 'bg-green-900/95'
              : 'bg-red-900/95'
          }`}
        >
          <div
            className={`text-9xl mb-6 animate-bounce ${
              scanResult.success ? 'text-green-400' : 'text-red-400'
            }`}
            aria-hidden="true"
          >
            {scanResult.success ? '✓' : '✗'}
          </div>
          <p
            className={`text-4xl font-bold mb-4 ${
              scanResult.success ? 'text-green-200' : 'text-red-200'
            }`}
          >
            {scanResult.success ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
          </p>
          {scanResult.attendeeName && (
            <p className="text-2xl text-white/80 mb-2">{scanResult.attendeeName}</p>
          )}
          {scanResult.ticketId && (
            <p className="text-sm text-white/50 font-mono">{scanResult.ticketId}</p>
          )}
          <p className="mt-4 text-lg text-white/70">{scanResult.message}</p>
        </div>
      )}

      {/* Attendee photo verification panel */}
      {showPhotoPanel && attendeePhoto && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900/95"
          role="dialog"
          aria-label="Attendee photo verification"
          aria-modal="true"
        >
          <h2 className="text-3xl font-bold mb-6">Photo Verification</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attendeePhoto.photoUrl}
            alt={`Photo of ${attendeePhoto.attendeeName}`}
            className="w-64 h-64 rounded-2xl object-cover border-4 border-white/30 shadow-2xl mb-6"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>👤</text></svg>';
            }}
          />
          <p className="text-2xl font-semibold mb-1">{attendeePhoto.attendeeName}</p>
          {attendeePhoto.ticketTier && (
            <span className="rounded-full bg-indigo-600 px-4 py-1 text-sm font-medium mb-6">
              {attendeePhoto.ticketTier}
            </span>
          )}
          <div className="flex gap-4">
            <button
              onClick={() => {
                display_scan_result(
                  {
                    success: true,
                    attendeeName: attendeePhoto.attendeeName,
                    message: 'Identity verified by staff',
                  },
                  3000,
                );
                setShowPhotoPanel(false);
              }}
              className="rounded-xl bg-green-600 px-8 py-3 text-lg font-semibold hover:bg-green-500 transition focus:outline-none focus:ring-4 focus:ring-green-400"
              aria-label="Verify attendee and grant access"
            >
              Verify &amp; Allow
            </button>
            <button
              onClick={() => {
                display_scan_result(
                  {
                    success: false,
                    message: 'Identity mismatch — entry denied',
                  },
                  3000,
                );
                setShowPhotoPanel(false);
              }}
              className="rounded-xl bg-red-600 px-8 py-3 text-lg font-semibold hover:bg-red-500 transition focus:outline-none focus:ring-4 focus:ring-red-400"
              aria-label="Deny attendee entry"
            >
              Deny Entry
            </button>
          </div>
        </div>
      )}

      {/* Main scan target area */}
      {!scanResult && !showPhotoPanel && (
        <div className="flex flex-col items-center gap-8">
          <div
            className="flex h-72 w-72 items-center justify-center rounded-3xl border-4 border-dashed border-indigo-400/60 bg-indigo-950/40"
            aria-label="Scan target area"
          >
            <span className="text-8xl" aria-hidden="true">📷</span>
          </div>
          <p className="text-2xl font-medium text-indigo-200">Scan Ticket QR Code</p>
          <button
            onClick={onScanRequest}
            className="rounded-2xl bg-indigo-600 px-12 py-5 text-2xl font-bold shadow-2xl transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-300"
            aria-label="Trigger ticket scan"
          >
            Scan Ticket
          </button>
        </div>
      )}
    </div>
  );
};

export default KioskMode;
