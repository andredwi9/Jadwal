"""FastAPI application entry point for SIMPEL PINTU."""

from fastapi import APIRouter, FastAPI

from app.routers.approvals import router as approvals_router
from app.routers.permohonan import router as permohonan_router

app = FastAPI(
    title="SIMPEL PINTU API",
    description="Backend REST API Sistem Informasi Manajemen Pelatihan Terpadu (1 Pintu)",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

api_router = APIRouter(prefix="/api")
api_router.include_router(permohonan_router)
api_router.include_router(approvals_router)


@api_router.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router)

