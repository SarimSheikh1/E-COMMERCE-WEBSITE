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

Online payment integrations require official merchant credentials and remain disabled until configured. COD fulfillment and cash collection must be tracked independently.
