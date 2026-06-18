# Smart Mirror — AI Virtual Try-On

Kiosk-style smart mirror for virtual garment try-on: React frontend, Node/Express backend, Replicate (CATVTON / IDM-VTON), and multi-layer fallbacks (Sharp, MoveNet pose, optional ComfyUI).

## Documentation (thesis)

**Full technical documentation:** [docs/THESIS_SMART_MIRROR_DOCUMENTATION.md](docs/THESIS_SMART_MIRROR_DOCUMENTATION.md)

Includes abstract, architecture, AI pipeline, fallback design, APIs, session isolation, challenges/solutions, testing, and appendices.

## Quick start

```bash
# Backend (port 5000)
cd backend && cp .env.example .env && npm install && npm start

# Frontend (Vite)
cd frontend && cp .env.example .env && npm install && npm run dev
```

Set `REPLICATE_API_TOKEN` in `backend/.env` for live AI try-on. See `backend/.env.example` and `frontend/.env.example`.
