import { useEffect, useRef } from 'react';

const LETTERBIRD_SRC = 'https://letterbird.co/embed/v1.js';
const LETTERBIRD_USER = 'anthonyfree';
const CONTAINER_ID = 'letterbird-form';

/**
 * LetterbirdForm — Embeds the Letterbird contact form.
 *
 * A <script> tag rendered via JSX never executes, so the embed script is
 * injected on mount and told to render into this component's container via
 * `data-targetelement`.
 *
 * Once injected, a script can't be cancelled — removing the tag doesn't stop
 * it from appending its iframe. So instead of clean-up-and-reinject (which
 * yields two forms under React StrictMode's double-invoked effect), we inject
 * at most once per container element. A real unmount discards the container,
 * so a later remount gets a fresh one and loads the form again.
 */
export function LetterbirdForm() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || container.querySelector('script')) return;

    const script = document.createElement('script');
    script.src = LETTERBIRD_SRC;
    script.async = true;
    script.dataset.letterbirduser = LETTERBIRD_USER;
    script.dataset.targetelement = CONTAINER_ID;
    container.appendChild(script);
  }, []);

  return <div id={CONTAINER_ID} className="lp-letterbird" ref={containerRef} />;
}
