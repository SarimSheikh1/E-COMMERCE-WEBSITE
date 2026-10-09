# VELORA Store

React and TypeScript storefront with an Express and MongoDB backend. Default region is Pakistan and currency is PKR. This project is under active implementation; completed milestones are committed independently.

## Windows setup

Use `npm.cmd` in PowerShell if the execution policy blocks `npm.ps1`.

```powershell
cd velora-store
npm.cmd install
Copy-Item .env.example .env
docker compose up -d
docker compose exec mongo mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
```

Set a private `ADMIN_PASSWORD` in `.env` before administrator bootstrap. Never commit `.env`. MongoDB transactions require a replica set.

```powershell
npm.cmd run bootstrap -w apps/api
npm.cmd run seed -w apps/api
npm.cmd run dev
# Storefront: http://localhost:5173
# Admin: http://localhost:5173/admin/login
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Bootstrap requires a password with at least 12 characters. It refuses to overwrite an existing account or silently promote an existing customer. The administrator can also shop through the customer login. Seeding adds only clearly labeled development products and preserves existing products.

## Deployment

Build with `npm.cmd run build`. Serve `apps/web/dist` through an HTTPS web server with SPA fallback to `index.html`. Reverse-proxy `/api` to the API process; run `node apps/api/dist/server.js`. Set `NODE_ENV=production`, `WEB_ORIGIN` to the exact HTTPS origin, and `MONGODB_URI` to a private replica-set connection. Keep frontend and API same-origin so cookie/CSRF behavior remains consistent. Provision a durable MongoDB replica set, backups, private environment configuration and process monitoring. Bootstrap separately. Review [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) before deployment: this milestone is not production ready.

## Source archive

The repository root contains `VELORA-Store-source.zip` locally. It includes source/configuration/documentation and the dependency lockfile only, excluding secrets, database files, sessions, uploads, dependencies and build outputs. ZIP files are intentionally ignored by Git.

Online payment integrations require official merchant credentials and remain disabled until configured. COD fulfillment and cash collection must be tracked independently.
