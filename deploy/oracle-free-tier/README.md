# Oracle Free Tier Deployment (Minimal Effort)

This project can run on a single Oracle Ubuntu VM with one deploy command.

## 1) Create VM + Open Port

1. Create an Oracle Always Free Ubuntu instance.
2. In VCN Security List/NSG, allow inbound:
   - `22/tcp` (SSH)
   - `3000/tcp` (TaskFlow app)

## 2) SSH And Run Deploy

```bash
ssh -i <your-key>.pem ubuntu@<public-ip>
git clone <your-repo-url> TaskFlow
cd TaskFlow
bash deploy/oracle-free-tier/deploy.sh http://<public-ip>:3000
```

If you omit the URL argument, the script auto-detects the VM public IP and uses `http://<ip>:3000`.

## 3) Verify

```bash
sudo systemctl status taskflow
journalctl -u taskflow -n 100 --no-pager
```

Open: `http://<public-ip>:3000`

## Notes

- The script:
  - installs Node.js 20+
  - runs `npm ci` and `npm run build`
  - prepares `.env` for production
  - generates secure `JWT_SECRET` (if weak/default)
  - creates/starts `taskflow` systemd service
- The backend serves the built frontend (`client/dist`) in production, so one process is enough.
- Re-deploy after updates:

```bash
cd TaskFlow
git pull
bash deploy/oracle-free-tier/deploy.sh http://<public-ip>:3000
```
