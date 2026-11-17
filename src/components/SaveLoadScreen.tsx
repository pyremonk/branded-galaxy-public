/**
 * SaveLoadScreen — 6-slot save / load UI.
 *
 * Props:
 *   mode       — 'save' | 'load'
 *   onClose    — () => void
 *   onLoaded   — (saveData: Object) => void   (load mode only)
 *
 * Slots: 'auto' (Auto-Save, read-only in save mode) + '1'–'5' (manual)
 *
 * Specs: 040-save-game-spec.md, 041-load-game-spec.md
 */
import { useState, useEffect, useCallback } from 'react';
import { dataBridge } from '../../core/data-bridge.js';
import { SaveStateManager } from '../../core/save-state-manager.js';
import './SaveLoadScreen.css';
import { useBlockPhaserInput } from '../hooks/useBlockPhaserInput.js';
import { formatTurnLabel } from '../utils/time-format.js';

const FACTION_LABELS: Record<string, string> = {
  brandAuthority: 'Brand Authority',
  union:          'The Union',
  autoforge:      'Autoforge'
};

function formatTimestamp(ts: any) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

// ── Single slot row ───────────────────────────────────────────────────────────

function SlotRow({
  slot,
  mode,
  onSave,
  onLoad,
  onDelete,
  loading,
  confirmDelete,
  onRequestConfirmDelete,
  onCancelConfirmDelete
}: any) {
  const [editingName, setEditingName] = useState(false);
  const [slotName, setSlotName] = useState('');

  // Start editing name when save is clicked on an empty or existing slot
  const handleSaveClick = () => {
    setEditingName(true);
    setSlotName('');
  };

  const handleSaveConfirm = () => {
    setEditingName(false);
    onSave(slot.slotId, slotName.trim() || null);
  };

  const handleSaveCancel = () => {
    setEditingName(false);
    setSlotName('');
  };

  const isAuto   = slot.slotId === 'auto';
  const isEmpty  = slot.empty;

  return (
    <div className={`sl-slot ${isEmpty ? 'sl-slot--empty' : ''} ${isAuto ? 'sl-slot--auto' : ''}`}>
      <div className="sl-slot__id">
        {isAuto ? 'AUTO' : `Slot ${slot.slotId}`}
      </div>

      <div className="sl-slot__meta">
        {isEmpty ? (
          <span className="sl-slot__empty-label">Empty</span>
        ) : (
          <>
            <span className="sl-slot__name">{slot.slotName ?? '(unnamed)'}</span>
            <span className="sl-slot__faction">{FACTION_LABELS[slot.factionId] ?? slot.factionId}</span>
            {slot.hotSeat && <span className="sl-slot__badge sl-slot__badge--hotseat">Hot Seat</span>}
            <span className="sl-slot__turn">{formatTurnLabel(slot.turn)}</span>
            <span className="sl-slot__time">{formatTimestamp(slot.timestamp)}</span>
          </>
        )}
      </div>

      <div className="sl-slot__actions">
        {/* Save mode — auto slot is not writable */}
        {mode === 'save' && !isAuto && (
          editingName ? (
            <span className="sl-slot__name-edit">
              <input
                className="sl-name-input"
                value={slotName}
                onChange={e => setSlotName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveConfirm(); if (e.key === 'Escape') handleSaveCancel(); }}
                placeholder="Slot name…"
                autoFocus
                maxLength={48}
              />
              <button className="sl-btn sl-btn--confirm" onClick={handleSaveConfirm}>Save</button>
              <button className="sl-btn sl-btn--cancel"  onClick={handleSaveCancel}>Cancel</button>
            </span>
          ) : (
            <button
              className="sl-btn sl-btn--save"
              onClick={handleSaveClick}
              disabled={loading}
            >
              {isEmpty ? 'Save Here' : 'Overwrite'}
            </button>
          )
        )}

        {/* Load mode */}
        {mode === 'load' && !isEmpty && (
          <>
            <button
              className="sl-btn sl-btn--load"
              onClick={() => onLoad(slot.slotId)}
              disabled={loading}
            >
              Load
            </button>
            {confirmDelete === slot.slotId ? (
              <>
                <button
                  className="sl-btn sl-btn--danger"
                  onClick={() => onDelete(slot.slotId)}
                  disabled={loading}
                >
                  Confirm
                </button>
                <button
                  className="sl-btn sl-btn--cancel"
                  onClick={onCancelConfirmDelete}
                  disabled={loading}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                className="sl-btn sl-btn--delete"
                onClick={() => onRequestConfirmDelete(slot.slotId)}
                disabled={loading}
              >
                Delete
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SaveLoadScreen({ mode, onClose, onLoaded }: any) {
  useBlockPhaserInput();
  const [slots,         setSlots]         = useState<any[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [statusMsg,     setStatusMsg]     = useState('');
  const [errorMsg,      setErrorMsg]      = useState('');
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  const refreshSlots = useCallback(async () => {
    const list = await dataBridge.listSaveSlots();
    setSlots(list);
  }, []);

  useEffect(() => { refreshSlots(); }, [refreshSlots]);

  const showStatus = (msg: any) => { setStatusMsg(msg); setErrorMsg(''); };
  const showError  = (msg: any) => { setErrorMsg(msg);  setStatusMsg(''); };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (slotId: any, customName: any) => {
    setLoading(true);
    setErrorMsg('');
    try {
      // Ask Phaser for the save snapshot via event
      const result: any = await new Promise((resolve) => {
        const handler = (e: any) => {
          window.removeEventListener('game:saveGameResult', handler);
          resolve(e.detail);
        };
        window.addEventListener('game:saveGameResult', handler);
        window.dispatchEvent(new CustomEvent('game:saveGame', {
          detail: { slotId, slotName: customName }
        }));
        // Timeout fallback
        setTimeout(() => {
          window.removeEventListener('game:saveGameResult', handler);
          resolve({ success: false, error: 'Save timed out.' });
        }, 5000);
      });

      if (result?.success) {
        showStatus('Game saved.');
        await refreshSlots();
      } else {
        showError(result?.error ?? 'Save failed.');
      }
    } catch (err: any) {
      showError(err.message ?? 'Save failed.');
    } finally {
      setLoading(false);
    }
  }, [refreshSlots]);

  // ── Load ──────────────────────────────────────────────────────────────────
  const handleLoad = useCallback(async (slotId: any) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const saveData = await dataBridge.loadGameState(slotId);
      if (!saveData) {
        showError('Save slot not found. It may have been deleted.');
        return;
      }
      const versionCheck = SaveStateManager.validateVersion(saveData);
      if (!versionCheck.valid) {
        showError(versionCheck.error ?? 'Save data is incompatible.');
        return;
      }
      onLoaded(saveData);
    } catch (err: any) {
      showError(err.message ?? 'Failed to load save.');
    } finally {
      setLoading(false);
    }
  }, [onLoaded]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (slotId: any) => {
    setLoading(true);
    setConfirmDelete(null);
    try {
      const result = await dataBridge.deleteGameState(slotId);
      if (result.success) {
        showStatus('Save deleted.');
        await refreshSlots();
      } else {
        showError(result.error ?? 'Delete failed.');
      }
    } catch (err: any) {
      showError(err.message ?? 'Delete failed.');
    } finally {
      setLoading(false);
    }
  }, [refreshSlots]);

  return (
    <div className="sl-overlay">
      <div className="sl-panel">
        <div className="sl-header">
          <h2 className="sl-title">{mode === 'save' ? 'Save Game' : 'Load Game'}</h2>
          <button className="sl-close" onClick={onClose}>✕</button>
        </div>

        {(statusMsg || errorMsg) && (
          <div className={`sl-message ${errorMsg ? 'sl-message--error' : ''}`}>
            {statusMsg || errorMsg}
          </div>
        )}

        <div className="sl-slots">
          {slots.map(slot => (
            <SlotRow
              key={slot.slotId}
              slot={slot}
              mode={mode}
              onSave={handleSave}
              onLoad={handleLoad}
              onDelete={handleDelete}
              loading={loading}
              confirmDelete={confirmDelete}
              onRequestConfirmDelete={setConfirmDelete}
              onCancelConfirmDelete={() => setConfirmDelete(null)}
            />
          ))}
        </div>

        {loading && <div className="sl-loading">Loading…</div>}
      </div>
    </div>
  );
}
