# dminder Service Monitor

Automated monitoring for external services used by dminder mobile apps.

## Overview

This repository monitors the health and availability of external services that dminder depends on:
- NOAA Ozone Data Services
- Weather APIs (WeatherKit, etc.)
- dminder Backend Services

## Features

- ✅ Automated checks every 15 minutes
- 📊 Historical uptime tracking
- 🚨 Alerts when services are down
- 📈 Response time monitoring
- 🌍 Multi-region checks

## Status Dashboard

View the current status at: https://ontometrics.github.io/dminder-service-monitor/

## Services Monitored

### Ozone Services
- NOAA JPSS Satellite Data (OMPS)
- Legacy dminder Ozone Service

### Weather Services
- Apple WeatherKit
- Backup weather providers

### Backend Services
- dminder API endpoints

## How It Works

1. GitHub Actions run monitoring scripts every 15 minutes
2. Results are stored as JSON artifacts
3. Dashboard is updated via GitHub Pages
4. Alerts are sent via GitHub Issues when services fail

## Adding New Services

Edit the appropriate file in `monitors/` directory and add your service configuration.

## Local Development

```bash
npm install
npm test
npm run check-all
```

## Alert Configuration

Alerts can be configured to:
- Create GitHub Issues
- Send Slack notifications (webhook required)
- Email notifications (via GitHub Actions)