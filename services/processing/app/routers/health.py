from fastapi import APIRouter, Request
from sqlalchemy import text
from app.tasks.process_document import process_document

router = APIRouter()


@router.get("/health")
async def health_check():
    return {"status": "ok", "service": "inhale-processing"}


@router.get("/health/db")
async def db_health(request: Request):
    async with request.app.state.async_session() as session:
        await session.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}


@router.post("/extract/{document_id}")
async def extract_text(document_id: int):
    task = process_document.delay(document_id)
    return {"document_id": document_id, "task_id": task.id, "status": "queued"}
