"use client";

import { useEffect, useRef, useState } from "react";

const ERROR = "Tick the box to confirm you understand before continuing";

/**
 * A plain form that POSTs to the server (works without JavaScript). With JavaScript, it also validates
 * in the browser and shows the same error summary pattern as the rest of the site.
 */
export default function AcceptForm(props: { action: string; next: string; serverError: boolean }) {
  const [error, setError] = useState(props.serverError);
  const summaryRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLInputElement>(null);

  // Start keyboard and screen-reader users at the dialog title (or the error, if there is one).
  useEffect(() => {
    if (props.serverError) summaryRef.current?.focus();
    else document.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [props.serverError]);

  useEffect(() => {
    document.title = `${error ? "Error: " : ""}Before you continue | Concordance`;
  }, [error]);

  return (
    <form
      method="post"
      action={props.action}
      noValidate
      className="mt-6"
      onSubmit={(e) => {
        if (!boxRef.current?.checked) {
          e.preventDefault();
          setError(true);
          requestAnimationFrame(() => summaryRef.current?.focus());
        }
      }}
    >
      <input type="hidden" name="next" value={props.next} />

      {error && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          aria-labelledby="ack-error-title"
          className="mb-5 rounded-lg border-2 border-error p-4 focus:outline-none"
        >
          <h2 id="ack-error-title" className="font-semibold text-error">
            There is a problem
          </h2>
          <p className="mt-1">
            <a
              href="#acknowledge"
              onClick={(e) => {
                e.preventDefault();
                boxRef.current?.focus();
              }}
              className="font-medium text-error underline underline-offset-4"
            >
              {ERROR}
            </a>
          </p>
        </div>
      )}

      <div className={error ? "border-l-4 border-error pl-4" : ""}>
        {error && (
          <p id="acknowledge-error" className="mb-2 font-medium text-error">
            <span className="sr-only">Error: </span>
            {ERROR}
          </p>
        )}
        <label htmlFor="acknowledge" className="flex cursor-pointer items-start gap-3">
          <input
            ref={boxRef}
            id="acknowledge"
            name="acknowledge"
            type="checkbox"
            value="yes"
            aria-describedby={error ? "acknowledge-error" : undefined}
            onChange={(e) => e.target.checked && setError(false)}
            className="mt-0.5 size-6 shrink-0 cursor-pointer accent-[var(--primary)]"
          />
          <span className="leading-relaxed">
            I understand that Concordance is for educational purposes only and is not medical advice.
          </span>
        </label>
      </div>

      <button type="submit" className="btn-primary mt-6 w-full">
        Accept and continue
      </button>
      <p className="mt-4 text-sm text-muted">
        This is remembered on this device for 30 days with one cookie that doesn&apos;t track you. If you don&apos;t
        accept, you can close this page.
      </p>
    </form>
  );
}
