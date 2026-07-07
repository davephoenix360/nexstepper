import type { ResumeData } from './resume-data';

/**
 * Empty `ResumeData` — used as the default when creating a new master resume.
 * All sections present with empty defaults so the form doesn't have to
 * special-case missing keys.
 */
export function blankResumeData(): ResumeData {
  return {
    sections: {
      basics: {
        name: '',
        label: '',
        email: '',
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
        profiles: []
      },
      work: [],
      education: [],
      projects: [],
      skills: [],
      volunteer: [],
      awards: [],
      certificates: [],
      publications: [],
      languages: [],
      interests: [],
      references: []
    },
    name: 'Untitled resume',
    note: '',
    status: 'draft',
    template: 'classic',
    jobContext: null
  };
}

/**
 * Sample resume data — useful for onboarding screenshots, dev fixtures,
 * and as a "load demo" affordance. Adapted from the JSON Resume sample.
 */
export const sampleResumeData: ResumeData = {
  sections: {
    basics: {
      name: 'Richard Hendriks',
      label: 'Programmer',
      email: 'rhendriks@mail.com',
      phone: '(912) 555-4321',
      url: 'http://richardhendricks.example.com',
      summary:
        'Richard hails from Tulsa. He has earned degrees from the University of Oklahoma and Stanford. (Open Source Tools for Numerical Data Curation).',
      location: {
        address: '2712 Broadway St',
        postalCode: 'CA 94115',
        city: 'San Francisco',
        countryCode: 'US',
        region: 'California'
      },
      profiles: [
        {
          network: 'Twitter',
          username: 'rhendriks',
          url: 'https://twitter.com/rhendriks'
        }
      ]
    },
    work: [
      {
        company: 'Pied Piper',
        location: 'Palo Alto, CA',
        url: 'http://piedpiper.example.com',
        description: 'Pied Piper is a multi-platform technology based on a proprietary universal compression algorithm.',
        positions: [
          {
            title: 'CEO / Super Coder',
            startDate: '2013-12-01',
            endDate: '2014-12-01',
            highlights: [
              'Built an algorithm that compresses data so efficiently it triggered a lawsuit from Big Content.'
            ]
          }
        ]
      }
    ],
    education: [
      {
        institution: 'University of Oklahoma',
        url: 'http://ou.example.com',
        location: 'Norman, OK',
        degree: {
          degreeLevel: 'Bachelor',
          majors: ['Computer Science'],
          minors: ['Mathematics']
        },
        startDate: '2011-06-01',
        endDate: '2014-01-01',
        gpa: '4.0',
        courses: ['DB', 'AI', 'Algorithms']
      }
    ],
    projects: [],
    skills: [
      {
        name: 'Web Development',
        level: 'Master',
        keywords: ['HTML', 'CSS', 'Javascript']
      },
      {
        name: 'Compression',
        level: 'Master',
        keywords: ['MPEG', 'WebM', 'ffmpeg']
      }
    ],
    volunteer: [],
    awards: [],
    certificates: [],
    publications: [],
    languages: [
      { language: 'English', fluency: 'Native' },
      { language: 'Spanish', fluency: 'Conversational' }
    ],
    interests: [],
    references: []
  },
  name: 'Richard Hendriks — Software Engineer',
  note: 'Demo resume. Replace with your own.',
  status: 'completed',
  template: 'classic',
  jobContext: null
};