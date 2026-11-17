"""FastAPI application entry point for SIMPEL PINTU."""

from fastapi import FastAPI

from app.routers.approvals import router as approvals_router
from app.routers.permohonan import router as permohonan_router

app = FastAPI(
    title="SIMPEL PINTU API",
    description="Backend REST API Sistem Informasi Manajemen Pelatihan Terpadu (1 Pintu)",
    version="1.0.0",
)

app.include_router(permohonan_router)
app.include_router(approvals_router)


@app.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
