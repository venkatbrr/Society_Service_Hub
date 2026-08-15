export type LegalBlock =
  | { kind: 'para'; text: string } // supports **bold** and [text](url)
  | { kind: 'bullets'; items: string[] }
  | { kind: 'table'; head: [string, string]; rows: [string, string][] }
  | { kind: 'subheading'; text: string }
  | { kind: 'callout'; text: string };

export type LegalSection = {
  number: number;
  heading: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  id: 'terms' | 'privacy';
  title: string;
  lastUpdated: string; // e.g. '8 August 2026'
  intro: LegalBlock[];
  sections: LegalSection[];
};

export const LEGAL_ENTITY = {
  name: 'Wooru Technologies',
  email: 'thewooru@gmail.com',
  grievanceOfficer: 'Proprietor, Wooru',
  jurisdiction: 'Hyderabad',
  liabilityCap: '₹5,000',
};

export const TERMS: LegalDocument = {
  id: 'terms',
  title: 'Terms of Service',
  lastUpdated: '15 August 2026',
  intro: [
    {
      kind: 'para',
      text: `These terms govern your use of Wooru, operated by **${LEGAL_ENTITY.name}**. By creating an account or using the app, you agree to them. If you do not agree, please do not use Wooru.`,
    },
  ],
  sections: [
    {
      number: 1,
      heading: 'What Wooru is',
      blocks: [
        {
          kind: 'para',
          text: 'Wooru is a coordination tool for residents of gated residential communities. It lets neighbours share information about domestic service providers, schedule visits, track community funds, sell to and buy from each other, and arrange shared rides.',
        },
        {
          kind: 'para',
          text: '**Wooru is a platform, not a party to what happens on it.** We do not employ service providers, sell goods, handle payments, or take part in arrangements between residents.',
        },
      ],
    },
    {
      number: 2,
      heading: 'Eligibility and accounts',
      blocks: [
        {
          kind: 'bullets',
          items: [
            'You must be at least 18 years old.',
            'You must give accurate information, including your real name and flat number, so neighbours can identify you.',
            'You are responsible for activity on your account and for keeping your credentials secure.',
            'One account per person.',
          ],
        },
      ],
    },
    {
      number: 3,
      heading: 'Joining a community',
      blocks: [
        {
          kind: 'para',
          text: "You join a community using a code from an existing member. New communities are created only after review by us. Membership can be revoked by your community's president or vice-president, or by us, if you break these terms.",
        },
        {
          kind: 'para',
          text: 'Content you post is visible to other members of your community, and to partner communities where sharing has been enabled. Treat it as shared with your neighbours, not as private.',
        },
      ],
    },
    {
      number: 4,
      heading: 'Service provider listings',
      blocks: [
        {
          kind: 'para',
          text: 'Residents may add entries for domestic workers, tradespeople and other providers.',
        },
        {
          kind: 'bullets',
          items: [
            '**We do not verify, vet, screen, employ or endorse any provider.** Badges such as "verified" or "trending" reflect activity within the app, not a background check.',
            'Ratings and reviews are the personal opinions of the residents who wrote them.',
            'Only add contact details you are entitled to share, and tell the person you have listed them.',
            'You are solely responsible for deciding whether to engage a provider, and on what terms.',
          ],
        },
      ],
    },
    {
      number: 5,
      heading: 'Transactions between residents',
      blocks: [
        {
          kind: 'para',
          text: 'Wooru lets residents run small businesses, offer food pre-orders and share rides. In every case, the arrangement is **directly between the residents involved**.',
        },
        {
          kind: 'bullets',
          items: [
            'Wooru does not process payments. Money changes hands outside the app.',
            'Wooru does not guarantee quality, safety, legality, food hygiene, delivery or refunds.',
            'Disputes are for the parties to resolve. We may remove content but will not adjudicate.',
            'If you sell food or goods, you are responsible for any licences, food-safety rules and taxes that apply to you.',
          ],
        },
      ],
    },
    {
      number: 6,
      heading: 'Carpooling',
      blocks: [
        {
          kind: 'para',
          text: 'Carpool posts are informal arrangements between neighbours. Wooru is not a transport provider. We do not verify driving licences, vehicle condition, insurance or fitness to drive. Any cost sharing is agreed directly between riders and drivers, and you take part at your own risk.',
        },
      ],
    },
    {
      number: 7,
      heading: 'Community funds',
      blocks: [
        {
          kind: 'para',
          text: 'Where a community enables funds, Wooru provides a **record-keeping tool only**. We never receive, hold or transfer money. Contributions and expenses are entered by that fund\'s treasurer and collectors, who are appointed within your community and are accountable to it. Accuracy of those records is the community\'s responsibility.',
        },
      ],
    },
    {
      number: 8,
      heading: 'Acceptable use',
      blocks: [
        {
          kind: 'para',
          text: 'You must not:',
        },
        {
          kind: 'bullets',
          items: [
            'Post false, misleading, defamatory, harassing, obscene or discriminatory content',
            "Post another person's contact details without a proper basis for doing so",
            "Write or solicit fake ratings, or manipulate a provider's reputation",
            'Use Wooru for spam, advertising unrelated to your community, or any unlawful purpose',
            "Attempt to access another community's data, probe our security, or interfere with the service",
            'Scrape, bulk-export or resell data from the app',
          ],
        },
        {
          kind: 'para',
          text: 'We run automated checks for fraudulent providers and reviews, and act on reports from residents.',
        },
      ],
    },
    {
      number: 9,
      heading: 'Your content',
      blocks: [
        {
          kind: 'para',
          text: 'You keep ownership of what you post. You grant us a non-exclusive, royalty-free licence to store, display and distribute it as needed to operate Wooru for your community.',
        },
        {
          kind: 'para',
          text: "You are responsible for having the right to post what you post, including images and other people's contact details.",
        },
      ],
    },
    {
      number: 10,
      heading: 'Moderation and removal',
      blocks: [
        {
          kind: 'para',
          text: "We and your community's president or vice-president may remove content or suspend accounts that breach these terms. Where practical we will explain why, but we may act immediately in cases of safety, abuse or legal risk.",
        },
      ],
    },
    {
      number: 11,
      heading: 'Availability',
      blocks: [
        {
          kind: 'para',
          text: 'Wooru is provided as is. We do not promise uninterrupted or error-free service, and we may change, suspend or discontinue features. We rely on third-party providers for hosting, authentication, image storage and notifications, and their outages will affect the app.',
        },
      ],
    },
    {
      number: 12,
      heading: 'Disclaimers and liability',
      blocks: [
        {
          kind: 'para',
          text: 'To the maximum extent permitted by law:',
        },
        {
          kind: 'bullets',
          items: [
            'Wooru is provided without warranties of any kind, express or implied.',
            'We are not liable for the conduct of any service provider, resident, buyer, seller, driver or passenger.',
            'We are not liable for indirect, incidental or consequential loss, or for loss of data, profits or goodwill.',
            `Our total liability for any claim relating to Wooru is limited to **${LEGAL_ENTITY.liabilityCap}**.`,
          ],
        },
        {
          kind: 'para',
          text: 'Nothing here excludes liability that cannot be excluded under Indian law.',
        },
      ],
    },
    {
      number: 13,
      heading: 'Indemnity',
      blocks: [
        {
          kind: 'para',
          text: 'You agree to indemnify us against claims arising from your content, your use of Wooru, or your breach of these terms or of another person\'s rights.',
        },
      ],
    },
    {
      number: 14,
      heading: 'Ending your use',
      blocks: [
        {
          kind: 'para',
          text: 'You may stop using Wooru and request deletion of your account at any time — see our [Privacy Policy](/privacy). We may suspend or terminate accounts that breach these terms. Community records that others rely on, such as fund transactions, may be retained as described in that policy.',
        },
      ],
    },
    {
      number: 15,
      heading: 'Governing law',
      blocks: [
        {
          kind: 'para',
          text: `These terms are governed by the laws of India. Courts at **${LEGAL_ENTITY.jurisdiction}** have exclusive jurisdiction.`,
        },
      ],
    },
    {
      number: 16,
      heading: 'Changes',
      blocks: [
        {
          kind: 'para',
          text: 'We may update these terms and will revise the date above. Continuing to use Wooru after a change means you accept it.',
        },
      ],
    },
    {
      number: 17,
      heading: 'Contact',
      blocks: [
        {
          kind: 'para',
          text: `Questions or support: [${LEGAL_ENTITY.email}](mailto:${LEGAL_ENTITY.email})`,
        },
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  id: 'privacy',
  title: 'Privacy Policy',
  lastUpdated: '15 August 2026',
  intro: [
    {
      kind: 'para',
      text: 'Wooru is an application for residents of gated residential communities. It helps neighbours find and rate domestic service providers, coordinate visits, run community funds, buy from neighbours, and share rides.',
    },
    {
      kind: 'para',
      text: "This policy explains what personal data Wooru collects, why, who can see it, and what rights you have over it. It is written to meet the requirements of India's **Digital Personal Data Protection Act, 2023 (DPDP Act)**.",
    },
    {
      kind: 'para',
      text: `In this policy, "we" and "Wooru" mean **${LEGAL_ENTITY.name}**, the Data Fiduciary responsible for your data.`,
    },
  ],
  sections: [
    {
      number: 1,
      heading: 'Data we collect',
      blocks: [
        {
          kind: 'subheading',
          text: 'Account and identity',
        },
        {
          kind: 'bullets',
          items: [
            'Your **name**, **email address** and **phone number**',
            'Your **profile photo**, if you upload one',
            'Your **flat or house number** and, where your community uses them, your **block**',
            'Which **community** you belong to, and your **role** in it (resident, president, vice-president, or platform administrator)',
          ],
        },
        {
          kind: 'para',
          text: 'You provide this when you sign up or join a community. If you sign in with Google, we receive your name, email address and profile picture from your Google account.',
        },
        {
          kind: 'subheading',
          text: 'Content you create',
        },
        {
          kind: 'table',
          head: ['What', 'Includes'],
          rows: [
            ['Service provider entries', 'Provider name, phone number, category, description, working area, and category-specific details such as timings or charges'],
            ['Ratings and reviews', 'Star rating and written review text'],
            ['Reports', 'Reason and details when you report a provider or listing'],
            ['Private notes', 'Personal notes you keep about a provider — visible only to you'],
            ['Favourites', 'Providers you have saved'],
            ['Visits', 'Service visits you schedule or join'],
            ['Business listings', 'Business name, description, contact phone, product details and images'],
            ['Orders and pre-orders', 'Items ordered, quantities, amounts, your note and contact phone'],
            ['Carpool posts', 'Start and end points, departure and return times, vehicle details, seats, price and contact phone'],
            ['Personal reminders', 'Service names, notes, due dates and any receipt images you attach'],
            ['Community funds', 'Contributions and expenses recorded against a fund, where your community has funds enabled'],
          ],
        },
        {
          kind: 'subheading',
          text: 'Technical data',
        },
        {
          kind: 'bullets',
          items: [
            'A **push notification token** for your device, so we can send you alerts',
            'A record of **notifications** sent to you',
            '**Images** you upload, stored with our image hosting provider',
            'Standard **server logs** generated by our hosting and database providers, including IP address and timestamps',
          ],
        },
        {
          kind: 'para',
          text: 'Wooru does not use advertising trackers, and does not sell personal data.',
        },
      ],
    },
    {
      number: 2,
      heading: 'Why we use it',
      blocks: [
        {
          kind: 'bullets',
          items: [
            'To operate the service and show you your community\'s content',
            'To let neighbours identify each other and contact service providers',
            'To send notifications you have asked for, such as visit reminders and order updates',
            'To detect fraudulent or abusive activity, including automated checks on new providers and reviews',
            'To respond to reports and enforce our Terms',
            'To keep records your community needs, such as fund transactions',
          ],
        },
      ],
    },
    {
      number: 3,
      heading: 'Who can see your data',
      blocks: [
        {
          kind: 'para',
          text: 'Wooru is **multi-tenant**. Each community is isolated, and this is enforced by the database itself, not only by the app.',
        },
        {
          kind: 'table',
          head: ['Data', 'Visible to'],
          rows: [
            ['Your name, flat number, profile photo', 'Members of your community'],
            ['Your phone number', "Your community's president or vice-president, and platform administrators. Not other residents."],
            ['Provider entries and ratings', 'Members of your community, and partner communities where sharing has been enabled'],
            ['Business listings, drops, carpools', 'Members of your community'],
            ['Your private notes, favourites and reminders', 'Only you'],
            ['Fund transactions', "Members of your community; managed by that fund's treasurer and collectors"],
            ['Everything', 'Platform administrators, for support, moderation and safety'],
          ],
        },
        {
          kind: 'para',
          text: 'If you post a contact phone number on a listing or carpool, other members of your community can see it. Please only publish contact details you are willing to share.',
        },
      ],
    },
    {
      number: 4,
      heading: 'Service providers we do not control',
      blocks: [
        {
          kind: 'para',
          text: 'Wooru lets residents add entries for domestic workers, tradespeople and other service providers. **Those individuals are usually not Wooru users and have not signed up.** If you add someone, you are sharing their name, phone number and working details with your community.',
        },
        {
          kind: 'para',
          text: 'Only add details you are entitled to share, and tell the person you have listed them. If a listed provider wants their details corrected or removed, they can contact us using the details in section 10 and we will act on it.',
        },
      ],
    },
    {
      number: 5,
      heading: 'Where your data is stored',
      blocks: [
        {
          kind: 'para',
          text: 'Your data is stored on servers operated by our hosting providers in the **Asia Pacific (Tokyo, Japan)** region. It is therefore processed outside India. The DPDP Act permits such transfers except to countries restricted by the Central Government.',
        },
      ],
    },
    {
      number: 6,
      heading: 'Processors we use',
      blocks: [
        {
          kind: 'table',
          head: ['Provider', 'Purpose'],
          rows: [
            ['Supabase', 'Database and authentication'],
            ['Cloudinary', 'Image storage and delivery'],
            ['Google', 'Sign-in with Google (optional)'],
            ['Vercel', 'Web hosting and content delivery'],
            ['Expo', 'Delivery of push notifications'],
          ],
        },
        {
          kind: 'para',
          text: 'Each processes data on our instructions and for no other purpose.',
        },
      ],
    },
    {
      number: 7,
      heading: 'How long we keep it',
      blocks: [
        {
          kind: 'bullets',
          items: [
            '**Account data** — while your account is active',
            '**Community content** — while your community exists, since records such as fund transactions must remain auditable for other members',
            '**Notifications and logs** — for a limited operational period',
          ],
        },
        {
          kind: 'para',
          text: 'When you ask us to delete your account, we erase your personal data. Content that belongs to the community record — for example a fund transaction others rely on — may be retained in anonymised form.',
        },
      ],
    },
    {
      number: 8,
      heading: 'Security',
      blocks: [
        {
          kind: 'para',
          text: 'Access is enforced at the database level by row-level security, so a request for another community\'s data returns nothing regardless of the app. Traffic is encrypted in transit. Passwords are stored hashed by our authentication provider, and you may sign in with Google instead of setting one.',
        },
        {
          kind: 'para',
          text: 'No system is perfectly secure. If a breach affecting your data occurs, we will notify you and the Data Protection Board of India as the DPDP Act requires.',
        },
      ],
    },
    {
      number: 9,
      heading: 'Your rights',
      blocks: [
        {
          kind: 'para',
          text: 'Under the DPDP Act you may:',
        },
        {
          kind: 'bullets',
          items: [
            '**Access** a summary of the personal data we hold about you and how it is processed',
            '**Correct** data that is inaccurate, and complete data that is incomplete',
            '**Erase** your personal data, unless we must keep it by law',
            '**Nominate** another person to exercise these rights if you die or become incapacitated',
            '**Complain** to us, and escalate to the Data Protection Board of India if unsatisfied',
          ],
        },
        {
          kind: 'para',
          text: 'Some of this you can do yourself in the app — edit your profile, delete your own posts, or leave a community. For anything else, contact us below.',
        },
      ],
    },
    {
      number: 10,
      heading: 'Contact and grievance redressal',
      blocks: [
        {
          kind: 'para',
          text: 'For any privacy question or to exercise a right above:',
        },
        {
          kind: 'bullets',
          items: [
            `**Email:** [${LEGAL_ENTITY.email}](mailto:${LEGAL_ENTITY.email})`,
            `**Grievance Officer:** ${LEGAL_ENTITY.grievanceOfficer}`,
          ],
        },
        {
          kind: 'para',
          text: 'We aim to respond within 30 days. If you are not satisfied, you may complain to the Data Protection Board of India.',
        },
      ],
    },
    {
      number: 11,
      heading: 'Children',
      blocks: [
        {
          kind: 'para',
          text: 'Wooru is intended for adults. We do not knowingly collect data from anyone under 18 without verifiable parental consent, as required by the DPDP Act. If you believe a child\'s data has been provided, contact us and we will remove it.',
        },
      ],
    },
    {
      number: 12,
      heading: 'Changes',
      blocks: [
        {
          kind: 'para',
          text: 'We will update this page when our practices change and revise the date at the top. Significant changes will be notified in the app.',
        },
      ],
    },
  ],
};
