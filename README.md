# <img src="public/favicon.svg" alt="Roots" height="28"> Roots

A web application to build, visualize, and share family trees in a collaborative
and intuitive way.

**[roots.rguixaro.dev](https://roots.rguixaro.dev)**

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
  interactive graph powered by React Flow and Dagre layout
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
- **i18n**: English, Spanish, and Catalan
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
   git clone https://github.com/rguixaro/lararium.git
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

## Testing

Unit and server tests run automatically on every push and PR to `main`/`stage`
via [GitHub Actions](.github/workflows/test.yml).

```bash
pnpm test              # unit & server tests (Vitest)
pnpm test:coverage     # tests + coverage report (HTML in coverage/)
pnpm test:watch        # watch mode
```

## License

[GPL-3.0](./LICENSE)
