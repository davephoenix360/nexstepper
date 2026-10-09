'use client';

/**
 * Cookie consent banner (added 2026-10-08).
 *
 * Built on the repo's existing shadcn primitives (Card, Button, Switch,
 * Dialog) rather than dropping in a third-party registry block — the
 * registry build wanted to overwrite `button.tsx` and pull in an
 * unexpected dependency, and this keeps the banner inside the design
 * system the rest of the app already uses.
 *
 * UX rules it follows (the things that separate a consent banner that
 * gets accepted from one that gets dismissed):
 *  - Equal visual weight for "Accept all" and "Essential only".
 *    Dark-pattern banners make declining harder on purpose; this one
 *    doesn't.
 *  - Never blocks the page. Fixed to the bottom corner, dismissible,
 *    never a full-screen takeover.
 *  - Granular control is one click away ("Customise"), not hidden.
 *  - Links straight to the cookie policy for the full picture.
 */
import { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, Cookie } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';

import { useConsent } from './consent-provider';
import {
  CONSENT_CATEGORIES,
  CONSENT_CATEGORY_COPY,
  ESSENTIAL_CATEGORIES,
  type ConsentCategory
} from '@/lib/consent';

const OPTIONAL_CATEGORIES = CONSENT_CATEGORIES.filter(
  (category) => !ESSENTIAL_CATEGORIES.includes(category)
);

function isEssential(category: ConsentCategory): boolean {
  return ESSENTIAL_CATEGORIES.includes(category);
}

export function CookieConsentBanner() {
  const { consent, needsDecision, grantAll, grantEssentialOnly, save } =
    useConsent();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [draft, setDraft] = useState(consent);

  if (!needsDecision) return null;

  const closePreferences = () => setPreferencesOpen(false);

  const savePreferences = () => {
    save(draft);
    closePreferences();
  };

  return (
    <>
      <Card
        role="region"
        aria-label="Cookie consent"
        data-testid="cookie-consent-banner"
        className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-3xl shadow-lg sm:inset-x-auto sm:right-6"
      >
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-6">
          <div className="flex gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Cookie className="size-5" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <p className="font-semibold">Cookies, minus the mystery</p>
              <p className="text-sm text-muted-foreground">
                We use one cookie to keep you signed in, and — only if you
                say yes — PostHog to see which features people actually
                use. Read the{' '}
                <Link
                  href="/cookies"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  cookie policy
                </Link>
                .
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={grantAll}
              data-testid="consent-accept-all"
              className="sm:w-auto"
            >
              Accept all
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={grantEssentialOnly}
              data-testid="consent-essential-only"
            >
              Essential only
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(consent);
                setPreferencesOpen(true);
              }}
              data-testid="consent-customise"
            >
              Customise
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={preferencesOpen}
        onOpenChange={setPreferencesOpen}
        title="Cookie preferences"
        description="Choose which categories you allow. You can change this at any time from the link in the footer."
        widthClassName="max-w-xl"
      >
        <ul className="space-y-5 py-2">
          {CONSENT_CATEGORIES.map((category) => {
            const copy = CONSENT_CATEGORY_COPY[category];
            const locked = isEssential(category);

            return (
              <li
                key={category}
                className="flex items-start justify-between gap-4"
              >
                <div className="space-y-1">
                  <Label
                    htmlFor={`consent-${category}`}
                    className="flex items-center gap-2"
                  >
                    {locked && (
                      <ShieldCheck
                        className="size-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    {copy.label}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {copy.description}
                  </p>
                </div>
                <Switch
                  id={`consent-${category}`}
                  checked={locked || draft[category]}
                  disabled={locked}
                  onCheckedChange={(checked) =>
                    setDraft((prev) => ({ ...prev, [category]: checked }))
                  }
                  aria-label={copy.label}
                />
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              grantEssentialOnly();
              closePreferences();
            }}
          >
            Reject optional
          </Button>
          <Button
            type="button"
            onClick={savePreferences}
            data-testid="consent-save"
          >
            Save preferences
          </Button>
        </div>
      </Dialog>
    </>
  );
}