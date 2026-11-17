/**
 * EventChoiceModal — Player-facing modal for choice-based narrative events.
 *
 * Listens for galaxy:choiceEvent dispatched by EventEngine during Resolution Phase.
 * Queues events and presents them one at a time. The player must resolve each event
 * before actions can be taken (blocks the Action Phase via overlay).
 *
 * Dispatches galaxy:choiceEventResolved once the player selects a choice.
 *
 * Spec: 045-event-system-spec.md (FR-ES-004)
 */
import { useState, useEffect, useCallback } from 'react';
import './EventChoiceModal.css';
import { useBlockPhaserInput } from '../hooks/useBlockPhaserInput.js';

interface EventChoice {
  label: string;
  preview?: string;
  hint?: string;
}

interface EventModalPayload {
  event: {
    id: string;
    title: string;
    description?: string;
    choices?: EventChoice[];
  };
  factionId?: string;
  resolvedDescription?: string;
  isNoneChoice?: boolean;
}
import { FEATURES } from '../../core/feature-flags.js';

export function EventChoiceModal() {
  if (!FEATURES.EVENT_SYSTEM) return null;

  const [queue,   setQueue]   = useState<EventModalPayload[]>([]); // Array of pending { event, factionId, resolvedDescription, isNoneChoice? }
  const [current, setCurrent] = useState<EventModalPayload | null>(null); // { event, factionId, isNoneChoice? }
  // None-choice events are informational — do not block Phaser input
  useBlockPhaserInput(!!current && !current.isNoneChoice);

  // Receive incoming choice events from EventEngine
  useEffect(() => {
    const handler = (e: Event) => {
      const item = (e as CustomEvent<Partial<EventModalPayload>>).detail ?? {};
      if (!item.event) return;
      setQueue(prev => [...prev, item as EventModalPayload]);
    };
    window.addEventListener('galaxy:choiceEvent', handler);
    return () => window.removeEventListener('galaxy:choiceEvent', handler);
  }, []);

  // Receive non-choice (informational) events from EventEngine
  useEffect(() => {
    const handler = (e: Event) => {
      const item = (e as CustomEvent<Partial<EventModalPayload>>).detail ?? {};
      if (!item.event) return;
      setQueue(prev => [...prev, { ...(item as EventModalPayload), isNoneChoice: true }]);
    };
    window.addEventListener('galaxy:noneChoiceEvent', handler);
    return () => window.removeEventListener('galaxy:noneChoiceEvent', handler);
  }, []);

  // Promote the first queued item into the active modal
  useEffect(() => {
    if (current) return; // already showing one
    setQueue(prev => {
      if (prev.length === 0) return prev;
      const [next, ...rest] = prev;
      setCurrent(next);
      return rest;
    });
  }, [queue, current]);

  const handleSelect = useCallback((choiceIndex: number) => {
    if (!current) return;
    window.dispatchEvent(new CustomEvent('galaxy:choiceEventResolved', {
      detail: {
        eventId:     current.event.id,
        factionId:   current.factionId,
        choiceIndex
      }
    }));
    setCurrent(null);
  }, [current]);

  const handleAcknowledge = useCallback(() => {
    setCurrent(null);
  }, []);

  if (!current) return null;

  const { event, resolvedDescription, isNoneChoice } = current;
  const choices   = event.choices ?? [];
  const displayDescription = resolvedDescription || event.description || '';

  return (
    <div className="ecm-scrim" role="dialog" aria-modal="true" aria-labelledby="ecm-title">
      <div className="ecm-modal">
        <div className="ecm-header">
          <span className={isNoneChoice ? 'ecm-badge ecm-badge--notice' : 'ecm-badge'}>
            {isNoneChoice ? 'NOTICE' : 'EVENT'}
          </span>
          <h2 className="ecm-title" id="ecm-title">{event.title}</h2>
        </div>

        {displayDescription && <p className="ecm-description">{displayDescription}</p>}

        {isNoneChoice ? (
          <div className="ecm-choices">
            <button className="ecm-acknowledge-btn" onClick={handleAcknowledge}>
              Acknowledge
            </button>
          </div>
        ) : (
          <div className="ecm-choices">
            {choices.map((choice, idx) => (
              <button
                key={idx}
                className="ecm-choice-btn"
                onClick={() => handleSelect(idx)}
              >
                <span className="ecm-choice-label">{choice.label}</span>
                {choice.preview && (
                  <span className="ecm-choice-preview">{choice.preview}</span>
                )}
                {choice.hint && (
                  <span className="ecm-choice-hint">{choice.hint}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
