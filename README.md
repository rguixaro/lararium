# <img src="public/favicon.svg" alt="Kinship" height="28"> Kinship

A bilingual (English / Urdu) web application to build, visualize, and share family
trees in a collaborative and intuitive way.

## Tech Stack

[Next.js 16](https://nextjs.org) | [Auth.js v5](https://authjs.dev/) |
[Prisma](https://prisma.io) | [MongoDB](https://www.mongodb.com/) |
[TypeScript](https://www.typescriptlang.org/) |
[Tailwind CSS](https://tailwindcss.com) | [Radix UI](https://radix-ui.com) |
[AWS S3](https://aws.amazon.com/s3/),
[CloudFront](https://aws.amazon.com/cloudfront/) &
[SES](https://aws.amazon.com/ses/) | [Sentry](https://sentry.io) |
[Lucide Icons](https://lucide.dev)

## Features

- **Family tree management**: create, edit, and visualize family trees with an
  interactive graph powered by React Flow and a generation-aware layout
- **Collaborative access**: invite members with role-based permissions (admin,
  editor, viewer)
- **Photo gallery**: upload photos, tag family members, and set profile pictures
  with automatic EXIF metadata extraction (dates, GPS, camera info)
- **Insights**: upcoming birthdays, death anniversaries, and weekly memory
  highlights
- **Activity timeline**: chronological feed of all tree changes (members added,
  relationships created, photos uploaded)
- **Weekly newsletter**: automated emails with upcoming milestones and recent
  tree activity via AWS SES
- **i18n**: English and Urdu, including right-to-left (RTL) layout
- **Auth**: Google OAuth via Auth.js

## Getting Started

<details>
<summary>Prerequisites and setup</summary>

### Prerequisites

- Node.js 20+
- MongoDB instance
- AWS account (S3, CloudFront, SES, Secrets Manager)
- Google OAuth 2.0 credentials

### Setup

1. Clone the repository and install dependencies:

   ```bash
   git clone <repository-url>
   cd lararium
   pnpm install
   ```

2. Copy the environment template and fill in your values:

   ```bash
   cp .env.template .env
   ```

   See [`.env.template`](.env.template) for all required variables.

3. Generate the Prisma client and sync the database schema:

   ```bash
   pnpm db:generate
   pnpm db:push
   ```

4. Start the development server:

   ```bash
   pnpm dev
   ```

</details>

## Localization

The app supports English (`en`) and Urdu (`ur`) with Urdu as the default locale.
Set `NEXT_PUBLIC_DEFAULT_LOCALE` to `en` to change the default. A dedicated Urdu
host can be configured with `NEXT_PUBLIC_UR_HOST`.

## Testing

Unit and server tests run automatically on every push and PR to `main`/`stage`
via [GitHub Actions](.github/workflows/test.yml).

```bash
pnpm test              # unit & server tests (Vitest)
pnpm test:coverage     # tests + coverage report (HTML in coverage/)
pnpm test:watch        # watch mode
```

## Acknowledgements

Kinship is based on [Lararium](https://github.com/rguixaro/lararium) by
[Ricard Guixaró](https://rguixaro.dev). The original project and this derivative
are distributed under the GNU General Public License v3.0.

## License

[GPL-3.0](./LICENSE)
