// @vitest-environment jsdom
/**
 * Interaction tests for Jake's header profile rows.
 *
 * This is the regression that motivated the whole `tests/interaction/`
 * directory. The remove button rendered perfectly — `data-testid`
 * and all — and did nothing when clicked, because each row's button
 * called `useFieldArray` for itself and the resulting competing
 * subscriptions clobbered RHF's `_fields` state. `remove(i)` then
 * unset the row's values without shrinking the array, which a user
 * sees as "the handle cleared but the field stayed".
 *
 * Every assertion in `tests/unit/jake-template.test.tsx` passed
 * against that broken implementation, because none of them dispatch a
 * click. These do.
 */

import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import * as React from 'react';

import { JakeTemplate } from '@/components/resume-templates/jake';
import type { ResumeData } from '@/lib/resume-schema';
import { formValue, renderWithForm, user, type FormCapture } from './harness';

const PROFILES = [
  { network: 'LinkedIn', username: 'ada', url: '' },
  { network: 'GitHub', username: 'ada-codes', url: '' }
];

/** Minimal resume — only `basics` matters for these assertions. */
function fixture(profiles = PROFILES): ResumeData {
  return {
    sections: {
      basics: {
        name: 'Ada Lovelace',
        label: 'Engineer',
        email: 'ada@example.com',
        phone: '',
        url: '',
        summary: '',
        location: {
          address: '',
          postalCode: '',
          city: '',
          countryCode: '',
          region: ''
        },
        profiles
      },
      work: [],
      volunteer: [],
      education: [],
      skills: [],
      projects: [],
      awards: [],
      certificates: [],
      publications: [],
      languages: [],
      interests: [],
      references: []
    }
  } as unknown as ResumeData;
}

function mount(data: ResumeData) {
  return renderWithForm(data, <JakeTemplate data={data} editable />);
}

const profiles = (c: FormCapture) => {
  const v = formValue(c, 'sections.basics.profiles');
  return Array.isArray(v) ? (v as Array<Record<string, string>>) : [];
};

describe('Jake — profile rows: add', () => {
  it('appends an editable row with both network and username fields', async () => {
    const userSession = user();
    const { form } = mount(fixture());

    expect(profiles(form)).toHaveLength(2);

    await userSession.click(screen.getByTestId('add-profile-2'));

    expect(screen.queryAllByTestId('jake-profile-row-2')).toHaveLength(1);
    // Both fields must exist — a blank network matches neither the
    // LinkedIn nor the GitHub rendering, so without a network field
    // the new row would have nothing to type into.
    expect(
      screen.queryAllByTestId(
        'editable-sections.basics.profiles.2.network'
      )
    ).toHaveLength(1);
    expect(
      screen.queryAllByTestId(
        'editable-sections.basics.profiles.2.username'
      )
    ).toHaveLength(1);
    expect(profiles(form)).toHaveLength(3);
  });
});

describe('Jake — profile rows: remove', () => {
  it('removes the clicked row and shrinks the array', async () => {
    const userSession = user();
    const { form } = mount(fixture());

    await userSession.click(screen.getByTestId('remove-profile-0'));

    // DOM half.
    expect(screen.queryAllByTestId('jake-profile-row-0')).toHaveLength(1);
    expect(screen.queryAllByTestId('jake-profile-row-1')).toHaveLength(0);
    // Form half — the one the old implementation failed. A remove
    // that cleared values but left the row standing passes the DOM
    // check above only if the row count also shrinks; assert the array
    // directly so there is no ambiguity.
    expect(profiles(form)).toHaveLength(1);
    expect(profiles(form)[0].username).toBe('ada-codes');
  });

  it('removes the LAST profile, leaving no row and no cleared-value ghost', async () => {
    const userSession = user();
    const { form } = mount(fixture([PROFILES[0]]));

    await userSession.click(screen.getByTestId('remove-profile-0'));

    expect(profiles(form)).toHaveLength(0);
    // The specific old symptom: a row still on screen whose values
    // had been emptied.
    expect(screen.queryAllByTestId(/^jake-profile-row-/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/profiles\.\d+\.username/)).toHaveLength(0);
  });

  it('removes every profile in sequence without leaking rows', async () => {
    const userSession = user();
    const { form } = mount(
      fixture([
        PROFILES[0],
        PROFILES[1],
        { network: '', username: '', url: '' }
      ])
    );

    expect(profiles(form)).toHaveLength(3);
    await userSession.click(screen.getByTestId('remove-profile-0'));
    expect(profiles(form)).toHaveLength(2);
    await userSession.click(screen.getByTestId('remove-profile-0'));
    expect(profiles(form)).toHaveLength(1);
    await userSession.click(screen.getByTestId('remove-profile-0'));

    expect(profiles(form)).toHaveLength(0);
    expect(screen.queryAllByTestId(/^jake-profile-row-/)).toHaveLength(0);
    // The add button stays available to add a fresh one.
    expect(screen.queryAllByTestId('add-profile-0')).toHaveLength(1);
  });
});

describe('Jake — profile rows: add then remove round-trips', () => {
  it('restores the original profile list', async () => {
    const userSession = user();
    const { form } = mount(fixture());

    await userSession.click(screen.getByTestId('add-profile-2'));
    expect(profiles(form)).toHaveLength(3);

    await userSession.click(screen.getByTestId('remove-profile-2'));

    expect(profiles(form)).toHaveLength(2);
    expect(profiles(form)[0].username).toBe('ada');
    expect(profiles(form)[1].username).toBe('ada-codes');
  });
});